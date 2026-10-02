// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardSnapshot } from '@/use/leaderboardSnapshot'

/**
 * ─── The offline ladder ─────────────────────────────────────────────────────
 *
 * THE BOARD MUST NEVER LOOK BROKEN. A leaderboard that says "Couldn't reach the
 * leaderboard" has failed twice — at the request, and at the player, who reads
 * it as a bug in the game.
 *
 * It is not a hypothetical failure. The Worker's D1 row-read allowance ran out
 * mid-afternoon and `/top` threw for every live build at once, with real
 * players on it. So the game shows the best board it has, and never says which:
 *
 *   1. this session's live fetch
 *   2. the cache written by a previous session
 *   3. the snapshot baked at build time
 *
 * These cases pin the ladder, the silence, and the one rule that keeps it from
 * becoming its own bug: a cached board must never stop the refresh.
 */

const ENDPOINT = 'https://board.example.test'
const CACHE_KEY = 'chaosmachine_board_cache'

const reply = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response

/** What the server would answer now. */
const LIVE_BOARD = {
  updatedAt: 1_700_000_500_000,
  total: 400,
  entries: [
    { rank: 1, name: 'Nia', score: 95, flair: 4000 },
    { rank: 2, name: 'Obi', score: 50, flair: 2000 }
  ]
}

/** What a previous session banked. Deliberately different from `LIVE_BOARD`, so
 *  "which board is on screen" is always decidable. */
const CACHED_BOARD = {
  updatedAt: 1_700_000_000_000,
  total: 300,
  entries: [
    { rank: 1, name: 'Ivy', score: 88, flair: 3000 },
    { rank: 2, name: 'Jo', score: 44, flair: 1500 }
  ]
}

const SNAPSHOT: BoardSnapshot = {
  updatedAt: 1_699_000_000_000,
  total: 24,
  entries: [{ rank: 1, name: 'Ace', score: 90, flair: 4000 }],
  dist: [[90, 1], [60, 2], [30, 1], [12, 4], [5, 6], [1, 10]]
}

const sent: string[] = []

const load = async (opts: {
  url?: string
  cache?: unknown
  snapshot?: BoardSnapshot | null
  handler?: () => Promise<Response>
} = {}) => {
  sent.length = 0
  const { url = ENDPOINT, cache, snapshot = null, handler } = opts

  vi.stubEnv('VITE_LEADERBOARD_URL', url)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  vi.stubGlobal('fetch', vi.fn(async (target: string) => {
    sent.push(target)
    return handler ? await handler() : reply(LIVE_BOARD)
  }))
  // Seeded AFTER the setup file's per-test storage swap, so it is really there
  // when the module reads it at import time.
  if (cache !== undefined) localStorage.setItem(CACHE_KEY, JSON.stringify(cache))

  vi.resetModules()
  vi.doMock('@/use/leaderboardSnapshot', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/use/leaderboardSnapshot')>()),
    boardSnapshot: snapshot
  }))
  return await import('@/use/useLeaderboard')
}

const names = (lb: { leaderboard: { value: { entries: { name: string }[] } | null } }): string[] =>
  lb.leaderboard.value?.entries.map((e) => e.name) ?? []

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('@/use/leaderboardSnapshot')
  vi.resetModules()
})

describe('a successful read is banked for the next session', () => {
  it('writes the board it just fetched', async () => {
    const lb = await load()
    await lb.ensureBoard()

    expect(lb.boardProvenance()).toBe('live')
    const written = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    expect(written.entries.map((e: { name: string }) => e.name)).toEqual(['Nia', 'Obi'])
  })

  it('banks the board a /score reply carries, without a second request', async () => {
    const lb = await load({ handler: async () => reply({ rank: 3, best: 20, total: 400, board: LIVE_BOARD }) })

    expect(await lb.submitScore(20, 500)).toBe(true)
    expect(sent.filter((u) => u.endsWith('/top'))).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null').total).toBe(400)
  })

  it('never banks a captive portal, and calls it a failure', async () => {
    const lb = await load({ handler: async () => reply('<html>login</html>') })
    await lb.ensureBoard()

    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(lb.leaderboardFailed.value).toBe(true)
  })
})

