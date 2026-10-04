import { ref, computed } from 'vue'
import { isCrazyWeb, isWaveDash } from '@/use/useUser'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { adProviderName, isRewardedReady, showRewardedAd } from '@/use/useAds'

/**
 * ─── Reward gating ──────────────────────────────────────────────────────────
 *
 * A perk is paid for with a rewarded video on every build that HAS one, and is
 * simply free on every build that does not.
 *
 * It used to read `isCrazyWeb && isCrazyGamesFullRelease`, which was written
 * when CrazyGames was the only portal wired for rewarded ads. It is now wrong
 * in the expensive direction: Playgama, GamePix, GameMonetize, Yandex and
 * GameDistribution all resolve real providers, so that predicate was handing
 * out every rewarded perk for free on five shipping portals — the ad never
 * played, the placement never earned, and a reviewer clicking a button marked
 * with a video icon saw no video.
 *
 * The rule is now the honest one: is a real provider resolved?
 *
 *   • any real provider  → gated, the video plays.
 *   • CG PRE-release     → NOT gated, and nothing is OFFERED either. See
 *                          `isCrazyPreRelease` below.
 *   • Wavedash           → same: no SDK, so nothing is offered. See
 *                          `isWavedashNoAds` below.
 *   • noop (local dev,
 *     plain web, itch…)  → not gated, perks are free.
 */
export const isRewardGated =
  adProviderName !== 'noop' && (!isCrazyWeb || isCrazyGamesFullRelease)

/**
 * The CrazyGames PRE-release build — `VITE_APP_CRAZY_WEB=true` with
 * `VITE_APP_CRAZY_GAMES_FULL_RELEASE=false`. This is the build CG's reviewers
 * play before approval, and it has NO ad inventory: `requestAd` resolves without
 * ever showing a video.
 *
 * That leaves a rewarded surface with two possible behaviours, and both are QA
 * findings. Gated, the player taps a button marked with a film-frame icon and no
 * video plays. Ungated — which is what `isRewardGated` above resolves to here —
 * the ×3 pays out for free, so the reviewer sees the game hand over its entire
 * run income for a button press.
 *
 * So on this build the offer is not made at all: `canOfferReward` is false, the
 * result screen never renders the button, `rewardWasOffered` stays false (so
 * leaving the screen is not recorded as a decline — the player declined
 * nothing), and `claimReward` refuses outright. Build-time constants, so Rollup
 * folds the whole branch away on every other build.
 */
const isCrazyPreRelease = isCrazyWeb && !isCrazyGamesFullRelease

/**
 * The Wavedash build — `VITE_APP_WAVEDASH=true`.
 *
 * Wavedash has no ad SDK wired at all: the platform module declares
 * `hasAds: false` and `resolveAdProvider` falls through to the noop provider.
 * That lands the build in the same trap the CG pre-release sits in, one step
 * further along: `isRewardGated` reads the noop provider as "this build has no
 * videos, so the perk is simply free", which is the right answer for local dev
 * and itch and the wrong one for a portal. The result screen rendered a button
 * marked with a film frame and paid the ×3 out on the tap — a reviewer sees the
 * game hand over triple its run income for a click, with no video anywhere.
 *
 * So on Wavedash the offer is not made: `canOfferReward` is false, the result
 * screen never renders the button, `rewardWasOffered` stays false (so leaving
 * the screen is not recorded as a decline — the player declined nothing), the
 * auto-advance countdown is never held back by a pending reward, and
 * `claimReward` refuses outright. Build-time constant, so Rollup folds the
 * branch away on every other build.
 *
 * When Wavedash ships an ad SDK, wire a real provider in `resolveAdProvider`
 * and delete this constant — `isRewardGated` then resolves to `true` on its
 * own and the button comes back with a video behind it.
 */
const isWavedashNoAds = isWaveDash

/** Builds that must not OFFER a rewarded perk at all — no button, and no free
 *  grant standing in for the video that cannot play. */
const isRewardOfferSuppressed = isCrazyPreRelease || isWavedashNoAds

