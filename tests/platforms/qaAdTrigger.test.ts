// The hidden QA interstitial tap: twenty taps on the pause menu's PAUSED title
// inside twenty seconds request an interstitial.
//
// Every portal paces interstitials at 121 s and only starts that clock on the
// first request of a session, so the things portals actually grade — the music
// hard-stop, the loop pause, the ad landing BEFORE the result screen, the music
// coming back on a no-fill — cost two minutes of play per attempt to look at.
// This is the back door that makes them checkable on the submitted bundle.
//
// What is asserted here is the half that is easy to get wrong and impossible to
// see: that the back door still pays the debts every real placement pays.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const showMidgameAd = vi.fn(() => Promise.resolve())
const showRewardedAd = vi.fn(() => Promise.resolve(true))
const markInterstitialShown = vi.fn()
const resumeMusicAfterAd = vi.fn()
const adShowing = ref(false)

const load = async () => {
  vi.resetModules()
  vi.doMock('@/use/useAds', () => ({ showMidgameAd, showRewardedAd }))
  vi.doMock('@/use/useAdGate', () => ({ markInterstitialShown }))
  vi.doMock('@/use/useSound', () => ({ resumeMusicAfterAd }))
  vi.doMock('@/use/useGamePause', () => ({ isAdShowing: adShowing }))
  return await import('@/use/useQaAdTrigger')
}

/** Let the `.catch().finally()` chain on the ad promise settle. */
const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/** `n` taps, `stepMs` apart, starting at `from`. Returns the clock afterwards. */
const tap = (
  mod: { registerQaAdTap: (now?: number) => boolean },
  n: number,
  from: number,
  stepMs = 100
): number => {
  let at = from
  for (let i = 0; i < n; i++) {
    mod.registerQaAdTap(at)
    at += stepMs
  }
  return at
}

beforeEach(() => {
  showMidgameAd.mockClear().mockResolvedValue(undefined)
  markInterstitialShown.mockClear()
  resumeMusicAfterAd.mockClear()
  adShowing.value = false
})

afterEach(() => {
  vi.doUnmock('@/use/useAds')
  vi.doUnmock('@/use/useAdGate')
  vi.doUnmock('@/use/useSound')
  vi.doUnmock('@/use/useGamePause')
})

