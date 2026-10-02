/**
 * ─── The seeded leaderboard ──────────────────────────────────────────────────
 *
 * Some portals forbid every request to a server of ours (Poki), or reject a
 * third-party storage URL found anywhere in the bundle (Yandex). Those builds
 * can neither read nor write the live board: the board baked into them is the
 * whole leaderboard for the life of the build.
 *
 * So it is MODELLED, from a stated retention curve, and it says so
 * (`source: "seeded:retention-curve"`). It carries only what a rank needs: the
 * population and a histogram of scores. It carries NO ROWS: a top-100 of
 * invented names would show made-up people to players as though they were
 * real. On a seeded build the rank badge works ("#412 of 2,400") and the
 * board's table is not offered.
 *
 * What is modelled is the quantity the game POSTS: the CAMPAIGN SCORE, the
 * sum of a player's best mission score at each of the five threat levels
 * (`src/game/state/progress.ts`, `campaignScore`). Not the level number.
 *
 * Everything comes from one seeded generator: re-running this reproduces the
 * committed file byte for byte.
 *
 *   node scripts/leaderboard-seed.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SEED_FILE = resolve(
  fileURLToPath(new URL('../data/leaderboard-seed.json', import.meta.url))
)

/**
 * Players on the board: everyone who has cleared the fortress at least once.
 * Sized to what a new hybrid-casual game plausibly has on one portal, not to
 * what looks impressive.
 */
export const TOTAL = 2400

/** The campaign's threat levels (`THREAT_LEVELS` in `sim/rewards.ts`; the test
 *  holds the two together). */
export const LEVELS = 5

/**
 * Of the players on the board, the share who have cleared AT LEAST this many
 * levels. Everyone has cleared one (that is what puts them on the board);
 * each further level loses a little under half of those who got that far.
 */
export const SURVIVAL = [1, 0.55, 0.28, 0.13, 0.05]

/**
 * A typical best score at each level, for a middling run: a few kills, found
 * out half the time, no medal. Mirrors `scoreOf` in `sim/rewards.ts` (a quiet
 * clear in par time is about 3 000 points at level I, and the level multiplies
 * it by 1 + 0.25 × (level − 1)). COPIES of the game's numbers: the test
 * re-derives them from the game's own module.
 */
export const TYPICAL = [2600, 3250, 3900, 4550, 5200]
/** The best a flawless run scores at each level: the model's ceiling. */
export const CEILING = [7600, 9500, 11400, 13300, 15200]

/** Scores are bucketed to this, which keeps the histogram to a few hundred
 *  entries. A real score falls between two buckets and is ranked exactly. */
const BUCKET = 25

/** Any fixed integer. */
const SEED = 20261002
/** The day the curve was written. A CONSTANT, so the file is reproducible. */
const SEED_EPOCH = Date.UTC(2026, 9, 2)

/** Deterministic PRNG: mulberry32. Same seed, same board, every run. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A standard normal draw. Two uniforms per draw, the spare half discarded:
 *  caching it would make each draw depend on how many came before. */
const normal = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r())

/**
 * One player's best score at a level: log-normal round the typical run, bent
 * toward the ceiling by a soft knee (never a hard clamp: a clamp puts every
 * outlier on one identical score).
 */
const levelBest = (r, level) => {
  const typical = TYPICAL[level - 1]
  const ceiling = CEILING[level - 1]
  const raw = typical * Math.exp(0.42 * normal(r))
  const knee = ceiling * 0.7
  if (raw <= knee) return Math.max(600, raw)
  const room = ceiling - knee
  return knee + room * (1 - Math.exp(-(raw - knee) / room))
}

export const buildSeed = () => {
  const r = rng(SEED)
  const buckets = new Map()
  for (let i = 0; i < TOTAL; i++) {
    // How many levels this player has cleared: walk the survival curve.
    const u = (i + 0.5) / TOTAL
    let cleared = 1
    while (cleared < LEVELS && u < SURVIVAL[cleared]) cleared++
    let score = 0
    for (let level = 1; level <= cleared; level++) score += levelBest(r, level)
    const b = Math.max(BUCKET, Math.round(score / BUCKET) * BUCKET)
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  const dist = [...buckets.entries()].sort((a, b) => b[0] - a[0])
  return {
    source: 'seeded:retention-curve',
    fetchedAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
    total: dist.reduce((a, [, n]) => a + n, 0),
    // No rows: see the header. The histogram alone ranks every player exactly.
    entries: [],
    dist
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const seed = buildSeed()
  mkdirSync(dirname(SEED_FILE), { recursive: true })
  writeFileSync(SEED_FILE, JSON.stringify(seed) + '\n', 'utf-8')
  const above = (x) => seed.dist.filter(([s]) => s > x).reduce((a, [, n]) => a + n, 0)
  const pct = (n) => `${((100 * n) / seed.total).toFixed(1)}%`
  console.log(`[seed] ${seed.total} players, ${seed.dist.length} score buckets, top ${seed.dist[0][0]}, bottom ${seed.dist[seed.dist.length - 1][0]}`)
  for (const x of [2000, 4000, 8000, 15000, 25000, 40000]) console.log(`[seed]   above ${String(x).padStart(6)}: ${String(above(x)).padStart(5)}  ${pct(above(x))}`)
  console.log(`[seed] wrote ${SEED_FILE}`)
}