// ─── Rewarded rate limit ────────────────────────────────────────────────────
//
// A hard ceiling on how many rewarded videos may be REQUESTED in a rolling
// window, independent of what the provider's own readiness API says.
//
// Two reasons this has to live on our side. Portals treat a game that hammers
// the rewarded placement as abusive inventory use and reject it; and a player
// who can watch ads back to back will, then resent the game for letting them.
// The limit counts REQUESTS, not grants: a dismissed or unfilled ad still cost
// the network a call, and not counting it would let a player farm no-fills.

/** Rolling window length, ms. */
const REWARD_WINDOW_MS = 5 * 60 * 1000
/** Requests allowed inside one window. */
const REWARD_WINDOW_MAX = 6

/** Timestamps of rewarded requests inside the current window, oldest first. */
let rewardRequests: number[] = []
/** Bumped on every change so the `canOfferReward` computed re-evaluates. */
const rewardTick = ref(0)

const pruneRewardWindow = (now: number): void => {
  const cutoff = now - REWARD_WINDOW_MS
  if (rewardRequests.length > 0 && rewardRequests[0]! <= cutoff) {
    rewardRequests = rewardRequests.filter((t) => t > cutoff)
    rewardTick.value++
  }
}

/** True while the player has spent their rewarded allowance for this window. */
export const isRewardRateLimited = (): boolean => {
  void rewardTick.value
  pruneRewardWindow(Date.now())
  return rewardRequests.length >= REWARD_WINDOW_MAX
}

/** Seconds until the next rewarded slot frees up. 0 when one is available. */
export const rewardCooldownLeft = (): number => {
  const now = Date.now()
  pruneRewardWindow(now)
  if (rewardRequests.length < REWARD_WINDOW_MAX) return 0
  const oldest = rewardRequests[0]!
  return Math.max(0, Math.ceil((oldest + REWARD_WINDOW_MS - now) / 1000))
}

const recordRewardRequest = (): void => {
  rewardRequests.push(Date.now())
  rewardTick.value++
}

/** Test seam: forget every recorded request. */
export const __resetRewardWindow = (): void => {
  rewardRequests = []
  rewardTick.value++
}

/**
 * Run `grant` behind a rewarded video where the build calls for it.
 *
 * Returns whether the perk was granted. On a gated build a no-fill, a dismissed
 * ad or a blocked ad all resolve to `false` and grant nothing — the caller is
 * responsible for leaving its UI in a sane state, which is why `inFlight` is
 * exposed rather than each call site inventing its own busy flag.
 *
 * The rate limit is enforced here as well as in `canOfferReward`, because a
 * button is not the only way into this function and a limit that only hides UI
 * is not a limit.
 */
export const claimReward = async (grant: () => void): Promise<boolean> => {
  // Belt and braces: the button is not rendered on a build with the offer
  // suppressed (CG pre-release, Wavedash), but a free ×3 must not be reachable
  // by any other route either.
  if (isRewardOfferSuppressed) return false
  if (!isRewardGated) {
    grant()
    return true
  }
  if (adInFlight.value) return false
  if (isRewardRateLimited()) return false
  adInFlight.value = true
  recordRewardRequest()
  try {
    const ok = await showRewardedAd()
    if (ok) grant()
    return ok
  } finally {
    adInFlight.value = false
  }
}

/** True while a gated reward is waiting on its video. */
export const adInFlight = ref(false)

/**
 * Can this perk be offered right now?
 *
 * On a CG pre-release or Wavedash build: never — there is no inventory to offer
 * against. On an ungated build: always. On a gated build: only when the
 * provider actually has a rewarded ad ready AND the player has rewarded
 * allowance left in the current window. Offering a button that then fails reads
 * as the game being broken, which is exactly as true for a rate-limited refusal
 * as for a no-fill.
 */
export const canOfferReward = computed(
  () => !isRewardOfferSuppressed && (!isRewardGated || (isRewardedReady.value && !isRewardRateLimited()))
)

// ─── Interstitial pacing ────────────────────────────────────────────────────

