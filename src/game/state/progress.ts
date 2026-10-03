import type { Habits } from '../sim/adapt'
import { MEDAL_IDS, type WeaponId } from '../data/ids'
import {
  TIER_MAX, TRACKS, TRACK_MAX, loadoutOf, skipCost, tierBlueprints, tierScrap, trackCost, type Loadout, type TrackId
} from '../data/upgrades'
import { refundOf, starsOf, tierWait, trackWait } from '../sim/smithy'
import { THREAT_LEVELS, defeatScrap, payout, type MissionResult, type Payout } from '../sim/rewards'
import { fortressSave, profile, saveProfile, type ForgeSave } from './profile'

/**
 * ─── The player's progress ───────────────────────────────────────────────────
 *
 * Everything that CHANGES the profile, in one place: banking a mission,
 * buying an upgrade, running the smithy. Each action checks that it is
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

// ─── The Armory and the Chassis Bay ──────────────────────────────────────────

export const trackLevel = (id: TrackId): number => Math.min(TRACK_MAX, profile.arsenal.upgrades[id] ?? 0)

/** The smithy makes one thing at a time. */
export const smithBusy = (): boolean => !!profile.forge

export const canBuyTrack = (id: TrackId): boolean => {
  const l = trackLevel(id)
  return l < TRACK_MAX && profile.scrap >= trackCost(l) && !smithBusy()
}

/**
 * Pay for a track's next level and put it in the smithy. The level is the
 * player's once the part has been through the quench (`smithStep`).
 */
export const buyTrack = (id: TrackId, now: number = Date.now()): boolean => {
  if (!canBuyTrack(id)) return false
  const l = trackLevel(id)
  const cost = trackCost(l)
  profile.scrap -= cost
  profile.forge = {
    weapon: TRACKS[id].weapon ?? 'sniper', tier: l + 1, track: id,
    step: 'furnace', total: trackWait(l + 1), remaining: 0, stamp: now, scores: [], paid: cost
  }
  saveProfile()
  return true
}

// ─── The smithy ──────────────────────────────────────────────────────────────

/**
 * Seconds still owed on the smithy's wait as of `now` (ms).
 *
 * The save's `stamp` is the LATEST wall clock the job has ever been looked
 * at, and it never moves back: a device clock wound back credits nothing
 * until it has passed that mark again, so winding it back and then forward
 * cannot finish a wait.
 */
export const forgeRemaining = (f: ForgeSave, now: number): number => {
  const elapsed = Math.max(0, (now - f.stamp) / 1000)
  return Math.max(0, f.remaining - elapsed)
}

/** Fold the time that has passed into the save (call when the smithy is shown). */
export const settleForge = (now: number = Date.now()): void => {
  const f = profile.forge
  if (!f) return
  if (now <= f.stamp) return
  f.remaining = Math.ceil(forgeRemaining(f, now))
  f.stamp = now
  saveProfile()
}

/** The next game can be played now. */
export const smithReady = (now: number = Date.now()): boolean => !!profile.forge && forgeRemaining(profile.forge, now) <= 0

export const canForge = (w: WeaponId): boolean => {
  const next = profile.arsenal.tiers[w] + 1
  return !smithBusy() && next <= TIER_MAX
    && profile.arsenal.blueprints[w] >= tierBlueprints(next) && profile.scrap >= tierScrap(next)
}

/** Put the next tier of a weapon in the smithy. */
export const startForge = (w: WeaponId, now: number = Date.now()): boolean => {
  if (!canForge(w)) return false
  const tier = profile.arsenal.tiers[w] + 1
  profile.arsenal.blueprints[w] -= tierBlueprints(tier)
  const cost = tierScrap(tier)
  profile.scrap -= cost
  profile.forge = { weapon: w, tier, step: 'furnace', total: tierWait(tier), remaining: 0, stamp: now, scores: [], paid: cost }
  saveProfile()
  return true
}

/** Data Cores to finish the running wait now; 0 when there is none or it is over. */
export const forgeSkipCost = (now: number = Date.now()): number =>
  profile.forge ? skipCost(forgeRemaining(profile.forge, now)) : 0

/** Spend a Data Core to finish the wait now. */
export const skipForge = (now: number = Date.now()): boolean => {
  const f = profile.forge
  if (!f) return false
  const cost = skipCost(forgeRemaining(f, now))
  if (cost <= 0 || profile.cores < cost) return false
  profile.cores -= cost
  f.remaining = 0
  f.stamp = Math.max(f.stamp, now)
  saveProfile()
  return true
}

export interface SmithResult {
  stars: 1 | 2 | 3
  refund: number
  weapon: WeaponId
  tier: number
  track?: TrackId
}

/**
 * One of the smithy's games was played, with that quality (0 … 1). The
 * furnace and the anvil move the job on to its next wait; the quench
 * finishes it: the tier or the level is the player's, and the stars refund
 * some scrap. Returns the result then; null before, or when it was not ready.
 */
export const smithStep = (quality: number, now: number = Date.now()): SmithResult | null => {
  const f = profile.forge
  if (!f || forgeRemaining(f, now) > 0) return null
  f.scores.push(Math.max(0, Math.min(1, quality)))
  if (f.step !== 'quench') {
    f.step = f.step === 'furnace' ? 'anvil' : 'quench'
    f.remaining = f.total
    f.stamp = Math.max(f.stamp, now)
    saveProfile()
    return null
  }
  const stars = starsOf(f.scores)
  const refund = refundOf(f.paid, stars)
  const track = f.track as TrackId | undefined
  if (track) profile.arsenal.upgrades[track] = Math.max(trackLevel(track), f.tier)
  else profile.arsenal.tiers[f.weapon] = Math.max(profile.arsenal.tiers[f.weapon], f.tier)
  profile.scrap += refund
  profile.forge = null
  saveProfile()
  return { stars, refund, weapon: f.weapon, tier: f.tier, ...(track ? { track } : {}) }
}