describe('a returning player never sees a spinner or an error', () => {
  it('has a board, a total and a rank before any request is made', async () => {
    const lb = await load({ cache: CACHED_BOARD })

    // Nothing has been awaited. This is the state of the very first paint.
    expect(sent).toHaveLength(0)
    expect(names(lb)).toEqual(['Ivy', 'Jo'])
    expect(lb.playerTotal.value).toBe(300)
    expect(lb.rankFor(50)).toBe(2)
    // The three states the modal renders instead of the table.
    expect(lb.leaderboardPending.value).toBe(false)
    expect(lb.leaderboardFailed.value).toBe(false)
    expect(lb.boardProvenance()).toBe('cache')
  })

  it('still refreshes — a cached board must not convince the game it has read', async () => {
    // The trap this guards: `ensureBoard` used to bail on `board.value !== null`,
    // which after seeding is true at boot. That would freeze every returning
    // player on the board they cached the first day they played.
    const lb = await load({ cache: CACHED_BOARD })
    await lb.ensureBoard()

    expect(sent).toEqual([`${ENDPOINT}/top`])
    expect(names(lb)).toEqual(['Nia', 'Obi'])
    expect(lb.boardProvenance()).toBe('live')
  })

  it('keeps the cached board on screen when the refresh fails', async () => {
    const lb = await load({
      cache: CACHED_BOARD,
      handler: async () => { throw new TypeError('Failed to fetch') }
    })
    await lb.ensureBoard()

    // `failed` is true — but nothing renders it, because the modal only shows
    // its failure copy when there are no entries, and there are.
    expect(lb.leaderboardFailed.value).toBe(true)
    expect(names(lb)).toEqual(['Ivy', 'Jo'])
    expect(lb.rankFor(50)).toBe(2)
    expect(lb.boardProvenance()).toBe('cache')
  })

  it('survives a corrupt or unparseable cache without throwing', async () => {
    localStorage.setItem(CACHE_KEY, '{not json')
    const lb = await load()
    expect(lb.leaderboard.value).toBeNull()
    await expect(lb.ensureBoard()).resolves.toBeUndefined()
  })
})

