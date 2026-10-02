import { computed, ref, type ComputedRef } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { PORTAL_JOINED_KEY, PORTAL_POSTED_SCORE_KEY } from '@/keys'

/**
 * ─── A portal's OWN leaderboard, beside ours ────────────────────────────────
 *
 * Some portals run a board of their own: Playgama's SaaS leaderboard today.
 * This module is the platform-agnostic half of that. It knows nothing about any
 * SDK — the platform's plugin builds a `PortalBoardAdapter` and hands it over
 * with `setPortalBoard`, from its own boot branch.
 *
 * The injection is the point. `useLeaderboard` is imported by every build, and
 * a dynamic `import('@/utils/playgamaPlugin')` from here would be resolved by
 * Vite at TRANSFORM time — dragging the SDK glue into every portal's graph, and
 * refusing to build in a project that has no such file. The dependency points
 * the other way: the platform module imports this one.
 *
 * ── When it writes ──
 *
 *   • ON A WIN, and only there. The score is the deepest stage ever cleared, so
 *     the one moment a new value can exist is a stage clear — the scene calls
 *     `reportPortalBest` from its clear dispatch (`presentClear`), which every
 *     win path goes through: the stage-1 reward card, the stage 2-3 handover,
 *     the result card. A loss has nothing new to say and never posts. No
 *     throttle: a clear is at most one post per stage, and stages take 24-48 s.
 *   • ONCE ON ARRIVAL, for a player with no row yet (`joinPortalBoard`, from the
 *     scene's setup). A first-time player is posted at stage 0, so they start
 *     as the LAST row of the portal's board rather than being absent from it; a
 *     returning player who predates the board is posted at their current best.
 *     Only on an `in_game` board — never as a 0 to YouTube's native one.
 *
 * ── The rules it keeps ──
 *
 *   • NOTHING HERE MAY THROW, BLOCK OR DELAY A RUN. Every entry point resolves.
 *   • A write is remembered only after the portal accepted it, so a failed one
 *     is retried by the next clear instead of being forgotten.
 *   • NEVER LOOK BROKEN. A portal board that fails to load does not show an
 *     error: its tab disappears and the player is left on ours.
 *   • SHOWN, never RANKED against. The result screen's "#1,130 of 2,531" stays
 *     on our board; two rank sources that disagree on one screen read as a bug,
 *     a separate labelled tab does not.
 */

/**
 * `bridge.leaderboards.type`, which decides everything the game may do:
 *
 *   in_game       submit, and draw the rows ourselves (Playgama SaaS)
 *   native        submit only — the platform draws it (YouTube Playables)
 *   native_popup  submit, the platform opens an overlay
 *   not_available nothing at all
 */
export type PortalBoardMode = 'in_game' | 'native' | 'native_popup' | 'not_available'

const MODES: ReadonlyArray<PortalBoardMode> = ['in_game', 'native', 'native_popup', 'not_available']

export interface PortalBoardEntry {
  rank: number
  name: string
  score: number
  /** Matched by the PORTAL's player id, which the portal's board publishes —
   *  unlike ours, which highlights by name because it publishes no ids. */
  isYou: boolean
  /** A row drawn on this device for a player the fetched rows do not contain
   *  yet — never a row the portal returned. */
  local?: boolean
}

export interface PortalBoardAdapter {
  /** The portal's name, shown on the tab. A proper noun — not translated. */
  label: string
  mode: () => PortalBoardMode
  /** Resolves `true` only when the portal accepted the score. May reject. */
  submit: (score: number) => Promise<boolean>
  /** The rows, or `null` when the answer was not a board. May reject. */
  entries: () => Promise<PortalBoardEntry[] | null>
}

let adapter: PortalBoardAdapter | null = null
const label = ref<string | null>(null)
const mode = ref<PortalBoardMode>('not_available')
const rows = ref<PortalBoardEntry[] | null>(null)
const pending = ref(false)
const failed = ref(false)
/** The best this session knows of, reactive so the local row follows it. */
const knownBest = ref(0)
/** Whether the rows on hand are current. Cleared after a successful write, so
 *  the next open shows the row the player just earned. */
let fresh = false
/** A join requested before the SDK came up; replayed on registration. */
let joinRequested = false
/** Writes run one at a time, and each re-reads the bookkeeping when it runs —
 *  so a clear that lands while the join is in flight still posts afterwards. */
let queue: Promise<void> = Promise.resolve()

const readMode = (a: PortalBoardAdapter): PortalBoardMode => {
  try {
    const m = a.mode()
    return MODES.includes(m) ? m : 'not_available'
  } catch {
    return 'not_available'
  }
}

/** Re-read after every call into the adapter: it may latch itself off (a board
 *  the portal says does not exist), and the tab has to follow. */
const syncMode = (a: PortalBoardAdapter): void => {
  if (adapter === a) mode.value = readMode(a)
}

const readPosted = (): number => {
  try {
    return Math.max(0, Math.trunc(Number(getState(PORTAL_POSTED_SCORE_KEY, 0)) || 0))
  } catch {
    return 0
  }
}

const readJoined = (): boolean => {
  try {
    return getState<boolean>(PORTAL_JOINED_KEY, false) === true
  } catch {
    return false
  }
}

