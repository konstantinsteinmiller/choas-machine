import snapshot from 'virtual:leaderboard-snapshot'

/**
 * ─── The board, frozen at build time ────────────────────────────────────────
 *
 * A thin re-export of the virtual module, and the whole reason it exists is
 * that a virtual id is awkward to substitute in a test. Everything the game
 * reads goes through this module, so a spec can hand `useLeaderboard` a board
 * with `vi.doMock('@/use/leaderboardSnapshot', …)` and never touch the plugin.
 *
 * `null` on every build with a live endpoint. Present only where the portal
 * forbids the request — see `scripts/leaderboard-snapshot.mjs` for why the
 * histogram is baked alongside the top-100 rather than the rows alone.
 */

export interface SnapshotEntry {
  rank: number
  name: string
  score: number
  flair: number
}

export interface BoardSnapshot {
  /** When the WORKER built this board, not when the bundle was built. */
  updatedAt: number
  /** Every player on the board, not just the published rows. */
  total: number
  /** The published top-N, for the modal's list. */
  entries: SnapshotEntry[]
  /** `[score, howManyPlayersHaveIt]`, ordered score DESC. */
  dist: [number, number][]
}

export const boardSnapshot: BoardSnapshot | null = snapshot

/**
 * The rank a score holds against a score histogram.
 *
 * Byte-for-byte the Worker's own definition — `COUNT(*) WHERE score > ?` + 1 —
 * so the number is the same whether it came from the live board, the cache or
 * the baked snapshot. Ties share a rank: two players on the same score are both #7
 * and nobody is #8.
 *
 * The buckets are score-DESC, so the walk stops at the first bucket that is not
 * strictly greater. A board of a few thousand players has a couple of hundred
 * distinct scores and a typical player sits deep in the tail, so this is a few
 * dozen iterations on a screen that appears once per run.
 */
export const rankFromDist = (
  dist: readonly (readonly [number, number])[],
  score: number
): number => {
  let above = 0
  for (const [bucketScore, count] of dist) {
    if (bucketScore <= score) break
    above += count
  }
  return above + 1
}