describe('the baked snapshot is the bottom rung, reached only on failure', () => {
  it('stands in when the fetch fails and the device has no cache', async () => {
    const lb = await load({
      snapshot: SNAPSHOT,
      handler: async () => { throw new TypeError('Failed to fetch') }
    })
    // Not seeded up front — a live build waits for its own answer first.
    expect(lb.leaderboard.value).toBeNull()

    await lb.ensureBoard()

    expect(lb.boardProvenance()).toBe('snapshot')
    expect(names(lb)).toEqual(['Ace'])
    // And it ranks from the histogram — an exact number, not the estimate the
    // bottom of the ladder would otherwise have had to make up.
    expect(lb.rankFor(5)).toBe(9)
  })

  it('is not seeded before a successful fetch, so the rank cannot change meaning', async () => {
    // Seeding the snapshot at boot would show a below-the-cut player an exact
    // rank from the histogram, then swap it for a number derived from the live
    // table a second later. A number that changes meaning under the player is a
    // worse bug than the blank this ladder exists to prevent.
    const lb = await load({ snapshot: SNAPSHOT })
    expect(lb.leaderboard.value).toBeNull()

    await lb.ensureBoard()
    expect(lb.boardProvenance()).toBe('live')
    expect(names(lb)).toEqual(['Nia', 'Obi'])
  })

  it('still ranks a PERSONAL RECORD whose write failed', async () => {
    // The case that shipped broken, and the one the player meets most: a new
    // best takes the WRITE path in `reportRun`, which used to `return` straight
    // after the POST. On a fresh device — a QA profile, a first session — that
    // meant nothing had ever loaded a board, so a failed POST left the result
    // screen with no rank at all and the chip hid itself.
    const lb = await load({
      snapshot: SNAPSHOT,
      handler: async () => { throw new TypeError('Failed to fetch') }
    })

    // Nothing cached and nothing fetched yet: this is a brand-new install.
    expect(lb.leaderboard.value).toBeNull()

    await lb.reportRun(42, 900)

    // It tried to post, then tried to read, and only then fell to the snapshot.
    expect(sent.length, 'reportRun gave up without trying a read').toBeGreaterThan(1)
    expect(lb.boardProvenance()).toBe('snapshot')
    // The whole point: `resultRank` renders `#${rankFor(best)}` and hides the
    // chip on 0, so this number is the difference between a rank and a blank.
    expect(lb.rankFor(42)).toBeGreaterThan(0)
    expect(lb.playerTotal.value).toBeGreaterThan(0)
  })

  it('does not spend a read when the write already brought a board back', async () => {
    // The quota contract still holds on the happy path: a successful POST
    // carries the board, so the added `ensureBoard` must no-op rather than
    // turning every personal record into a write AND a read.
    const lb = await load({
      handler: async () => reply({ rank: 3, best: 42, total: 400, board: LIVE_BOARD })
    })
    await lb.reportRun(42, 900)
    expect(sent.filter((u) => u.endsWith('/top')), 'a record cost a read as well as a write')
      .toHaveLength(0)
    expect(lb.boardProvenance()).toBe('live')
  })

  it('a climb costs ONE write, not one per stage', async () => {
    // The quota fix, from the client's side. `reportRun` fires on every cleared
    // stage and a good run beats its own best on nearly all of them, so a climb
    // to stage 42 used to be forty-two POSTs. Each carries the CURRENT best, so
    // skipping one loses nothing — the next carries the higher number.
    const lb = await load({
      handler: async () => reply({ rank: 9, best: 1, total: 400, board: LIVE_BOARD })
    })

    for (let stage = 1; stage <= 12; stage++) await lb.reportRun(stage, 100)

    const writes = sent.filter((u) => u.endsWith('/score'))
    expect(writes.length, `a 12-stage climb cost ${writes.length} writes`).toBe(1)
  })

  it('the end of a run always posts, however recently one went out', async () => {
    // The exception that keeps the board correct: the score a player FINISHED
    // on is the one that has to land, even if a mid-run write just happened.
    const lb = await load({
      handler: async () => reply({ rank: 9, best: 1, total: 400, board: LIVE_BOARD })
    })

    await lb.reportRun(3, 100)
    await lb.reportRun(7, 100)                      // throttled away
    await lb.reportRun(9, 100, { force: true })     // the run ended

    const writes = sent.filter((u) => u.endsWith('/score'))
    expect(writes).toHaveLength(2)
  })

  it('prefers the cache over the snapshot — it is newer and ranks the same way', async () => {
    const lb = await load({
      cache: CACHED_BOARD,
      snapshot: SNAPSHOT,
      handler: async () => { throw new TypeError('Failed to fetch') }
    })
    await lb.ensureBoard()

    expect(lb.boardProvenance()).toBe('cache')
    expect(names(lb)).toEqual(['Ivy', 'Jo'])
  })
})

