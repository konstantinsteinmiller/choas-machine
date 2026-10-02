import type { WeaponId } from '../data/ids'

/**
 * ─── The kill-cam director ───────────────────────────────────────────────────
 *
 * Decides WHICH kills get the slow-motion treatment (GDD 2.3, plan G11):
 * about half of the sniper's headshots, about a fifth of everything else,
 * always the first headshot of a mission and always the kill that completes
 * the objective, and never two within five seconds of each other. Pure: the
 * caller brings the dice.
 */

export const RATE_HEADSHOT = 0.5
export const RATE_OTHER = 0.2
export const KILLCAM_GAP_S = 5

export interface KillCamState {
  /** Mission time of the last kill-cam, or −∞. */
  last: number
  /** Sniper headshot kills so far this mission. */
  headshots: number
  /** Kill-cams shown this mission. */
  shown: number
}

export const makeKillCamState = (): KillCamState => ({ last: -Infinity, headshots: 0, shown: 0 })

export interface KillInfo {
  by: WeaponId | 'blade'
  head: boolean
  /** This kill completes the mission's objective. */
  final: boolean
  /** Mission time. */
  time: number
}

/**
 * Should this kill be shown? `roll` is a uniform random number in [0, 1).
 * Updates the state either way (a headshot counts whether or not it is shown).
 */
export const wantsKillCam = (s: KillCamState, k: KillInfo, roll: number, enabled: boolean): boolean => {
  const headshot = k.by === 'sniper' && k.head
  const firstHeadshot = headshot && s.headshots === 0
  if (headshot) s.headshots++
  if (!enabled) return false
  let show: boolean
  if (k.final) show = true
  else if (k.time - s.last < KILLCAM_GAP_S) show = false
  else if (firstHeadshot) show = true
  else show = roll < (headshot ? RATE_HEADSHOT : RATE_OTHER)
  if (show) {
    s.last = k.time
    s.shown++
  }
  return show
}
