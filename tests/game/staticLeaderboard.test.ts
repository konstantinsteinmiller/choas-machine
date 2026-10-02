// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardSnapshot } from '@/use/leaderboardSnapshot'

/**
 * ─── The board, baked at build time ─────────────────────────────────────────
 *
 * Poki forbids every external runtime request and Yandex rejects third-party
 * storage URLs at moderation, so both builds ship `VITE_LEADERBOARD_URL` empty.
 * Until now that meant no leaderboard at all. They now ship a copy of the board
 * taken when the bundle was built, and rank the player against it.
 *
 * Two properties carry the whole feature, and they pull in opposite directions:
 *
 *   THE GAME MUST SHOW A RANK.      THE GAME MUST MAKE NO REQUEST.
 *
 * Every case below pins one or the other. The endpoint is read from
 * `import.meta.env` once at module scope and the snapshot is imported once at
 * module scope, so each case re-imports under `vi.resetModules()` — which is
 * exactly how the real thing is decided: at build time, never at runtime.
 */

/**
 * A board shaped like the real one: a long tail, a deliberate TIE, and a
 * published slice far smaller than the population — which is the whole problem
 * the histogram exists to solve.
 *
 * 24 players. The four published rows cut off at score 30, so scores 1–29 are
 * below every row the old code could see.
 */
const SNAPSHOT: BoardSnapshot = {
  updatedAt: 1_700_000_000_000,
  total: 24,
  entries: [
    { rank: 1, name: 'Ace', score: 90, flair: 4000 },
    { rank: 2, name: 'Bex', score: 60, flair: 2100 },
    { rank: 2, name: 'Cyd', score: 60, flair: 1800 },
    { rank: 4, name: 'Dov', score: 30, flair: 900 }
  ],
  // score DESC. 1 + 2 + 1 + 4 + 6 + 10 = 24.
  dist: [[90, 1], [60, 2], [30, 1], [12, 4], [5, 6], [1, 10]]
}

const sent: string[] = []

const reply = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const load = async (
  snapshot: BoardSnapshot | null,
  url = '',
  handler: () => Promise<Response> = async () => reply(LIVE_BOARD)
) => {
  sent.length = 0
  vi.stubEnv('VITE_LEADERBOARD_URL', url)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  vi.stubGlobal('fetch', vi.fn(async (target: string) => {
    sent.push(target)
    return await handler()
  }))
  vi.resetModules()
  // Only `boardSnapshot` is substituted — `rankFromDist` stays real, because
  // it is the thing under test in half of these cases.
  vi.doMock('@/use/leaderboardSnapshot', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/use/leaderboardSnapshot')>()),
    boardSnapshot: snapshot
  }))
  return await import('@/use/useLeaderboard')
}

/** What a LIVE endpoint would answer, to prove a snapshot cannot outrank it.
 *  Two published rows and a histogram covering all 250 players. */
const LIVE_BOARD = {
  updatedAt: 1_700_000_000_001,
  total: 250,
  entries: [
    { rank: 1, name: 'Zed', score: 80, flair: 1200 },
    { rank: 2, name: 'Yan', score: 40, flair: 900 }
  ],
  dist: [[80, 1], [40, 1], [10, 48], [2, 200]]
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('@/use/leaderboardSnapshot')
  vi.resetModules()
})

describe('a baked build has a board and still makes no request', () => {
  it('never touches the network, from any entry point', async () => {
    const lb = await load(SNAPSHOT)

    await lb.reportRun(42, 900)
    await lb.ensureBoard()
    expect(await lb.submitScore(42, 900)).toBe(false)

    // The one thing Poki actually grades this on.
    expect(sent).toHaveLength(0)
  })

  it('turns the UI on — the chip, the button and the modal all read this', async () => {
    const lb = await load(SNAPSHOT)
    expect(lb.leaderboardEnabled).toBe(true)
  })

  it('still ships nothing at all when the build baked no snapshot', async () => {
    const lb = await load(null)
    expect(lb.leaderboardEnabled).toBe(false)
    expect(lb.rankFor(42)).toBe(0)
    expect(sent).toHaveLength(0)
  })
})