describe('every rank is exact where a histogram exists', () => {
  /** A live `/top` payload: a hundred-row slice, plus the histogram for all
   *  2 345 players. The rows stop at score 30; the histogram does not. */
  const WITH_DIST = {
    updatedAt: 1_700_000_500_000,
    total: 2345,
    entries: [
      { rank: 1, name: 'Nia', score: 95, flair: 4000 },
      { rank: 2, name: 'Obi', score: 30, flair: 2000 }
    ],
    dist: [[95, 1], [60, 4], [30, 40], [12, 300], [5, 900], [1, 1100]]
  }

  it('ranks a player far below the published rows', async () => {
    const lb = await load({ handler: async () => reply(WITH_DIST) })
    await lb.ensureBoard()

    // Score 5 is below every published row. Before the histogram this was a
    // sentinel the result chip rendered as "#2+"; now it is counted exactly,
    // and the estimator at the bottom of the ladder is never reached.
    // 1 + 4 + 40 + 300 = 345 players above.
    expect(lb.rankFor(5)).toBe(346)
    expect(lb.playerTotal.value).toBe(2345)
  })

  it('keeps the tie rule the worker uses, so a submitted rank agrees', async () => {
    const lb = await load({ handler: async () => reply(WITH_DIST) })
    await lb.ensureBoard()
    // `COUNT(*) WHERE score > ?` + 1 — the 40 players on 30 are all #6.
    expect(lb.rankFor(30)).toBe(6)
    expect(lb.rankFor(95)).toBe(1)
  })

  it('carries the histogram into the cache, so the next session is exact too', async () => {
    const lb = await load({ handler: async () => reply(WITH_DIST) })
    await lb.ensureBoard()

    const again = await load({ cache: JSON.parse(localStorage.getItem(CACHE_KEY)!) })
    expect(again.rankFor(5)).toBe(346)
    expect(again.boardProvenance()).toBe('cache')
    void lb
  })

  it('falls back to the baked histogram for a cache written before this change', async () => {
    // The migration window: a returning player whose cached board is a
    // pre-histogram `/top` payload. Ranking it off the rows alone would show
    // "#1+" until their next successful read, so the snapshot answers instead.
    const lb = await load({ cache: CACHED_BOARD, snapshot: SNAPSHOT })
    expect(lb.leaderboard.value?.dist).toBeUndefined()
    expect(lb.rankFor(5)).toBe(9)
  })
})

describe('a board never publishes fewer players than rows', () => {
  it('clamps a population that is smaller than the entries beside it', async () => {
    // Seen live on a young board: the Worker's rows refresh on a 5-minute clock
    // and its histogram on a 60-minute one, so a board that grew inside the hour
    // shipped THREE rows with `total: 1`. The game rendered that as three names
    // above "You are #1 of 1 players" — a board contradicting itself, which
    // reads as broken rather than stale.
    //
    // The Worker enforces this now, but a cache banked by an older Worker (or an
    // older baked snapshot) cannot be re-issued, so the client refuses it too.
    const lb = await load({
      cache: {
        updatedAt: 1_700_000_000_000,
        total: 1,
        entries: [
          { rank: 1, name: 'Ada', score: 185, flair: 159 },
          { rank: 2, name: 'Bo', score: 16, flair: 19 },
          { rank: 3, name: 'Cy', score: 5, flair: 4 }
        ]
      },
      handler: async () => { throw new Error('offline') }
    })
    await lb.ensureBoard()

    expect(lb.playerTotal.value).toBe(3)
    expect(lb.leaderboard.value?.total).toBe(3)
  })

  it('leaves an honest population alone', async () => {
    const lb = await load({ cache: CACHED_BOARD, handler: async () => { throw new Error('offline') } })
    await lb.ensureBoard()
    // 300 players, 2 published rows — the normal shape, untouched.
    expect(lb.playerTotal.value).toBe(300)
  })
})

describe('the cache is a per-device cache, not player data', () => {
  it('stays out of the cloud save', async () => {
    // `isPayloadKey` uploads `cm_state` and anything prefixed `cm_`. This is
    // ~6 kB of PUBLIC data, identical for every player, and syncing it would
    // pay for the same hundred rows once per player on every save — against
    // Poki's 1 MB ceiling — to protect a device that has its own copy anyway.
    const { isPayloadKey } = await import('@/utils/save/SaveMergePolicy')
    expect(isPayloadKey(CACHE_KEY)).toBe(false)

    const lb = await load()
    await lb.ensureBoard()

    const { STATE_KEY } = await import('@/use/useGameState')
    const blob = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}')
    expect(JSON.stringify(blob)).not.toContain('Nia')
  })
})
