// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Portal QA rule: an interstitial never opens ON TOP of a result screen, and
 * the next scene never starts under an ad. So the way off the rewards and
 * defeat screens closes the screen first, then plays the ad, then moves on.
 */

const ad = vi.hoisted(() => ({
  due: true,
  shown: 0,
  marked: 0,
  finish: null as null | (() => void)
}))

vi.mock('@/use/useAds', () => ({
  showMidgameAd: vi.fn(() => {
    ad.shown++
    return new Promise<void>((resolve) => { ad.finish = resolve })
  })
}))
vi.mock('@/use/useAdGate', () => ({
  canShowInterstitial: () => ad.due,
  markInterstitialShown: () => { ad.marked++ }
}))
vi.mock('@/use/useLeaderboard', () => ({ reportRun: vi.fn(async () => {}) }))
vi.mock('@/game/engine/app', () => ({
  app: { setMode: vi.fn(), setWanted: vi.fn(), setTimeScale: vi.fn() }
}))

const setup = async () => {
  vi.resetModules()
  ad.due = true
  ad.shown = 0
  ad.marked = 0
  ad.finish = null
  const flowMod = await import('@/game/flow')
  const built: string[] = []
  flowMod.registerModeFactories({
    mission: async () => { built.push('mission'); return {} as never },
    base: async () => { built.push('base'); return {} as never }
  })
  return { ...flowMod, built }
}
const tick = (ms = 0): Promise<void> => new Promise(r => setTimeout(r, ms))

describe('leaving a result screen', () => {
  beforeEach(() => { localStorage.clear() })

  it('closes the screen, then plays the ad, and only then builds the next scene', async () => {
    const { flow, leaveResults, built } = await setup()
    flow.modal = 'rewards'
    const done = leaveResults('base')
    await tick()
    // The screen is gone and the ad is up; nothing else has started.
    expect(flow.modal).toBe('')
    expect(ad.shown).toBe(1)
    expect(ad.marked).toBe(1)
    expect(built).toEqual([])
    ad.finish!()
    await done
    await tick(20)
    expect(built).toEqual(['base'])
  })

  it('a retry after a defeat waits for the ad the same way', async () => {
    const { flow, leaveResults, built } = await setup()
    flow.modal = 'defeat'
    const done = leaveResults('retry')
    await tick()
    expect(flow.modal).toBe('')
    expect(built).toEqual([])
    ad.finish!()
    await done
    await tick(20)
    expect(built).toEqual(['mission'])
  })

  it('with no ad due it goes straight on, and asks for none', async () => {
    const { flow, leaveResults, built } = await setup()
    ad.due = false
    flow.modal = 'rewards'
    await leaveResults('base')
    await tick(20)
    expect(ad.shown).toBe(0)
    expect(built).toEqual(['base'])
  })

  it('a double tap asks for one ad and builds one scene', async () => {
    const { flow, leaveResults, built } = await setup()
    flow.modal = 'rewards'
    const a = leaveResults('base')
    const b = leaveResults('base')
    await tick()
    expect(ad.shown).toBe(1)
    ad.finish!()
    await Promise.all([a, b])
    await tick(20)
    expect(built).toEqual(['base'])
  })

  it('there is no rewarded placement anywhere in the game\'s screens', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.(vue|ts)$/.test(f)) out.push(p)
      }
      return out
    }
    const root = join(__dirname, '..', '..', 'src')
    const offenders = [...walk(join(root, 'components')), ...walk(join(root, 'views')), ...walk(join(root, 'game'))]
      .filter(p => /showRewardedAd|claimReward\(/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