/**
 * Minimum gap between interstitials, ms.
 *
 * 121 s, not 120. CrazyGames and Playgama both rate-limit interstitials to one
 * every two minutes and REJECT the request that arrives early — so a gate set
 * to exactly the platform's own limit loses the race to clock skew, timer
 * coalescing in a background tab, or the few milliseconds between our check and
 * the SDK's. The extra second costs nothing and turns a rejected request into a
 * filled one.
 *
 * ─── Why one number and not a per-platform table ────────────────────────────
 *
 * The pacing is time-based on EVERY build — not keyed to stages or waves — so
 * the only thing that could vary per portal is the length of the gap. Walking
 * the shipped targets, 121 s is the maximum of every documented minimum, so a
 * table would today hold nine identical entries:
 *
 *   • CrazyGames  — one midgame ad per 2 min; an early request is rejected.
 *   • Playgama    — Bridge's own `minimumDelayBetweenInterstitial` is 120 s.
 *   • Yandex      — ≥ 60 s apart, and none in the first 60 s after load. The
 *                   gap covers the first half, `INTERSTITIAL_AFTER_LOAD_MS`
 *                   below the second.
 *   • Poki        — paced server-side; the SDK's own bad-event gate is the only
 *                   client-side limit and it is about event SPACING, not ads.
 *   • GamePix / GameDistribution / GameMonetize — frequency-capped inside the
 *                   SDK, with published guidance of one interstitial every
 *                   2-3 min. 121 s is the floor, their cap is the ceiling.
 *
 * If a portal ever publishes a LONGER minimum, raise it here for that build
 * rather than reintroducing a stage counter — a stage-keyed cadence drifts with
 * how fast the player is, which is exactly what the portals' rules are not.
 */
const INTERSTITIAL_MIN_GAP_MS = 121_000

/**
 * No interstitial in the first minute after load (Yandex's rule; 61 s for the
 * same clock-skew reason as the gap). A first mission takes longer than that,
 * so in practice the first mission's Continue gets its ad.
 *
 * Only the midgame ad. The moderation-mandated first-load ad (GameMonetize,
 * `useFirstLoadInterstitial`) is its own path and is untouched — shipping there
 * depends on it.
 */
export const INTERSTITIAL_AFTER_LOAD_MS = 61_000

let lastInterstitialAt = 0
let sessionStartedAt = Date.now()

/**
 * True when an interstitial may run now: past the post-load minute, and a full
 * gap after the last one. The session's first break needs no earlier request
 * to start the clock.
 */
export const canShowInterstitial = (): boolean => {
  const now = Date.now()
  if (now - sessionStartedAt < INTERSTITIAL_AFTER_LOAD_MS) return false
  return lastInterstitialAt === 0 || now - lastInterstitialAt >= INTERSTITIAL_MIN_GAP_MS
}

/**
 * No rewarded offer in a new session's first three minutes: Poki, CrazyGames
 * and Playgama all ask for an ad-free start (playbook, phase 6); one number
 * for every build keeps it simple (#75).
 */
export const REWARD_GRACE_MS = 180_000
export const rewardGraceOver = (): boolean => Date.now() - sessionStartedAt >= REWARD_GRACE_MS

/**
 * May a rewarded video be OFFERED right now: a build with real videos, one
 * ready, allowance left, and past the start of the session. A build without
 * videos shows its other price instead (no free grant, no dead button).
 */
export const canOfferVideo = (): boolean => isRewardGated && canOfferReward.value && rewardGraceOver()

/** Record that an interstitial was just shown, restarting the 120 s clock. */
export const markInterstitialShown = (): void => {
  lastInterstitialAt = Date.now()
}

/** Seconds until the next interstitial is allowed — debug/telemetry only. */
export const interstitialCooldownLeft = (): number =>
  Math.max(0, INTERSTITIAL_MIN_GAP_MS - (Date.now() - lastInterstitialAt)) / 1000

/**
 * Test seam: reset the pacing clock. `sessionAgeMs` is how long the session is
 * pretended to have been running — by default already past the post-load
 * minute, so a spec about the GAP is not also a spec about that floor.
 */
export const __resetInterstitialClock = (sessionAgeMs = INTERSTITIAL_AFTER_LOAD_MS): void => {
  lastInterstitialAt = 0
  sessionStartedAt = Date.now() - sessionAgeMs
}
