import type { WeaponId } from '../data/ids'

/**
 * ─── The kill-cam director ───────────────────────────────────────────────────
 *
 * Decides WHICH kills get the slow-motion treatment, and how much of it
 * (round 3, R27). A kill is scored by how far it was, whether the target was
 * moving, and where it was hit; the better the shot, the likelier the cam.
 * Rules over the dice:
 *  - the first landed headshot of a player's LIFE is always shown in full;
 *  - a boss's last blow gets its own slow orbit;
 *  - the kill that completes the objective is always shown;
 *  - after two kills in quick succession, a short cam for a good one, else none;
 *  - and never two full cams within KILLCAM_GAP_S of each other.
 * Pure: the caller brings the dice.
 */

export const KILLCAM_GAP_S = 5
/** Kills this close together are a quick succession. */
export const QUICK_S = 6
/** In a quick succession, a kill scoring this or better gets the short cam. */
export const SHORT_SCORE = 0.6
/** Chance of a full cam: the floor, and what a perfect score adds. */
export const CAM_FLOOR = 0.08
export const CAM_SPAN = 0.75
/** The far end of the distance score, metres. */
export const FAR_M = 50

export type CamCut = 'full' | 'short' | 'boss' | 'none'

export interface KillCamState {
  /** Mission time of the last kill-cam, or −∞. */
  last: number
  /** Sniper headshot kills so far this mission. */
  headshots: number
  /** Kill-cams shown this mission. */
  shown: number
  /** Mission times of the recent kills. */
  kills: number[]
}

export const makeKillCamState = (): KillCamState => ({ last: -Infinity, headshots: 0, shown: 0, kills: [] })

export interface KillInfo {
  by: WeaponId | 'blade'
  head: boolean
  /** This kill completes the mission's objective. */
  final: boolean
  /** Mission time. */
  time: number
  /** Metres from the mech. */
  dist?: number
  /** 0 standing … 1 at a run: the target's movement. */
  moving?: number
  /** Where the round went in (a headshot is `head` too). */
  zone?: 'head' | 'body' | 'limb' | 'other'
  /** The kill is a boss's. */
  boss?: boolean
  /** No headshot has ever been shown to this player (the profile says). */
  firstOfLife?: boolean
}

/** How good a kill was, 0 … 1: distance, the target's movement, where it was hit. */
export const killScore = (k: KillInfo): number => {
  const part = k.by === 'blade' ? 0.55 : k.head || k.zone === 'head' ? 1 : k.zone === 'limb' ? 0.35 : k.zone === 'body' ? 0.45 : 0.3
  const far = Math.min(1, Math.max(0, (k.dist ?? 0) / FAR_M))
  const moving = Math.min(1, Math.max(0, k.moving ?? 0))
  return 0.4 * part + 0.35 * far + 0.25 * moving
}

/**
 * How this kill is shown. `roll` is a uniform random number in [0, 1).
 * Updates the state either way (a headshot and a kill count whether or not
 * it is shown).
 */
export const chooseKillCam = (s: KillCamState, k: KillInfo, roll: number, enabled: boolean): CamCut => {
  const headshot = k.by === 'sniper' && k.head
  if (headshot) s.headshots++
  s.kills = s.kills.filter(t => k.time - t < QUICK_S)
  const quick = s.kills.length >= 2
  s.kills.push(k.time)
  if (!enabled) return 'none'
  const score = killScore(k)
  let cut: CamCut
  if (k.boss && k.final) cut = 'boss'
  else if (headshot && k.firstOfLife) cut = 'full'
  else if (k.final) cut = 'full'
  else if (quick) cut = score >= SHORT_SCORE && k.time - s.last >= 2 ? 'short' : 'none'
  else if (k.time - s.last < KILLCAM_GAP_S) cut = 'none'
  else cut = roll < CAM_FLOOR + CAM_SPAN * score ? 'full' : 'none'
  if (cut !== 'none') {
    s.last = k.time
    s.shown++
  }
  return cut
}

/** Shown at all (the old question). */
export const wantsKillCam = (s: KillCamState, k: KillInfo, roll: number, enabled: boolean): boolean =>
  chooseKillCam(s, k, roll, enabled) !== 'none'
