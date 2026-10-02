// ─── YandexStrategy: retry a failed cloud read, merge by progress ──────────
//
// Two data-loss gaps the #115 platform audit found: a failed first `getData`
// was never retried (every write of the session stayed queued for a read that
// never came), and a successful read overwrote local progress unconditionally,
// so an older cloud save wiped newer local play.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_KEY = 'cmachine_state'
const META_KEY = '__save_meta__'
const BLOB = 'cmachine_blob'

let player: { getData: ReturnType<typeof vi.fn>; setData: ReturnType<typeof vi.fn> } | null = null

vi.mock('@/utils/yandexPlugin', () => ({ getYandexPlayer: () => player }))

const makeLocal = (seed: Record<string, string> = {}) => {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { map.set(k, v) },
    remove: (k: string) => { map.delete(k) },
    keys: () => [...map.keys()]
  }
}

const save = (level: number, story: number): string =>
  JSON.stringify({ cm_medals: level, cm_cleared: story })

const load = async () => (await import('@/utils/save/YandexStrategy')).YandexStrategy

beforeEach(() => {
  vi.useFakeTimers()
  player = { getData: vi.fn(), setData: vi.fn(() => Promise.resolve()) }
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('YandexStrategy', () => {
  it('retries a failed cloud read and then uploads what the session queued', async () => {
    const Strategy = await load()
    const s = new Strategy()
    const local = makeLocal()
    player!.getData.mockRejectedValueOnce(new Error('rate limited'))
    player!.getData.mockResolvedValueOnce({})
    await s.hydrate(local)
    expect(s.hydrateState).toBe('failed-retrying')

    s.onLocalSet(STATE_KEY, save(4, 1))
    expect(player!.setData).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(player!.getData).toHaveBeenCalledTimes(2)
    expect(s.hydrateState).toBe('success-empty')
    await vi.advanceTimersByTimeAsync(600)
    expect(player!.setData).toHaveBeenCalled()
    const payload = player!.setData.mock.calls[0]![0] as Record<string, { blob?: string }>
    expect(payload[BLOB]!.blob).toBe(save(4, 1))
  })

  it('keeps newer local progress over an older cloud save, and pushes it up', async () => {
    const Strategy = await load()
    const s = new Strategy()
    const local = makeLocal({ [STATE_KEY]: save(12, 5) })
    player!.getData.mockResolvedValue({ [BLOB]: { blob: save(6, 2) } })
    await s.hydrate(local)
    expect(local.get(STATE_KEY)).toBe(save(12, 5))
    await vi.advanceTimersByTimeAsync(600)
    const payload = player!.setData.mock.calls[0]![0] as Record<string, { blob?: string }>
    expect(payload[BLOB]!.blob).toBe(save(12, 5))
  })

  it('takes a cloud save that is further along, and drops writes queued before the read', async () => {
    const Strategy = await load()
    const s = new Strategy()
    const local = makeLocal({ [STATE_KEY]: save(2, 0) })
    s.onLocalSet(STATE_KEY, save(2, 0))
    player!.getData.mockResolvedValue({ [BLOB]: { blob: save(15, 6) } })
    await s.hydrate(local)
    expect(local.get(STATE_KEY)).toBe(save(15, 6))
    expect(local.get(META_KEY)).not.toBeNull()
    await vi.advanceTimersByTimeAsync(600)
    expect(player!.setData).not.toHaveBeenCalled()
  })
})
