// ─── PlaygamaStrategy on Bridge v2 ─────────────────────────────────────────
//
// The v1 strategy never read the cloud back (hydrate was a no-op marked
// `success-with-data`) and wrote key by key. Both are data-loss bugs on the
// backends this archive actually runs on: YouTube Playables keeps the WHOLE
// save as one `saveData` string and Playgama's cloud is `getState` → merge →
// `setItems`, so the cloud read is the only way progress comes back, and
// concurrent per-key writes race each other.
//
// The fake storage below is a whole-blob read-modify-write backend with a
// delay, exactly the shape that loses keys to concurrent writers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const STATE_KEY = 'cmachine_state'
const META_KEY = '__save_meta__'

const sdkActive = ref(true)
let bridge: { storage: ReturnType<typeof makeCloud>['storage'] } | null = null

vi.mock('@/utils/playgamaPlugin', () => ({
  isPlaygamaSdkActive: sdkActive,
  getPlaygamaBridge: () => bridge
}))

const makeLocal = () => {
  const map = new Map<string, string>()
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { map.set(k, v) },
    remove: (k: string) => { map.delete(k) },
    keys: () => [...map.keys()]
  }
}

/** A whole-save backend: every write re-reads the blob, merges, writes back. */
const makeCloud = (seed: Record<string, string> = {}, opts: { failGet?: number } = {}) => {
  let blob: Record<string, string> = { ...seed }
  let failGet = opts.failGet ?? 0
  const setCalls: Array<{ keys: string[]; values: unknown[] }> = []
  const tick = () => new Promise((r) => setTimeout(r, 10))
  const storage = {
    get: vi.fn(async (keys: string | string[], _parse?: boolean) => {
      await tick()
      if (failGet > 0) { failGet--; throw new Error('network') }
      const list = Array.isArray(keys) ? keys : [keys]
      const out = list.map((k) => blob[k] ?? null)
      return Array.isArray(keys) ? out : out[0]
    }),
    set: vi.fn(async (keys: string | string[], values: unknown) => {
      const ks = Array.isArray(keys) ? keys : [keys]
      const vs = Array.isArray(keys) ? values as unknown[] : [values]
      setCalls.push({ keys: ks, values: vs })
      const snapshot = { ...blob }
      await tick()
      ks.forEach((k, i) => { snapshot[k] = String(vs[i]) })
      blob = snapshot
    }),
    delete: vi.fn(async (_keys: string | string[]) => {})
  }
  return { storage, setCalls, read: () => blob }
}

const state = (level: number, bolts = 0) => JSON.stringify({ cm_medals: level, cm_scrap: bolts })

const load = async () => (await import('@/utils/save/PlaygamaStrategy')).PlaygamaStrategy

