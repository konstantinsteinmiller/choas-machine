import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The ad gate decides two things that are easy to get subtly wrong and
 * expensive to get wrong in review:
 *
 *   1. WHICH BUILDS charge for a perk. Shipping a gated perk on a build with no
 *      ad inventory makes the perk permanently unavailable.
 *   2. HOW OFTEN an interstitial may fire. Portals reject builds that stack
 *      breaks back to back, and the very first seconds of a session are the
 *      worst possible moment for one.
 */

type GateOpts = {
  crazy?: boolean
  wavedash?: boolean
  fullRelease?: boolean
  rewardedReady?: boolean
  /** Which ad provider resolved. `'noop'` is local dev / plain web. */
  provider?: string
}

const loadGate = async (opts: GateOpts = {}) => {
  vi.resetModules()
  vi.doMock('@/use/useUser', () => ({
    isCrazyWeb: opts.crazy ?? false,
    isWaveDash: opts.wavedash ?? false
  }))
  vi.doMock('@/use/useMatch', () => ({ isCrazyGamesFullRelease: opts.fullRelease ?? false }))
  const showRewardedAd = vi.fn(async () => true)
  vi.doMock('@/use/useAds', async () => {
    const { ref } = await import('vue')
    return {
      // Default follows the build: a CG build resolves the CG provider, and
      // anything else defaults to noop unless the test names one.
      adProviderName: opts.provider ?? (opts.crazy ? 'crazygames' : 'noop'),
      isRewardedReady: ref(opts.rewardedReady ?? true),
      showRewardedAd
    }
  })
  const mod = await import('@/use/useAdGate')
  return { ...mod, showRewardedAd }
}

beforeEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('reward gating', () => {
  it('grants the perk for free when no ad provider resolved', async () => {
    // Local dev, plain web, itch — there is no video to play, so a gate would
    // make the perk permanently unavailable.
    const gate = await loadGate({ crazy: false, provider: 'noop' })
    const grant = vi.fn()
    expect(gate.isRewardGated).toBe(false)
    await expect(gate.claimReward(grant)).resolves.toBe(true)
    expect(grant).toHaveBeenCalledTimes(1)
    expect(gate.showRewardedAd).not.toHaveBeenCalled()
  })

  it('plays a rewarded video on every portal that has one', async () => {
    // The bug this locks: the gate used to read `isCrazyWeb && fullRelease`, so
    // five shipping portals with real rewarded inventory handed every perk out
    // for free — the video never played and the placement never earned.
    // Poki included: its rewarded surfaces must play `rewardedBreak()`, never
    // grant for free (integrate-poki §2d — the portal every past repo forgot).
    for (const provider of ['playgama', 'gamepix', 'gamemonetize', 'yandex', 'gameDistribution', 'poki']) {
      const gate = await loadGate({ crazy: false, provider })
      const grant = vi.fn()
      expect(gate.isRewardGated, `${provider} did not gate the reward`).toBe(true)
      await expect(gate.claimReward(grant)).resolves.toBe(true)
      expect(gate.showRewardedAd, `${provider} skipped the video`).toHaveBeenCalledTimes(1)
      expect(grant).toHaveBeenCalledTimes(1)
    }
  })

  it('offers nothing at all on a CrazyGames build that is not the full release', async () => {
    // The pre-release build is what CG's reviewers play, and it has NO ad
    // inventory: `requestAd` resolves without showing a video. A gate there
    // would render a film-frame button that plays nothing; NO gate — which is
    // what `isRewardGated` resolves to — would hand the +3x payout over for a
    // button press. So the offer is simply not made: no button, no free grant.
    const gate = await loadGate({ crazy: true, fullRelease: false })
    const grant = vi.fn()

    expect(gate.canOfferReward.value).toBe(false)

    // And it is unreachable by any other route, not merely unrendered.
    await expect(gate.claimReward(grant)).resolves.toBe(false)
    expect(grant).not.toHaveBeenCalled()
    expect(gate.showRewardedAd).not.toHaveBeenCalled()
  })

  it('offers nothing at all on a Wavedash build', async () => {
    // Wavedash has no ad SDK, so `resolveAdProvider` falls through to noop and
    // the "no provider → the perk is free" rule above fires. That rule is right
    // for local dev and itch and wrong for a portal: the result screen showed a
    // button marked with a film frame and paid the +3x out on the tap, with no
    // video anywhere. The offer is withdrawn instead, the same way it is on a
    // CG pre-release.
    const gate = await loadGate({ wavedash: true, provider: 'noop' })
    const grant = vi.fn()

    expect(gate.canOfferReward.value).toBe(false)

    // And not reachable by any other route — a free +3x is the failure mode.
    await expect(gate.claimReward(grant)).resolves.toBe(false)
    expect(grant).not.toHaveBeenCalled()
    expect(gate.showRewardedAd).not.toHaveBeenCalled()
  })

  it('plays a rewarded video on the CrazyGames full release', async () => {
    const gate = await loadGate({ crazy: true, fullRelease: true })
    const grant = vi.fn()
    expect(gate.isRewardGated).toBe(true)
    await expect(gate.claimReward(grant)).resolves.toBe(true)
    expect(gate.showRewardedAd).toHaveBeenCalledTimes(1)
    expect(grant).toHaveBeenCalledTimes(1)
  })

  it('grants nothing when the video does not complete', async () => {
    const gate = await loadGate({ crazy: true, fullRelease: true })
    ;(gate.showRewardedAd as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false)
    const grant = vi.fn()
    await expect(gate.claimReward(grant)).resolves.toBe(false)
    expect(grant).not.toHaveBeenCalled()
  })

  it('refuses to start a second video while one is in flight', async () => {
    const gate = await loadGate({ crazy: true, fullRelease: true })
    let release: (v: boolean) => void = () => {}
    ;(gate.showRewardedAd as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise<boolean>((r) => { release = r })
    )
    const grantA = vi.fn()
    const grantB = vi.fn()
    const first = gate.claimReward(grantA)
    expect(gate.adInFlight.value).toBe(true)
    await expect(gate.claimReward(grantB)).resolves.toBe(false)
    expect(grantB).not.toHaveBeenCalled()
    release(true)
    await first
    expect(grantA).toHaveBeenCalledTimes(1)
    expect(gate.adInFlight.value).toBe(false)
  })

  it('clears the in-flight flag even when the provider throws', async () => {
    const gate = await loadGate({ crazy: true, fullRelease: true })
    ;(gate.showRewardedAd as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no fill'))
    await expect(gate.claimReward(vi.fn())).rejects.toThrow('no fill')
    // A stuck flag would disable every reward button for the rest of the run.
    expect(gate.adInFlight.value).toBe(false)
  })

  it('hides the offer on a gated build with no ad ready', async () => {
    const gate = await loadGate({ crazy: true, fullRelease: true, rewardedReady: false })
    expect(gate.canOfferReward.value).toBe(false)
  })

  it('always offers the perk on an ungated NON-CrazyGames build, ad inventory or not', async () => {
    const gate = await loadGate({ crazy: false, fullRelease: false, rewardedReady: false })
    expect(gate.canOfferReward.value).toBe(true)
  })

  it('still offers on the CrazyGames FULL release when an ad is ready', async () => {
    // The pre-release rule must not leak into the released build.
    const gate = await loadGate({ crazy: true, fullRelease: true, rewardedReady: true })
    expect(gate.canOfferReward.value).toBe(true)
  })
})

describe('interstitial pacing', () => {
  it('allows the session\'s first break outright — no earlier request has to start a clock', async () => {
    // The first mission's Continue gets its ad: asking once must not be what
    // arms the gap, or that first ad would never run.
    const gate = await loadGate()
    gate.__resetInterstitialClock()
    expect(gate.canShowInterstitial()).toBe(true)
    expect(gate.canShowInterstitial()).toBe(true) // asking alone changes nothing
  })

  it('runs nothing in the first four minutes after load (#182; covers the first minute Yandex asks for)', async () => {
    vi.useFakeTimers()
    const gate = await loadGate()
    gate.__resetInterstitialClock(0)
    expect(gate.INTERSTITIAL_AFTER_LOAD_MS).toBe(240_000)
    vi.advanceTimersByTime(239_000)
    expect(gate.canShowInterstitial()).toBe(false)
    vi.advanceTimersByTime(1_000)
    expect(gate.canShowInterstitial()).toBe(true)
  })

  it('holds the next break for a full two minutes after the last', async () => {
    vi.useFakeTimers()
    const gate = await loadGate()
    gate.__resetInterstitialClock()
    gate.markInterstitialShown()

    vi.advanceTimersByTime(119_000)
    expect(gate.canShowInterstitial()).toBe(false)

    vi.advanceTimersByTime(2_000)
    expect(gate.canShowInterstitial()).toBe(true)
  })

  it('counts an ad from another placement (first-load, QA tap) against the gap', async () => {
    vi.useFakeTimers()
    const gate = await loadGate()
    gate.__resetInterstitialClock()
    gate.markInterstitialShown() // e.g. the first-load ad on GamePix
    vi.advanceTimersByTime(90_000)
    expect(gate.canShowInterstitial()).toBe(false)
  })

  it('restarts the clock once a break is actually shown', async () => {
    vi.useFakeTimers()
    const gate = await loadGate()
    gate.__resetInterstitialClock()

    expect(gate.canShowInterstitial()).toBe(true)
    gate.markInterstitialShown()

    // Immediately after a break, the next one is a full gap away again — this
    // is what stops a fast run from stacking two breaks in a row.
    expect(gate.canShowInterstitial()).toBe(false)
    expect(gate.interstitialCooldownLeft()).toBeGreaterThan(119)

    vi.advanceTimersByTime(121_000)
    expect(gate.canShowInterstitial()).toBe(true)
  })
})

// The early-ads grace is for a FIRST-TIME player only (playbook, phase 6): it
// held for every session, so a returning player opening the disguise shop
// right after loading saw no video buttons, and a Poki QA pass reported the
// build as having no rewarded ads.
describe('the rewarded grace: first-time players only', () => {
  it('a new player waits the three minutes; a returning one is offered at once', async () => {
    const gate = await loadGate({ provider: 'poki' })
    const { profile } = await import('@/game/state/profile')
    gate.__resetInterstitialClock(0)
    profile.missions = 0
    profile.seen = []
    expect(gate.canOfferVideo()).toBe(false)
    profile.seen = ['training']
    expect(gate.canOfferVideo()).toBe(true)
    profile.seen = []
    profile.missions = 1
    expect(gate.canOfferVideo()).toBe(true)
    profile.missions = 0
    gate.__resetInterstitialClock(gate.REWARD_GRACE_MS)
    expect(gate.canOfferVideo()).toBe(true)
  })
})
