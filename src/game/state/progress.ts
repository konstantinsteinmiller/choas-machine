import type { Habits } from '../sim/adapt'
import { MEDAL_IDS, type WeaponId } from '../data/ids'
import {
  TIER_MAX, TRACK_MAX, loadoutOf, tierBlueprints, tierScrap, trackCost, type Loadout, type TrackId
} from '../data/upgrades'
import { MELT_BONUS, meltStars } from '../sim/smithy'
import { MISS_REFUND, spinCost, winChance, winGain } from '../data/wheel'
import { THREAT_LEVELS, defeatScrap, payout, type MissionResult, type Payout } from '../sim/rewards'
import { fortressSave, profile, saveProfile } from './profile'

/**
 * ─── The player's progress ───────────────────────────────────────────────────
 *
 * Everything that CHANGES the profile, in one place: banking a mission,
 * buying an upgrade or a weapon tier (at once, #75), melting the haul,
 * spinning the rifle's wheel. Each action checks that it is
 * allowed, applies itself, and saves; the screens only call these and read
 * the profile.
 */

/** The one fortress of the campaign (plan G5): its five threat levels are
 *  five records, `bastion-1` … `bastion-5`. */
export const FORTRESS_ID = 'bastion'
export const levelKey = (level: number): string => `${FORTRESS_ID}-${level}`

/** The highest threat level the player may deploy to: one past the last cleared. */
export const unlockedLevel = (): number => {
  let n = 1
  while (n < THREAT_LEVELS && (profile.fortresses[levelKey(n)]?.clears ?? 0) > 0) n++
  return n
}

/**
 * The CAMPAIGN SCORE: the player's best mission score at each threat level,
 * added up. It only ever grows, which is what the leaderboard ranks on.
 */
export const campaignScore = (): number => {
  let n = 0
  for (let l = 1; l <= THREAT_LEVELS; l++) n += profile.fortresses[levelKey(l)]?.bestScore ?? 0
  return n
}

/** The highest threat level cleared, 0 when none: the board's second column. */
export const highestCleared = (): number => {
  let n = 0
  for (let l = 1; l <= THREAT_LEVELS; l++) if ((profile.fortresses[levelKey(l)]?.clears ?? 0) > 0) n = l
  return n
}

/** The numbers the next mission plays with. */
export const currentLoadout = (): Loadout => loadoutOf(profile.arsenal)

// ─── Missions ────────────────────────────────────────────────────────────────

const addStats = (r: MissionResult): void => {
  const s = profile.stats
  s.kills += r.kills
  s.headshots += r.headshots
  s.bladeKills += r.bladeKills
  // A kill made before the base went loud is a stealth kill, for the record.
  if (!r.loud) s.stealthKills += r.kills
  if (r.loud) s.alerts++
  s.playSeconds += Math.round(r.time)
}

/** Bank an extraction. Returns what was paid, for the rewards screen. */
/** What the base saw of the raid: its habits (`sim/adapt.ts`). */
const habitsOf = (r: MissionResult): Habits => ({ headshots: r.headshots, boxUses: r.boxUses ?? 0, perchKills: r.perchKills ?? 0 })

export const bankMission = (r: MissionResult, level: number): Payout => {
  const rec = fortressSave(levelKey(level))
  const pay = payout(r, level, rec, profile.missions)
  rec.clears++
  for (const m of MEDAL_IDS) if (pay.medals[m]) rec.medals[m] = true
  rec.bestScore = Math.max(rec.bestScore, pay.score)
  const t = Math.round(r.time)
  rec.bestTime = rec.bestTime > 0 ? Math.min(rec.bestTime, t) : t
  profile.missions++
  profile.habits = habitsOf(r)
  profile.scrap += pay.scrap
  // The haul waits on the furnace: melted well, it pays a little more (#75).
  lastHaul = { scrap: pay.haul, melted: false }
  profile.cores += pay.cores
  for (const w of pay.blueprints) profile.arsenal.blueprints[w]++
  addStats(r)
  saveProfile()
  return pay
}

/** Bank a defeat: a share of the scrap, and the record of it. Returns the scrap kept. */
export const bankDefeat = (r: MissionResult, level: number): number => {
  const kept = defeatScrap(r, level)
  profile.scrap += kept
  profile.habits = habitsOf(r)
  profile.stats.deaths++
  addStats(r)
  saveProfile()
  return kept
}

// ─── The furnace: the haul, melted (#75) ─────────────────────────────────────

