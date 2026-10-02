// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PORTAL_JOINED_KEY, PORTAL_POSTED_SCORE_KEY } from '@/keys'
import type { PortalBoardAdapter, PortalBoardEntry, PortalBoardMode } from '@/use/usePortalLeaderboard'

/**
 * ─── The portal's own board (Playgama SaaS), beside ours ────────────────────
 *
 * Two halves. The portal layer is platform-agnostic: it posts on a WIN (when
 * the best beats what the portal accepted), enters a first-time player once at
 * stage 0 so they start as the last row, and shows a tab only while the portal
 * hands it rows. The adapter that feeds it for Playgama has its own suite
 * (`templates/playgama/playgamaLeaderboard.test.ts`).
 *
 * Every case loads fresh modules: the layer keeps session state at module
 * scope, exactly as a page load does.
 */

const load = async () => {
  vi.resetModules()
  const state = await import('@/use/useGameState')
  const portal = await import('@/use/usePortalLeaderboard')
  return { ...portal, state }
}

/** Settle the write queue: a chain of resolved promises, no timers. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const fakeAdapter = (o: {
  mode?: PortalBoardMode
  submit?: (score: number) => Promise<boolean>
  entries?: () => Promise<PortalBoardEntry[] | null>
} = {}) => {
  const posted: number[] = []
  let reads = 0
  const adapter: PortalBoardAdapter = {
    label: 'Playgama',
    mode: () => o.mode ?? 'in_game',
    submit: async (score) => {
      posted.push(score)
      return o.submit ? o.submit(score) : true
    },
    entries: async () => {
      reads++
      return o.entries ? o.entries() : [{ rank: 1, name: 'Ada', score: 12, isYou: false }]
    }
  }
  return { adapter, posted, reads: () => reads }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('a win posts the new best — and nothing else does', () => {
  it('does nothing — and resolves — with no portal board registered', async () => {
    const { reportPortalBest, joinPortalBoard, portalBoardVisible } = await load()
    await expect(reportPortalBest(12)).resolves.toBeUndefined()
    await expect(joinPortalBoard(0)).resolves.toBeUndefined()
    expect(portalBoardVisible.value).toBe(false)
  })

  it('posts a best once, and remembers it only after the portal accepted it', async () => {
    const { reportPortalBest, setPortalBoard, state } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)

    await reportPortalBest(7)
    await settle()
    expect(fake.posted).toEqual([7])
    expect(state.getState(PORTAL_POSTED_SCORE_KEY, 0)).toBe(7)

    // The same best again, or a lower one, costs nothing.
    await reportPortalBest(7)
    await reportPortalBest(5)
    await settle()
    expect(fake.posted).toEqual([7])
  })

  it('posts every consecutive win — no throttle, a clear is the cadence', async () => {
    const { reportPortalBest, setPortalBoard } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    for (let stage = 1; stage <= 5; stage++) await reportPortalBest(stage)
    await settle()
    expect(fake.posted).toEqual([1, 2, 3, 4, 5])
  })

  it('never double-posts two reports that land in the same tick', async () => {
    const { reportPortalBest, setPortalBoard } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    void reportPortalBest(4)
    void reportPortalBest(4)
    await settle()
    expect(fake.posted).toEqual([4])
  })

  it('retries a post the portal refused on the next win, instead of forgetting it', async () => {
    const { reportPortalBest, setPortalBoard, state } = await load()
    let accept = false
    const fake = fakeAdapter({ submit: async () => accept })
    setPortalBoard(fake.adapter)

    await reportPortalBest(9)
    await settle()
    expect(state.getState(PORTAL_POSTED_SCORE_KEY, 0)).toBe(0)

    accept = true
    await reportPortalBest(9)
    await settle()
    expect(fake.posted).toEqual([9, 9])
    expect(state.getState(PORTAL_POSTED_SCORE_KEY, 0)).toBe(9)
  })

  it('swallows an adapter that throws', async () => {
    const { reportPortalBest, setPortalBoard, state } = await load()
    setPortalBoard(fakeAdapter({ submit: async () => { throw new Error('network') } }).adapter)
    await expect(reportPortalBest(4)).resolves.toBeUndefined()
    expect(state.getState(PORTAL_POSTED_SCORE_KEY, 0)).toBe(0)
  })

  it('never posts where the portal has no board', async () => {
    const { reportPortalBest, joinPortalBoard, setPortalBoard, portalBoardVisible } = await load()
    const fake = fakeAdapter({ mode: 'not_available' })
    setPortalBoard(fake.adapter)
    await joinPortalBoard(0)
    await reportPortalBest(10)
    await settle()
    expect(fake.posted).toEqual([])
    expect(portalBoardVisible.value).toBe(false)
  })

  it('posts a win to a native board (YouTube) but offers no tab — the platform draws it', async () => {
    const { reportPortalBest, setPortalBoard, portalBoardVisible, ensurePortalBoard } = await load()
    const fake = fakeAdapter({ mode: 'native' })
    setPortalBoard(fake.adapter)
    await reportPortalBest(10)
    await ensurePortalBoard()
    await settle()
    expect(fake.posted).toEqual([10])
    expect(fake.reads()).toBe(0)
    expect(portalBoardVisible.value).toBe(false)
  })
})

describe('a first-time player starts as the last row', () => {
  it('is posted once at stage 0 on arrival, and marked as joined', async () => {
    const { joinPortalBoard, setPortalBoard, state } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)

    await joinPortalBoard(0)
    await settle()
    expect(fake.posted).toEqual([0])
    expect(state.getState(PORTAL_JOINED_KEY, false)).toBe(true)

    // Once per PLAYER: the next session's arrival posts nothing.
    await joinPortalBoard(0)
    await settle()
    expect(fake.posted).toEqual([0])
  })

  it('is posted at the real best when the player predates the board', async () => {
    const { joinPortalBoard, setPortalBoard, state } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    await joinPortalBoard(14)
    await settle()
    expect(fake.posted).toEqual([14])
    expect(state.getState(PORTAL_POSTED_SCORE_KEY, 0)).toBe(14)
  })

  it('then posts the first win after the stage-0 row', async () => {
    const { joinPortalBoard, reportPortalBest, setPortalBoard } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    await joinPortalBoard(0)
    await settle()
    await reportPortalBest(1)
    await settle()
    expect(fake.posted).toEqual([0, 1])
  })

  it('coalesces a join and a win that race into ONE post of the higher value', async () => {
    // Each queued write decides what to send when it RUNS, so a win reported
    // before the join went out makes the join carry the win — no pointless 0.
    const { joinPortalBoard, reportPortalBest, setPortalBoard, state } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    void joinPortalBoard(0)
    void reportPortalBest(1)
    await settle()
    expect(fake.posted).toEqual([1])
    expect(state.getState(PORTAL_JOINED_KEY, false)).toBe(true)
  })

  it('joins once the SDK comes up, when the scene asked before it did', async () => {
    const { joinPortalBoard, setPortalBoard } = await load()
    await joinPortalBoard(0)
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    await settle()
    expect(fake.posted).toEqual([0])
  })

  it('never sends a 0 to a native board', async () => {
    const { joinPortalBoard, setPortalBoard } = await load()
    const fake = fakeAdapter({ mode: 'native' })
    setPortalBoard(fake.adapter)
    await joinPortalBoard(0)
    await settle()
    expect(fake.posted).toEqual([])
  })

  it('shows the unplayed player at the bottom of the tab until the portal lists them', async () => {
    const { setPortalBoard, ensurePortalBoard, joinPortalBoard, portalEntries } = await load()
    // The join is refused (a guest the portal has no id for), so the fetched
    // rows never contain this player.
    const fake = fakeAdapter({
      submit: async () => false,
      entries: async () => [
        { rank: 1, name: 'Ace', score: 41, isYou: false },
        { rank: 2, name: 'Bex', score: 9, isYou: false }
      ]
    })
    setPortalBoard(fake.adapter)
    await joinPortalBoard(0)
    await ensurePortalBoard()
    expect(portalEntries.value.at(-1)).toEqual({ rank: 3, name: '', score: 0, isYou: true, local: true })
  })

  it('shares the rank of others already sitting on stage 0', async () => {
    const { setPortalBoard, ensurePortalBoard, portalEntries } = await load()
    setPortalBoard(fakeAdapter({
      entries: async () => [
        { rank: 1, name: 'Ace', score: 41, isYou: false },
        { rank: 2, name: 'Zed', score: 0, isYou: false }
      ]
    }).adapter)
    await ensurePortalBoard()
    expect(portalEntries.value.at(-1)).toMatchObject({ rank: 2, isYou: true, local: true })
  })

  it('draws no local row once the portal lists the player, or once they have a best', async () => {
    const { setPortalBoard, ensurePortalBoard, reportPortalBest, portalEntries } = await load()
    let rows: PortalBoardEntry[] = [{ rank: 1, name: 'Me', score: 0, isYou: true }]
    setPortalBoard(fakeAdapter({ entries: async () => rows }).adapter)
    await ensurePortalBoard()
    expect(portalEntries.value).toEqual(rows)

    // A player with a real best outside a truncated list is NOT drawn as last.
    rows = [{ rank: 1, name: 'Ace', score: 41, isYou: false }]
    await reportPortalBest(3)
    await settle()
    await ensurePortalBoard()
    expect(portalEntries.value).toEqual(rows)
  })
})

describe('reads: a tab while there are rows, nothing when there are not', () => {
  it('reads once per session, and again only after the player posted', async () => {
    const { setPortalBoard, ensurePortalBoard, reportPortalBest, portalEntries, portalBoardVisible } = await load()
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    expect(portalBoardVisible.value).toBe(true)

    await ensurePortalBoard()
    await ensurePortalBoard()
    expect(fake.reads()).toBe(1)
    expect(portalEntries.value.map((e) => e.name)).toContain('Ada')

    await reportPortalBest(3)
    await settle()
    await ensurePortalBoard()
    expect(fake.reads(), 'the new row should be visible on the next open').toBe(2)
  })

  it('hides the tab when the answer was not a board, and brings it back on a good read', async () => {
    const { setPortalBoard, ensurePortalBoard, portalBoardVisible } = await load()
    let rows: PortalBoardEntry[] | null = null
    setPortalBoard(fakeAdapter({ entries: async () => rows }).adapter)

    await ensurePortalBoard()
    expect(portalBoardVisible.value).toBe(false)

    rows = []
    await ensurePortalBoard()
    expect(portalBoardVisible.value).toBe(true)
  })

  it('hides the tab on a read that throws, without rejecting', async () => {
    const { setPortalBoard, ensurePortalBoard, portalBoardVisible } = await load()
    setPortalBoard(fakeAdapter({ entries: async () => { throw new Error('offline') } }).adapter)
    await expect(ensurePortalBoard()).resolves.toBeUndefined()
    expect(portalBoardVisible.value).toBe(false)
  })
})

describe('reportRun no longer touches the portal board', () => {
  it('leaves posting to the win dispatch', async () => {
    vi.stubEnv('VITE_LEADERBOARD_URL', '')
    vi.stubGlobal('fetch', vi.fn())
    const { setPortalBoard } = await load()
    const { reportRun } = await import('@/use/useLeaderboard')
    const fake = fakeAdapter()
    setPortalBoard(fake.adapter)
    await reportRun(8, 120, { force: true })
    await settle()
    expect(fake.posted).toEqual([])
  })
})