describe('the rank covers the whole population, not the published slice', () => {
  it('ranks a first-session player who is below every published row', async () => {
    const lb = await load(SNAPSHOT)

    // Score 5 is far below the published cut of 30. The old top-100 derivation
    // could only have said "#100+" here, which is what made the feature
    // worthless for exactly the new player it is meant to hook.
    // 1 + 2 + 1 + 4 = 8 players above score 5.
    expect(lb.rankFor(5)).toBe(9)
  })

  it('moves the number every time the score does, which is the entire point', async () => {
    const lb = await load(SNAPSHOT)
    const climb = [1, 5, 12, 30, 60, 90].map((s) => lb.rankFor(s))
    expect(climb).toEqual([15, 9, 5, 4, 2, 1])
    // Strictly improving — a rank that plateaus buys no extra run.
    expect([...climb].sort((a, b) => b - a)).toEqual(climb)
  })

  it('counts strictly greater scores, so ties share a rank exactly as the worker does', async () => {
    const lb = await load(SNAPSHOT)
    // The worker computes `COUNT(*) WHERE score > ?` + 1. Both players on 60
    // are #2 and nobody is #3.
    expect(lb.rankFor(60)).toBe(2)
    // One player (Ace, 90) is above 61.
    expect(lb.rankFor(61)).toBe(2)
    expect(lb.rankFor(30)).toBe(4)
  })

  it('gives #1 to a score past the top of a stale board', async () => {
    const lb = await load(SNAPSHOT)
    expect(lb.rankFor(91)).toBe(1)
    expect(lb.rankFor(9999)).toBe(1)
  })

  it('never claims a standing before the player has scored', async () => {
    const lb = await load(SNAPSHOT)
    // Same rule as the live board: 0 hides the cell rather than congratulating
    // a fresh install with "#15 of 24" on the first screen it ever shows.
    expect(lb.rankFor(0)).toBe(0)
    expect(lb.rankFor(-3)).toBe(0)
  })
})

describe('the chip reads exactly as it does on a live build', () => {
  it('publishes the population, so the cell can say "of N"', async () => {
    const lb = await load(SNAPSHOT)
    // `resultRank` renders `#${rankFor(best)}` and appends `of {n}` only once
    // `playerTotal` is non-zero. Both are true before the first run ends.
    expect(lb.playerTotal.value).toBe(24)
    expect(lb.rankFor(12)).toBe(5)
  })

  it('is answerable immediately — no pending, no failure, no "…" placeholder', async () => {
    const lb = await load(SNAPSHOT)
    // The live path needs a fetch before it can say anything, and the chip
    // shows an ellipsis meanwhile. A baked board has its answer at module load.
    expect(lb.leaderboardPending.value).toBe(false)
    expect(lb.leaderboardFailed.value).toBe(false)
    expect(lb.leaderboard.value?.entries).toHaveLength(4)
    expect(lb.boardSize.value).toBe(4)
  })
})

describe('a live build prefers its own board in every respect', () => {
  it('takes rows, total and rank from the live payload, not the snapshot', async () => {
    const lb = await load(SNAPSHOT, 'https://board.example.test')

    await lb.ensureBoard()
    expect(sent).toEqual(['https://board.example.test/top'])
    expect(lb.playerTotal.value).toBe(250)

    // From the LIVE histogram (250 players), not the snapshot's (24) — which
    // would have said 4 for a score of 41 and 15 for a score of 3.
    expect(lb.rankFor(41)).toBe(2)
    expect(lb.rankFor(3)).toBe(51)
  })

  it('borrows the baked histogram when the live payload has none', async () => {
    // A board cached or served by something predating the histogram. Ranking
    // off the two published rows alone is what produced `#100+`; the snapshot
    // is a few weeks stale but it can answer EXACTLY, so it is preferred over
    // the estimator below it.
    const { dist: _drop, ...noDist } = LIVE_BOARD
    const lb = await load(SNAPSHOT, 'https://board.example.test', async () => reply(noDist))

    await lb.ensureBoard()
    // 1 + 2 + 1 + 4 + 6 = 14 snapshot players above score 3.
    expect(lb.rankFor(3)).toBe(15)
  })
})
