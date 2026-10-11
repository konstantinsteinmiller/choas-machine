// @vitest-environment jsdom
// #M4: the paint scheme is part of the save, so it comes back with it. A
// player who unlocked and put on a scheme, then reloads on a new device (or a
// wiped iframe), gets it back from the portal's cloud, on CrazyGames (per-key,
// a manifest) and on Playgama (one whole blob): through the strategy, into
// storage, into the profile.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'

const STATE_KEY = 'cmachine_state'
const SAVED = JSON.stringify({
  cm_v: 2,
  cm_scrap: 320,
  cm_missions: 9,
  cm_medals: 4,
  cm_paint: { owned: ['lilac', 'crimson', 'arctic'], equipped: 'crimson', videos: [], trial: 'midnight' }
})

const sdkActive = ref(true)
let bridge: { storage: unknown } | null = null
vi.mock('@/utils/playgamaPlugin', () => ({
  isPlaygamaSdkActive: sdkActive,
  getPlaygamaBridge: () => bridge
}))

afterEach(() => {
  drainPersist()
  vi.useRealTimers()
})

/** What the game loads from storage once the hydrate is done. */
const profileFromStorage = async () => {
  drainAndResetModules()
  const S = await holdGameState()
  S.reloadGameState()
  const P = await import('@/game/state/profile')
  P.loadProfile()
  return P.profile
}

describe('an equipped paint scheme survives a reload from the cloud (#M4)', () => {
  it('CrazyGames: the scheme, the ones owned and the lend come back', async () => {
    vi.useFakeTimers()
    const { CrazyGamesStrategy } = await import('@/utils/save/CrazyGamesStrategy')
    const { SaveManager } = await import('@/utils/save/SaveManager')
    const store = new Map<string, string>([
      ['__save_internal__crazy_keys', JSON.stringify([STATE_KEY])],
      [STATE_KEY, SAVED]
    ])
    const data = {
      getItem: vi.fn(async (k: string) => store.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
      removeItem: vi.fn(async (k: string) => { store.delete(k) })
    }
    const manager = new SaveManager(new CrazyGamesStrategy(() => data))
    const p = manager.init()
    await vi.runAllTimersAsync()
    await p
    vi.useRealTimers()
    expect(JSON.parse(window.localStorage.getItem(STATE_KEY)!).cm_paint.equipped).toBe('crimson')
    const profile = await profileFromStorage()
    expect(profile.paint.equipped).toBe('crimson')
    expect(profile.paint.owned).toEqual(['lilac', 'crimson', 'arctic'])
    expect(profile.paint.trial).toBe('midnight')
  })

  it('Playgama: the same, from the one blob the Bridge keeps', async () => {
    vi.useFakeTimers()
    const cloud: Record<string, string> = { [STATE_KEY]: SAVED }
    bridge = {
      storage: {
        get: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys]
          const out = list.map(k => cloud[k] ?? null)
          return Array.isArray(keys) ? out : out[0]
        }),
        set: vi.fn(async () => {}),
        delete: vi.fn(async () => {})
      }
    }
    const local = new Map<string, string>()
    const adapter = {
      get: (k: string) => local.get(k) ?? null,
      set: (k: string, v: string) => { local.set(k, v) },
      remove: (k: string) => { local.delete(k) },
      keys: () => [...local.keys()]
    }
    const { PlaygamaStrategy } = await import('@/utils/save/PlaygamaStrategy')
    const strat = new PlaygamaStrategy()
    const p = strat.hydrate(adapter)
    await vi.advanceTimersByTimeAsync(50)
    await p
    vi.useRealTimers()
    expect(strat.hydrateState).toBe('success-with-data')
    window.localStorage.setItem(STATE_KEY, local.get(STATE_KEY)!)
    const profile = await profileFromStorage()
    expect(profile.paint.equipped).toBe('crimson')
    expect(profile.paint.owned).toEqual(['lilac', 'crimson', 'arctic'])
  })
})