/** The last raid's haul (its salvage's scrap), and whether it has been through the furnace. */
let lastHaul = { scrap: 0, melted: true }

/** Scrap the furnace could still add to the last haul, at its best. */
export const haulToMelt = (): number => (lastHaul.melted ? 0 : Math.round(lastHaul.scrap * MELT_BONUS[3]))

/**
 * The furnace was played on the last haul, with that quality (0 … 1): the
 * stars it earned add a share of the haul's scrap. Once per raid; returns
 * the stars and the scrap it added, or null when there is nothing to melt.
 */
export const meltHaul = (quality: number): { stars: 1 | 2 | 3; bonus: number } | null => {
  if (lastHaul.melted) return null
  const stars = meltStars(quality)
  const bonus = Math.round(lastHaul.scrap * MELT_BONUS[stars])
  lastHaul.melted = true
  profile.scrap += bonus
  saveProfile()
  return { stars, bonus }
}

/** Test seam: set the haul waiting on the furnace. */
export const __setHaul = (scrap: number): void => { lastHaul = { scrap, melted: false } }

// ─── The Armory and the Chassis Bay ──────────────────────────────────────────

export const trackLevel = (id: TrackId): number => Math.min(TRACK_MAX, profile.arsenal.upgrades[id] ?? 0)

export const canBuyTrack = (id: TrackId): boolean => {
  const l = trackLevel(id)
  return l < TRACK_MAX && profile.scrap >= trackCost(l)
}

/** Pay for a track's next level; it is the player's at once (#75: no smithy). */
export const buyTrack = (id: TrackId): boolean => {
  if (!canBuyTrack(id)) return false
  const l = trackLevel(id)
  profile.scrap -= trackCost(l)
  profile.arsenal.upgrades[id] = l + 1
  saveProfile()
  return true
}

// ─── The Forge: weapon tiers ─────────────────────────────────────────────────

export const canForge = (w: WeaponId): boolean => {
  const next = profile.arsenal.tiers[w] + 1
  return next <= TIER_MAX && profile.arsenal.blueprints[w] >= tierBlueprints(next) && profile.scrap >= tierScrap(next)
}

/** Build the next tier of a weapon: blueprints and scrap in, the tier out, at once. */
export const buildTier = (w: WeaponId): boolean => {
  if (!canForge(w)) return false
  const tier = profile.arsenal.tiers[w] + 1
  profile.arsenal.blueprints[w] -= tierBlueprints(tier)
  profile.scrap -= tierScrap(tier)
  profile.arsenal.tiers[w] = tier
  saveProfile()
  return true
}

// ─── The rifle's wheel (#75) ─────────────────────────────────────────────────

/** The wheel opens once the rifle's damage track is at its top. */
export const wheelOpen = (): boolean => trackLevel('sniperDamage') >= TRACK_MAX

/** How a spin is paid for: scrap, a Data Core (a sure win), or a rewarded video (a sure win). */
export type SpinPay = 'scrap' | 'core' | 'ad'
export const SURE_SPIN_CORES = 1

export const canSpin = (pay: SpinPay): boolean => {
  if (!wheelOpen()) return false
  if (pay === 'scrap') return profile.scrap >= spinCost(profile.arsenal.wheel.wins)
  if (pay === 'core') return profile.cores >= SURE_SPIN_CORES
  return true
}

export interface SpinResult {
  won: boolean
  /** Rifle damage the win added (a share), and scrap a miss handed back. */
  gain: number
  refund: number
}

/**
 * Spin. `roll` is a uniform number in [0, 1): the caller rolls BEFORE the
 * wheel turns, so what the wheel lands on is what was decided. A core or a
 * video is a sure win; scrap wins with the chance the wheel shows.
 */
export const spinWheel = (pay: SpinPay, roll: number): SpinResult | null => {
  if (!canSpin(pay)) return null
  const w = profile.arsenal.wheel
  let stake = 0
  if (pay === 'scrap') { stake = spinCost(w.wins); profile.scrap -= stake }
  else if (pay === 'core') profile.cores -= SURE_SPIN_CORES
  const won = pay !== 'scrap' || roll < winChance(w.wins, w.misses)
  let gain = 0
  let refund = 0
  if (won) {
    gain = winGain(w.wins)
    w.wins++
    w.misses = 0
  } else {
    w.misses++
    refund = Math.round(stake * MISS_REFUND)
    profile.scrap += refund
  }
  saveProfile()
  return { won, gain, refund }
}
