import { ref } from 'vue'
import { profile } from '@/game/state/profile'
import { canOfferVideo, claimReward } from '@/use/useAdGate'
import { logPaintVideo, paintVideosLeft } from '@/game/state/paint'

/**
 * ─── The game's rewarded placements (#75, #97) ───────────────────────────────
 *
 * Every placement in the game is listed here, so the rules live in one place:
 *  - `wheel`: a sure win on the rifle's fortune wheel; once per visit to the
 *    Command Base (a visit is the stretch between two raids), three a session;
 *  - `disguise`: a disguise unlocked for good; no cap beyond the provider's;
 *  - `upgrade`: a weapon upgrade (an Armory track, or a Forge tier's scrap)
 *    paid with a video instead of its Tech Scrap; three per visit to the
 *    Command Base (#182), shared by both, so the scrap the raids bring stays
 *    the way up and the video a lift. Spent, the button stays, disabled, and
 *    says it needs time to refresh (`offerSpent`);
 *  - `repair`: the defeat screen's Full Repair (#189) — back up where the mech
 *    fell, armour and every gun full, the base none the wiser;
 *  - `paint`: a mech paint scheme unlocked for good, or lent for the next
 *    mission (#M6); five in a rolling day, counted in the save
 *    (`state/paint.ts`). Spent, the button stays, disabled, with a timer.
 * An offer is only made when a video can actually play (`canOfferVideo`); on a
 * build without videos the placement shows its other price (Data Cores, scrap)
 * and never a free grant. The reward is granted only when the video finished,
 * by the caller's `grant`, which saves.
 */
export const REWARDED_PLACEMENTS = ['wheel', 'disguise', 'upgrade', 'repair', 'paint'] as const
export type RewardedPlacement = (typeof REWARDED_PLACEMENTS)[number]

const WHEEL_PER_SESSION = 3
let wheelSession = 0
/** The visit (missions done) the wheel's video was last used in. */
let wheelVisit = -1
/** Video upgrades a visit (#182). */
export const UPGRADE_VIDEOS_PER_VISIT = 3
/** The visit the count below belongs to, and how many it has used. */
let upgradeVisit = -1
let upgradeUsed = 0
const upgradesLeft = (): number => (upgradeVisit === profile.missions ? UPGRADE_VIDEOS_PER_VISIT - upgradeUsed : UPGRADE_VIDEOS_PER_VISIT)
/** Bumped whenever a placement is used, so the screens re-read their offer. */
export const offerTick = ref(0)

/** Can this placement show its video button now? */
export const canOffer = (p: RewardedPlacement): boolean => {
  void offerTick.value
  if (!canOfferVideo()) return false
  if (p === 'wheel') return wheelSession < WHEEL_PER_SESSION && wheelVisit !== profile.missions
  if (p === 'upgrade') return upgradesLeft() > 0
  if (p === 'paint') return paintVideosLeft() > 0
  return true
}

/**
 * A video could play, but this placement has used its share for the visit:
 * its button shows disabled, saying so, until the next mission (#182).
 */
export const offerSpent = (p: RewardedPlacement): boolean => {
  void offerTick.value
  if (!canOfferVideo()) return false
  if (p === 'paint') return paintVideosLeft() <= 0
  return p === 'upgrade' && upgradesLeft() <= 0
}

/** Play the video; `grant` runs only if it finished. True when it was granted. */
export const watchFor = async (p: RewardedPlacement, grant: () => void): Promise<boolean> => {
  if (!canOffer(p)) return false
  const ok = await claimReward(grant)
  if (ok && p === 'wheel') { wheelSession++; wheelVisit = profile.missions }
  if (ok && p === 'upgrade') {
    if (upgradeVisit !== profile.missions) { upgradeVisit = profile.missions; upgradeUsed = 0 }
    upgradeUsed++
  }
  if (ok && p === 'paint') logPaintVideo()
  offerTick.value++
  return ok
}

/** Test seam. */
export const __resetOffers = (): void => { wheelSession = 0; wheelVisit = -1; upgradeVisit = -1; upgradeUsed = 0; offerTick.value++ }
