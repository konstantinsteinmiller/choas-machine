/**
 * ─── The baked leaderboard ──────────────────────────────────────────────────
 *
 * Fetches the live board from the Cloudflare Worker and writes it to
 * `data/leaderboard-snapshot.json`, which `vite.config.ts` then ships as the
 * virtual module `virtual:leaderboard-snapshot`.
 *
 * WHY A BUILD-TIME COPY EXISTS AT ALL. Two of the portals forbid the runtime
 * request the board is normally made of — Poki bans every external runtime
 * request outright, and Yandex's moderators reject third-party storage URLs —
 * so both builds ship `VITE_LEADERBOARD_URL` empty and, until now, simply had
 * no leaderboard. A snapshot is not a workaround for those rules: it is inside
 * them. The bytes are part of the bundle, and the game makes no request.
 *
 * WHY THE HISTOGRAM AND NOT JUST THE TOP 100. `/top` publishes 100 rows, and on
 * a board of a few thousand that cut sits far above where a first-session
 * player ever gets. Rows alone could tell 4 % of players exactly where they
 * stand and leave the other 96 % — including everyone in the session Poki's fit
 * test grades — on an estimate. So `/top` also carries a histogram of the WHOLE
 * population, and that is what both this snapshot and the live game rank
 * against. Baking it costs about a kilobyte and makes every rank exact.
 *
 * Run it by hand before a portal build:
 *
 *     pnpm leaderboard:snapshot
 *
 * The build refreshes it too, but never fails on it — see `readSnapshot`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The board's public origin.
 *
 * Hardcoded as the default on purpose. It is already public — every live build
 * ships it in `VITE_LEADERBOARD_URL` — and the alternative is a build-time
 * secret in a gitignored `.env`, which means a fresh clone silently bakes
 * nothing. Override with `LEADERBOARD_SNAPSHOT_URL` for a staging worker.
 *
 * Deliberately NOT read from `VITE_LEADERBOARD_URL`: the builds that need this
 * are precisely the builds that set that variable to empty.
 */
export const DEFAULT_SOURCE = 'https://chaos-machine-leaderboard.{{SUBDOMAIN}}.workers.dev'

export const SNAPSHOT_FILE = resolve(
  fileURLToPath(new URL('../data/leaderboard-snapshot.json', import.meta.url))
)

/** Long enough for a cold D1 read, short enough that a hung socket cannot sit
 *  in front of a build for minutes. */
const TIMEOUT_MS = 15_000

const getJson = async (url, signal) => {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    // Drain it. An unread body holds the socket open, and on Windows that is
    // enough to make an immediate `process.exit` trip a libuv assertion on a
    // handle that is still closing.
    await res.arrayBuffer().catch(() => {})
    throw new Error(`${url} → HTTP ${res.status}`)
  }
  return await res.json()
}

/**
 * Validate a `/top` response into the shape the game reads.
 *
 * Everything here is remote input — the same rule the client applies to the
 * live board. A captive proxy answering 200 with an HTML login page parses as
 * JSON in some setups and proves nothing about shape, and a build must never
 * bake a half-formed board and ship it to a portal.
 *
 * `total` is summed from the HISTOGRAM rather than copied from the response's
 * own field: ranks are derived from those buckets, so the total has to be the
 * one they add up to or the game can print "#1204 of 1203".
 */
export const buildSnapshot = (top, source) => {
  if (!top || typeof top !== 'object') throw new Error('/top was not an object')
  if (!Array.isArray(top.entries)) throw new Error('/top had no entries array')
  if (!Array.isArray(top.dist)) {
    throw new Error('/top carried no histogram — deploy the Worker in worker/ first')
  }

  const entries = top.entries
    .filter((e) => e && typeof e === 'object')
    .map((e, i) => ({
      rank: Number(e.rank) || i + 1,
      name: typeof e.name === 'string' ? e.name : '',
      score: Number(e.score) || 0,
      flair: Number(e.flair) || 0
    }))

  const buckets = top.dist
    .filter((b) => Array.isArray(b) && b.length === 2)
    .map(([score, n]) => [Math.trunc(Number(score) || 0), Math.trunc(Number(n) || 0)])
    .filter(([score, n]) => score > 0 && n > 0)
    // Score-DESC is what the rank walk depends on to stop early. The Worker
    // already orders it; re-sorting here means a future change at that end
    // cannot quietly turn every rank into a wrong one.
    .sort((a, b) => b[0] - a[0])

  if (buckets.length === 0) throw new Error('/top had no usable histogram buckets')

  const total = buckets.reduce((sum, [, n]) => sum + n, 0)
  if (total <= 0) throw new Error('the histogram summed to no players')

  return {
    source,
    fetchedAt: Date.now(),
    updatedAt: Number(top.updatedAt) || Date.now(),
    total,
    entries,
    dist: buckets
  }
}

/** Fetch the board and write the file. Throws on any failure — the CLI wants to
 *  know, the build wraps it. */
export const refreshSnapshot = async (source = process.env.LEADERBOARD_SNAPSHOT_URL || DEFAULT_SOURCE) => {
  const origin = source.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let top
  try {
    top = await getJson(`${origin}/top`, controller.signal)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  const snapshot = buildSnapshot(top, origin)
  mkdirSync(dirname(SNAPSHOT_FILE), { recursive: true })
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8')
  return snapshot
}

/**
 * Read whatever is on disk, or `null`.
 *
 * The file is committed, so a build with no network — an offline laptop, a CI
 * box with no egress, a worker that is down — still bakes the last known board
 * instead of shipping a build with the feature silently missing.
 */
export const readSnapshot = () => {
  if (!existsSync(SNAPSHOT_FILE)) return null
  try {
    const parsed = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf-8'))
    if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.dist)) return null
    if (!(Number(parsed.total) > 0)) return null
    return parsed
  } catch {
    return null
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // `--soft` never fails. It is what the `build:*` scripts use: a portal build
  // must not be blocked because the board was briefly unreachable, and the
  // committed snapshot is a perfectly good stand-in. Run bare (no flag) to have
  // a refresh you asked for tell you it did not happen.
  const soft = process.argv.includes('--soft')
  try {
    const snap = await refreshSnapshot()
    const [topScore] = snap.dist[0]
    const cut = snap.entries.at(-1)?.score ?? 0
    console.log(
      `[leaderboard] ${snap.total} players, ${snap.entries.length} published rows, `
      + `top score ${topScore}, top-100 cut at ${cut}`
    )
    console.log(`[leaderboard] wrote ${SNAPSHOT_FILE}`)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    if (soft) {
      console.warn(`[leaderboard] refresh skipped (${why}) — keeping the committed snapshot.`)
    } else {
      console.error(`[leaderboard] refresh FAILED: ${why}`)
      // `exitCode`, not `process.exit()`: the latter tears the loop down while
      // undici's sockets are still closing and trips a libuv assertion on
      // Windows. The caller still sees a non-zero status.
      process.exitCode = 1
    }
  }
}