beforeEach(() => {
  vi.useFakeTimers()
  sdkActive.value = true
  bridge = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hydrate reads the cloud', () => {
  it('restores a cloud save onto a device that has none (a new device, a wiped iframe, Playables)', async () => {
    const cloud = makeCloud({ [STATE_KEY]: state(12, 900) })
    bridge = { storage: cloud.storage }
    const local = makeLocal()
    const strat = new (await load())()

    const p = strat.hydrate(local)
    await vi.advanceTimersByTimeAsync(20)
    await p

    expect(strat.hydrateState).toBe('success-with-data')
    expect(local.get(STATE_KEY)).toBe(state(12, 900))
    // ONE read for every key — on a whole-blob backend every read is a download.
    expect(cloud.storage.get).toHaveBeenCalledTimes(1)
    expect(cloud.storage.get).toHaveBeenCalledWith([STATE_KEY, META_KEY], false)
  })

  it('keeps a further-along local save and pushes it up', async () => {
    const cloud = makeCloud({ [STATE_KEY]: state(3) })
    bridge = { storage: cloud.storage }
    const local = makeLocal()
    local.set(STATE_KEY, state(9))
    const strat = new (await load())()

    const p = strat.hydrate(local)
    await vi.advanceTimersByTimeAsync(20)
    await p
    expect(local.get(STATE_KEY)).toBe(state(9))

    await vi.advanceTimersByTimeAsync(1000)
    expect(cloud.read()[STATE_KEY]).toBe(state(9))
  })

  it('drops writes queued against pre-hydrate defaults when the cloud wins', async () => {
    const cloud = makeCloud({ [STATE_KEY]: state(20) })
    bridge = { storage: cloud.storage }
    const local = makeLocal()
    const strat = new (await load())()

    const p = strat.hydrate(local)
    // The game wrote defaults while the read was in flight.
    strat.onLocalSet(STATE_KEY, state(0))
    await vi.advanceTimersByTimeAsync(20)
    await p
    await vi.advanceTimersByTimeAsync(2000)

    expect(cloud.read()[STATE_KEY], 'defaults were pushed over the winning cloud save').toBe(state(20))
  })

  it('never pushes before a read has succeeded, and retries the read', async () => {
    const cloud = makeCloud({ [STATE_KEY]: state(5) }, { failGet: 1 })
    bridge = { storage: cloud.storage }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const local = makeLocal()
    const strat = new (await load())()

    const p = strat.hydrate(local)
    await vi.advanceTimersByTimeAsync(20)
    await p
    expect(strat.hydrateState).toBe('failed-retrying')

    strat.onLocalSet(STATE_KEY, state(0))
    await vi.advanceTimersByTimeAsync(900)
    expect(cloud.setCalls, 'pushed while the cloud contents were unknown').toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1100)
    expect(strat.hydrateState).toBe('success-with-data')
    expect(local.get(STATE_KEY)).toBe(state(5))
  })

  it('degrades to local-only, without blocking the game, when the Bridge never came up', async () => {
    sdkActive.value = false
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const strat = new (await load())()
    await strat.hydrate(makeLocal())
    expect(strat.hydrateState).toBe('success-empty')
  })
})

describe('writes are one batch at a time', () => {
  it('sends the state and its meta in ONE storage.set call', async () => {
    const cloud = makeCloud()
    bridge = { storage: cloud.storage }
    const local = makeLocal()
    const strat = new (await load())()
    const p = strat.hydrate(local)
    await vi.advanceTimersByTimeAsync(20)
    await p

    local.set(STATE_KEY, state(4))
    strat.onLocalSet(STATE_KEY, state(4))
    await vi.advanceTimersByTimeAsync(1000)

    expect(cloud.setCalls).toHaveLength(1)
    expect(cloud.setCalls[0]!.keys.sort()).toEqual([META_KEY, STATE_KEY].sort())
    expect(JSON.parse(cloud.read()[META_KEY]!).maxStage).toBe(4)
  })

  it('never runs two writes at once, so a whole-blob backend loses no keys', async () => {
    const cloud = makeCloud()
    bridge = { storage: cloud.storage }
    const local = makeLocal()
    const strat = new (await load())()
    const p = strat.hydrate(local)
    await vi.advanceTimersByTimeAsync(20)
    await p

    local.set(STATE_KEY, state(1))
    strat.onLocalSet(STATE_KEY, state(1))
    const f1 = strat.flush()
    local.set(STATE_KEY, state(2))
    strat.onLocalSet(STATE_KEY, state(2))
    const f2 = strat.flush()
    await vi.advanceTimersByTimeAsync(100)
    await Promise.all([f1, f2])

    expect(cloud.read()[STATE_KEY]).toBe(state(2))
    expect(cloud.read()[META_KEY]).toBeDefined()
  })

  it('mirrors only the save — nothing else on the device crosses', async () => {
    const cloud = makeCloud()
    bridge = { storage: cloud.storage }
    const strat = new (await load())()
    const p = strat.hydrate(makeLocal())
    await vi.advanceTimersByTimeAsync(20)
    await p

    strat.onLocalSet('fps', 'true')
    strat.onLocalSet('prebid11_exp', 'x')
    await vi.advanceTimersByTimeAsync(1000)
    expect(cloud.setCalls).toHaveLength(0)
  })
})