describe('the hidden QA ad trigger', () => {
  it('stays shut for nineteen taps and opens on the twentieth', async () => {
    const mod = await load()
    // The numbers QA is told: twenty taps, inside thirty seconds.
    expect(mod.QA_AD_TAPS).toBe(20)
    expect(mod.QA_AD_WINDOW_MS).toBe(20_000)
    tap(mod, mod.QA_AD_TAPS - 1, 1000)
    expect(showMidgameAd).not.toHaveBeenCalled()

    expect(mod.registerQaAdTap(1000 + mod.QA_AD_TAPS * 100)).toBe(true)
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('does not count taps that have aged out of the window', async () => {
    const mod = await load()
    tap(mod, mod.QA_AD_TAPS - 1, 1000)
    // One more tap, but a minute later: every earlier tap is stale, so this is
    // tap ONE of a new burst rather than the thirtieth of the old one.
    expect(mod.registerQaAdTap(1000 + 60_000)).toBe(false)
    expect(showMidgameAd).not.toHaveBeenCalled()
  })

  it('rolls the window rather than restarting it, so a slow start still opens', async () => {
    const mod = await load()
    // Ten taps, then a long pause that ages exactly those out, then twenty more
    // spread across the window. The burst that lands inside the window is a
    // full one and must fire.
    const after = tap(mod, 10, 1000, 200)
    const late = after + mod.QA_AD_WINDOW_MS
    tap(mod, mod.QA_AD_TAPS - 1, late, 900)
    expect(showMidgameAd).not.toHaveBeenCalled()
    expect(mod.registerQaAdTap(late + (mod.QA_AD_TAPS - 1) * 900)).toBe(true)
  })

  it('seeds the shared interstitial clock, so the next placement still owes its gap', async () => {
    const mod = await load()
    tap(mod, mod.QA_AD_TAPS, 1000)
    // Bypassing the PACING gate is the point; leaving the clock unseeded is not.
    // Without this a tester hands the portal two ads inside the 121 s window it
    // rate-limits on, which is the abuse that limit exists to catch.
    expect(markInterstitialShown).toHaveBeenCalledTimes(1)
  })

  it('restarts the music afterwards — it interrupted a live run', async () => {
    const mod = await load()
    tap(mod, mod.QA_AD_TAPS, 1000)
    await settle()
    expect(resumeMusicAfterAd).toHaveBeenCalledTimes(1)
  })

  it('restarts the music when the ad throws as well', async () => {
    const mod = await load()
    // `showMidgameAd` swallows provider errors itself, but a rejection here has
    // to leave the game with sound either way: the failure mode this guards is
    // a silent session, and it must not depend on who catches what.
    showMidgameAd.mockRejectedValueOnce(new Error('no fill'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tap(mod, mod.QA_AD_TAPS, 1000)
    await settle()
    expect(resumeMusicAfterAd).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('will not stack a second request behind an ad it is still waiting on', async () => {
    const mod = await load()
    let release: (() => void) | undefined
    showMidgameAd.mockReturnValueOnce(new Promise<void>((r) => { release = () => r() }))
    tap(mod, mod.QA_AD_TAPS, 1000)
    expect(showMidgameAd).toHaveBeenCalledTimes(1)

    // A tester who keeps tapping through the ad earns nothing.
    tap(mod, mod.QA_AD_TAPS, 5000)
    expect(showMidgameAd).toHaveBeenCalledTimes(1)

    release?.()
    await settle()
    tap(mod, mod.QA_AD_TAPS, 100_000)
    expect(showMidgameAd).toHaveBeenCalledTimes(2)
  })

  it('refuses while any other placement has an ad on screen', async () => {
    const mod = await load()
    adShowing.value = true
    expect(mod.registerQaAdTap(1000)).toBe(false)
    tap(mod, mod.QA_AD_TAPS, 1000)
    expect(showMidgameAd).not.toHaveBeenCalled()
  })

  it('spends the burst on a refusal instead of leaving the counter armed', async () => {
    const mod = await load()
    adShowing.value = true
    tap(mod, mod.QA_AD_TAPS, 1000)
    adShowing.value = false
    // The very next tap must not be the one that opens the door — a refused
    // burst has to be re-earned, or the ad that could not open opens on tap 31.
    expect(mod.registerQaAdTap(1000 + mod.QA_AD_TAPS * 100)).toBe(false)
    expect(showMidgameAd).not.toHaveBeenCalled()
  })

  it('needs a fresh twenty after every ad', async () => {
    const mod = await load()
    tap(mod, mod.QA_AD_TAPS, 1000)
    await settle()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)

    tap(mod, mod.QA_AD_TAPS - 1, 10_000)
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
    mod.registerQaAdTap(10_000 + mod.QA_AD_TAPS * 100)
    expect(showMidgameAd).toHaveBeenCalledTimes(2)
  })
})

// The rewarded twin (on the base's scrap pill): the same twenty taps in the
// same rolling window ask for a rewarded video, grant nothing, never stack.
describe('the hidden QA rewarded tap', () => {
  beforeEach(() => { showRewardedAd.mockClear(); resumeMusicAfterAd.mockClear(); adShowing.value = false })

  it('nineteen taps do nothing; the twentieth asks for a rewarded video, and the music comes back after', async () => {
    const mod = await load()
    mod.__resetQaRewardTaps()
    for (let i = 0; i < 19; i++) expect(mod.registerQaRewardedTap(1000 + i * 100)).toBe(false)
    expect(showRewardedAd).not.toHaveBeenCalled()
    expect(mod.registerQaRewardedTap(1000 + 19 * 100)).toBe(true)
    expect(showRewardedAd).toHaveBeenCalledTimes(1)
    await settle()
    expect(resumeMusicAfterAd).toHaveBeenCalled()
  })

  it('taps spread over more than the window start over; an ad already up is not stacked', async () => {
    const mod = await load()
    mod.__resetQaRewardTaps()
    for (let i = 0; i < 20; i++) expect(mod.registerQaRewardedTap(i * 2000)).toBe(false)
    adShowing.value = true
    for (let i = 0; i < 20; i++) mod.registerQaRewardedTap(100000 + i * 100)
    expect(showRewardedAd).not.toHaveBeenCalled()
  })
})
