// ─── The hidden QA interstitial tap ─────────────────────────────────────────
//
// Twenty taps on the pause menu's "PAUSED" title inside twenty seconds request
// an interstitial, from any mission (the training ground too). The title takes
// the tap itself (`pointerdown`); the pause menu has already handed the mouse
// back, so on desktop it never touches the pointer lock.
//
// It exists because every portal's interstitial is PACED. The real placement
// runs only at the end of the way out, before the result screen, and `canShowInterstitial` holds a
// 121 s gap between ads, so a reviewer checking the things portals grade —
// does the ad mute the music, does it stop the loop, does the music come back
// on a no-fill — has to finish a mission for each attempt, on a build where
// the answer might be no. This is the back door that turns that into a
// ten-second job on the bundle they are actually reviewing.
//
// ── Why it is silent ──
//
// No counter, no toast, no glyph. A visible affordance is a feature the player
// can find, and an ad the player can summon is an ad nobody asked for. The tap
// count and the window ARE the secret, and twenty deliberate taps in thirty
// seconds is not a shape a run produces by accident: the title is a label
// rather than a control, and the number of times a real session taps it is
// zero. The failure mode of guessing wrong here is one extra ad, which is why
// this is allowed to ship rather than being hidden behind `isDebug` — QA runs
// the same artefact the player gets, and a back door that only opens on a
// debug build cannot be used to test the build being submitted. That includes
// the Poki and Playgama releases: it is not dev tooling in the sense of
// `src/platforms/policy.ts`, so no build aliases it out and no release gate
// refuses its `[qa-ad]` log line.
//
// ── What it still owes ──
//
// It bypasses the PACING gate deliberately — that is the whole point — and
// obeys every other rule the real placements obey:
//
//   • it seeds the shared clock (`markInterstitialShown`), so the NEXT
//     placement still owes the full 121 s. Without this a tester could hand a
//     portal two interstitials inside the window it rate-limits on, which is
//     the abuse those limits exist to catch;
//   • it restarts the music on `.finally()`, because this placement interrupts
//     a LIVE run. `showMidgameAd` hard-stops the music and clears the play
//     INTENT by design (so nothing can sound under an ad whose promise settles
//     early), and the thing that normally brings it back is the next
//     `startBattleMusic()` on a result screen — minutes away mid-run. Same
//     rule `useFirstLoadInterstitial` follows, for the same reason;
//   • it refuses while an ad is already up, so a tester who keeps tapping
//     cannot stack a second request behind the first.
//
// The pause gate, the audio suspend and the gameplay bracket come free:
// `showMidgameAd` flips `isAdShowing`, which ORs into `isGamePaused` and is one
// of `isGameplayLive`'s inputs, so the portals are told play stopped and told
// again when it resumes.
import { showMidgameAd } from '@/use/useAds'
import { markInterstitialShown } from '@/use/useAdGate'
import { isAdShowing } from '@/use/useGamePause'
import { resumeMusicAfterAd } from '@/use/useSound'

/** Taps that open the door… */
export const QA_AD_TAPS = 20
/** …and the rolling window they have to land inside, ms. */
export const QA_AD_WINDOW_MS = 20_000

/** Timestamps of the taps still inside the window, oldest first. */
let taps: number[] = []
/** True from the request until the ad settles — see the stacking rule above. */
let inFlight = false

/** Test seam: forget every recorded tap. */
export const __resetQaAdTaps = (): void => {
  taps = []
  inFlight = false
}

/**
 * Record one tap on the PAUSED title, and request an interstitial once
 * `QA_AD_TAPS` of them have landed inside `QA_AD_WINDOW_MS`.
 *
 * The window ROLLS rather than being counted from the first tap: a tester who
 * starts slowly and speeds up is asking for the same thing, and a window that
 * had to be restarted from scratch would make the back door fiddlier to open
 * than the two minutes of play it exists to replace. It is also what makes
 * the taps "consecutive": a pause of more than the window drops the taps
 * before it, so the count restarts.
 *
 * @param now injectable clock, for tests.
 * @returns whether this tap fired the ad. Nothing in the game reads it; it is
 *          what makes the trigger assertable without an ad provider.
 */
export const registerQaAdTap = (now: number = Date.now()): boolean => {
  taps.push(now)
  const cutoff = now - QA_AD_WINDOW_MS
  if (taps[0]! <= cutoff) taps = taps.filter((t) => t > cutoff)
  if (taps.length < QA_AD_TAPS) return false

  // Spent either way. A refused burst has to be re-earned rather than leaving
  // the counter armed, or the ad that could not open now opens on tap 31.
  taps = []
  if (inFlight || isAdShowing.value) return false

  inFlight = true
  markInterstitialShown()
  showMidgameAd()
    .catch((e) => console.warn('[qa-ad] interstitial failed', e))
    .finally(() => {
      inFlight = false
      resumeMusicAfterAd()
    })
  return true
}
