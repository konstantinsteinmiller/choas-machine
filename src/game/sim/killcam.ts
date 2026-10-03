import type { WeaponId } from '../data/ids'
import type { PostKind } from '../world/fortress'
import type { Zone } from './hitscan'

/**
 * ─── The kill-cam director ───────────────────────────────────────────────────
 *
 * Decides WHICH kills get the slow-motion treatment, and how much of it
 * (round 3, R27). A kill is scored by how far it was, whether the target was
 * moving, and where it was hit; the better the shot, the likelier the cam.
 *
 * Only a stealth kill can have one at all (#85): nobody fighting or hunting
 * the mech, and the shot a rifle headshot on a person or a round in a
 * machine's weak spot. Never a lamp, never a barrel, never a burst into a
 * fight. A boss gets its orbit only when the killing blow is a headshot.
 *
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
  zone?: 'head' | 'body' | 'limb' | 'weak' | 'joint' | 'other'
  /** The kill is a boss's. */
  boss?: boolean
  /** What fell: a person, a machine, or a lamp (searchlights). */
  kind?: 'human' | 'machine' | 'light'
  /** Nobody is fighting or hunting the mech: the raid is still quiet. */
  stealth?: boolean
  /** No headshot has ever been shown to this player (the profile says). */
  firstOfLife?: boolean
}

/**
 * May this kill have a camera at all (#85)? A quiet raid, and either a rifle
 * headshot on a person or a round in a machine's weak spot (its eye, vents,
 * joints or head). Lamps never.
 */
export const camWorthy = (k: KillInfo): boolean => {
  if (k.stealth === false || k.kind === 'light') return false
  if (k.kind === 'machine') return k.zone === 'weak' || k.zone === 'joint' || k.zone === 'head'
  return k.by === 'sniper' && (k.head || k.zone === 'head')
}

/** A hit zone as the director scores it. */
export const camZone = (z: Zone): NonNullable<KillInfo['zone']> => (z === 'armor' ? 'other' : z)

/** What a unit kind is to the director. */
export const camKind = (k: PostKind): NonNullable<KillInfo['kind']> =>
  k === 'searchlight' ? 'light' : k === 'guard' || k === 'sentry' || k === 'commander' ? 'human' : 'machine'

/** How good a kill was, 0 … 1: distance, the target's movement, where it was hit. */
export const killScore = (k: KillInfo): number => {
  const part = k.by === 'blade' ? 0.55 : k.head || k.zone === 'head' || k.zone === 'weak' ? 1 : k.zone === 'joint' ? 0.7 : k.zone === 'limb' ? 0.35 : k.zone === 'body' ? 0.45 : 0.3
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
  // A boss's fall gets its orbit only for a headshot, loud raid or not.
  if (k.boss) cut = k.final && (k.head || k.zone === 'head') ? 'boss' : 'none'
  else if (!camWorthy(k)) cut = 'none'
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
