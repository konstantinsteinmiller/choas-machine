// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A new player sees the intro BEFORE the training ground (people walked into
 * the rooms cold), all but its closing still of the next fortress; that still
 * plays once the training is done, on the way into the first raid. The
 * training's drop-in waits while the intro is being built.
 */

vi.mock('@/use/useAds', () => ({ showMidgameAd: vi.fn(async () => {}) }))
vi.mock('@/use/useAdGate', () => ({ canShowInterstitial: () => false, markInterstitialShown: () => {} }))
vi.mock('@/use/useLeaderboard', () => ({ reportRun: vi.fn(async () => {}) }))
vi.mock('@/game/engine/app', () => ({
  app: { setMode: vi.fn(), setWanted: vi.fn(), setTimeScale: vi.fn(), pushMode: vi.fn(), popMode: vi.fn() }
}))

const setup = async () => {
  vi.resetModules()
  const flowMod = await import('@/game/flow')
  const { profile } = await import('@/game/state/profile')
  const played: string[] = []
  const pending: boolean[] = []
  flowMod.registerModeFactories({
    mission: async () => ({}) as never,
    base: async () => ({}) as never,
    cinema: async (id, part = 'whole') => {
      pending.push(flowMod.flow.cinemaPending)
      played.push(`${id}:${part}`)
      return { done: Promise.resolve(), skip: () => {}, music: 'hero' } as never
    }
  })
  return { ...flowMod, profile, played, pending }
}

describe('the intro comes before the training ground', () => {
  beforeEach(() => { localStorage.clear() })

  it('a new player: the intro without its still first, the drop-in held while it builds; the still after the training', async () => {
    const { flow, profile, introBeforeTraining, finishTraining, tapToStart, played, pending } = await setup()
    flow.training = true
    flow.screen = 'mission'
    flow.curtain = false
    const run = introBeforeTraining()
    // "Tap to start" first: the scene (and its sound) waits for a gesture, the drop-in with it.
    await new Promise(r => setTimeout(r, 10))
    expect(flow.tapGate).toBe(true)
    expect(flow.cinemaPending).toBe(true)
    expect(profile.seen).not.toContain('cine:intro')
    tapToStart()
    expect(flow.tapGate).toBe(false)
    await run
    expect(played).toEqual(['intro:scene'])
    expect(pending).toEqual([true])
    expect(flow.cinemaPending).toBe(false)
    expect(profile.seen).toContain('cine:intro')
    expect(profile.seen).not.toContain('cine:intro:still')
    await finishTraining()
    expect(played).toEqual(['intro:scene', 'intro:still'])
    expect(profile.seen).toContain('cine:intro:still')
  })

  it('waits for the boot loader to go before it starts', async () => {
    const { flow, introBeforeTraining, tapToStart, played } = await setup()
    flow.training = true
    flow.screen = 'mission'
    flow.curtain = true
    let over = false
    const run = introBeforeTraining().then(() => { over = true })
    await new Promise(r => setTimeout(r, 10))
    expect(played).toEqual(['intro:scene'])
    expect(over).toBe(false)
    expect(flow.cinemaPending).toBe(true)
    expect(flow.tapGate).toBe(false)
    flow.curtain = false
    await new Promise(r => setTimeout(r, 10))
    expect(flow.tapGate).toBe(true)
    tapToStart()
    await run
    expect(over).toBe(true)
    expect(flow.cinemaPending).toBe(false)
  })

  it('a profile that saw the whole intro is shown nothing more; one that never did sees it all after the training', async () => {
    const seen = await setup()
    seen.flow.curtain = false
    seen.profile.seen.push('cine:intro', 'cine:intro:still')
    await seen.finishTraining()
    expect(seen.played).toEqual([])
    const old = await setup()
    old.flow.curtain = false
    old.profile.seen.length = 0
    await old.finishTraining()
    expect(old.played).toEqual(['intro:whole'])
  })

  it('not over a returning player\'s base, nor twice', async () => {
    const { flow, profile, introBeforeTraining, played } = await setup()
    flow.training = false
    flow.screen = 'base'
    flow.curtain = false
    await introBeforeTraining()
    expect(played).toEqual([])
    flow.training = true
    flow.screen = 'mission'
    profile.seen.push('cine:intro')
    await introBeforeTraining()
    expect(played).toEqual([])
  })
})