const toScore = (n: unknown): number => Math.max(0, Math.trunc(Number(n) || 0))

export const portalBoardLabel: ComputedRef<string | null> = computed(() => label.value)
export const portalBoardMode: ComputedRef<PortalBoardMode> = computed(() => mode.value)
/**
 * Whether the leaderboard modal may offer the portal's tab: only for `in_game`
 * (a `native` board is drawn by the platform and has no rows for us), and not
 * once a read has failed. Reopening the modal retries.
 */
export const portalBoardVisible: ComputedRef<boolean> = computed(() =>
  label.value !== null && mode.value === 'in_game' && !failed.value)

/**
 * The rows to draw — the portal's, plus this player at the BOTTOM when they
 * have not cleared a stage and the portal's rows do not contain them yet.
 *
 * That covers the moment between arriving and the stage-0 join post landing
 * (or a join the portal refused, or a guest the portal has no id for): the
 * first-time player still sees themselves where they start, last. Placed at the
 * rank the bottom already shares when others sit on stage 0 too, so ties read
 * as ties. Only for an unplayed player: someone with a real best who is missing
 * from the returned rows is outside a truncated list, and "last" would be a lie.
 */
export const portalEntries: ComputedRef<PortalBoardEntry[]> = computed(() => {
  const list = rows.value ?? []
  if (rows.value === null || knownBest.value > 0 || list.some((e) => e.isYou)) return list
  const zeroRank = list.find((e) => e.score <= 0)?.rank
  // No name: the modal labels a nameless row "Player", and the "You" tag says
  // whose it is. Reading a portal name here would buy nothing and would be a
  // player-name read on the YouTube Playables build, where names are PII.
  return [...list, { rank: zeroRank ?? list.length + 1, name: '', score: 0, isYou: true, local: true }]
})
export const portalBoardLoaded: ComputedRef<boolean> = computed(() => rows.value !== null)
export const portalBoardPending: ComputedRef<boolean> = computed(() => pending.value)

/**
 * Called once, by the platform's plugin, after its SDK initialised. Replays a
 * join the scene asked for before the SDK came up.
 */
export const setPortalBoard = (next: PortalBoardAdapter | null): void => {
  adapter = next
  label.value = next?.label ?? null
  mode.value = next ? readMode(next) : 'not_available'
  rows.value = null
  failed.value = false
  fresh = false
  if (next && joinRequested) void joinPortalBoard(knownBest.value)
}

/**
 * Load the portal's rows. Called when the modal opens — never on mount, most
 * sessions never open it. Idempotent while the rows are fresh.
 */
export const ensurePortalBoard = async (): Promise<void> => {
  const a = adapter
  if (!a || mode.value !== 'in_game' || fresh || pending.value) return
  pending.value = true
  try {
    const next = await a.entries()
    if (adapter !== a) return
    syncMode(a)
    if (!Array.isArray(next)) {
      failed.value = true
      return
    }
    rows.value = next
    fresh = true
    failed.value = false
  } catch {
    if (adapter === a) failed.value = true
  } finally {
    pending.value = false
  }
}

/**
 * One queued write. `shouldPost` is evaluated when the write RUNS, against the
 * bookkeeping as it is then, so back-to-back requests never post twice.
 */
const enqueue = (a: PortalBoardAdapter, shouldPost: () => number | null): Promise<void> => {
  queue = queue.then(async () => {
    try {
      if (adapter !== a || mode.value === 'not_available') return
      const score = shouldPost()
      if (score === null) return
      let ok = false
      try {
        ok = (await a.submit(score)) === true
      } catch {
        ok = false
      }
      syncMode(a)
      if (!ok) return
      if (score > readPosted()) setState(PORTAL_POSTED_SCORE_KEY, score)
      if (!readJoined()) setState(PORTAL_JOINED_KEY, true)
      fresh = false
    } catch { /* the queue must never reject */ }
  })
  return queue
}

/**
 * Post the player's lifetime best after a WIN. Posts only when it beats what
 * the portal already accepted.
 */
export const reportPortalBest = (best: number): Promise<void> => {
  try {
    const score = toScore(best)
    if (score > knownBest.value) knownBest.value = score
    const a = adapter
    if (!a || mode.value === 'not_available') return Promise.resolve()
    return enqueue(a, () => (knownBest.value > readPosted() ? knownBest.value : null))
  } catch {
    return Promise.resolve()
  }
}

/**
 * Give this player a row on arrival, once per player (not per session).
 *
 * A first-time player is posted at their best — 0 — so they begin as the last
 * row of the portal's board. `in_game` boards only: a native board (YouTube)
 * shows the player's own best to themselves, and a 0 there says nothing.
 */
export const joinPortalBoard = (best: number): Promise<void> => {
  try {
    const score = toScore(best)
    if (score > knownBest.value) knownBest.value = score
    joinRequested = true
    const a = adapter
    if (!a) return Promise.resolve()
    if (mode.value !== 'in_game') {
      // Still carry a best the portal has not seen — a native board wants that.
      return mode.value === 'not_available' ? Promise.resolve() : reportPortalBest(score)
    }
    return enqueue(a, () => {
      const posted = readPosted()
      if (knownBest.value > posted) return knownBest.value
      return readJoined() ? null : knownBest.value
    })
  } catch {
    return Promise.resolve()
  }
}
