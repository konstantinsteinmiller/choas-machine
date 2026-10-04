import { ref } from 'vue'
import { profile } from '@/game/state/profile'
import { canOfferVideo, claimReward } from '@/use/useAdGate'

/**
 * ─── The game's rewarded placements (#75, #97) ───────────────────────────────
 *
 * Every placement in the game is listed here, so the rules live in one place:
 *  - `wheel`: a sure win on the rifle's fortune wheel; once per visit to the
 *    Command Base (a visit is the stretch between two raids), three a session;
 *  - `disguise`: a disguise unlocked for good; no cap beyond the provider's.
 * An offer is only made when a video can actually play (`canOfferVideo`); on a
 * build without videos the placement shows its other price (Data Cores, scrap)
 * and never a free grant. The reward is granted only when the video finished,
 * by the caller's `grant`, which saves.
 */
export const REWARDED_PLACEMENTS = ['wheel', 'disguise'] as const
export type RewardedPlacement = (typeof REWARDED_PLACEMENTS)[number]

const WHEEL_PER_SESSION = 3
let wheelSession = 0
/** The visit (missions done) the wheel's video was last used in. */
let wheelVisit = -1
/** Bumped whenever a placement is used, so the screens re-read their offer. */
export const offerTick = ref(0)

/** Can this placement show its video button now? */
export const canOffer = (p: RewardedPlacement): boolean => {
  void offerTick.value
  if (!canOfferVideo()) return false
  if (p === 'wheel') return wheelSession < WHEEL_PER_SESSION && wheelVisit !== profile.missions
  return true
}

/** Play the video; `grant` runs only if it finished. True when it was granted. */
export const watchFor = async (p: RewardedPlacement, grant: () => void): Promise<boolean> => {
  if (!canOffer(p)) return false
  const ok = await claimReward(grant)
  if (ok && p === 'wheel') { wheelSession++; wheelVisit = profile.missions }
  offerTick.value++
  return ok
}

/** Test seam. */
export const __resetOffers = (): void => { wheelSession = 0; wheelVisit = -1; offerTick.value++ }
