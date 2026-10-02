import { MEDAL_IDS, type WeaponId } from '../data/ids'
import {
  TIER_MAX, TRACK_MAX, loadoutOf, skipCost, tierBlueprints, tierBuildSeconds, tierScrap, trackCost, type Loadout, type TrackId
} from '../data/upgrades'
import { THREAT_LEVELS, defeatScrap, payout, type MissionResult, type Payout } from '../sim/rewards'
import { fortressSave, profile, saveProfile, type ForgeSave } from './profile'

/**
 * ─── The player's progress ───────────────────────────────────────────────────
 *
 * Everything that CHANGES the profile, in one place: banking a mission,
 * buying an upgrade, running the Forge. Each action checks that it is
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
export const bankMission = (r: MissionResult, level: number): Payout => {
  const rec = fortressSave(levelKey(level))
  const pay = payout(r, level, rec, profile.missions)
  rec.clears++
  for (const m of MEDAL_IDS) if (pay.medals[m]) rec.medals[m] = true
  rec.bestScore = Math.max(rec.bestScore, pay.score)
  const t = Math.round(r.time)
  rec.bestTime = rec.bestTime > 0 ? Math.min(rec.bestTime, t) : t
  profile.missions++
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
  profile.stats.deaths++
  addStats(r)
  saveProfile()
  return kept
}

// ─── The Armory and the Chassis Bay ──────────────────────────────────────────

export const trackLevel = (id: TrackId): number => Math.min(TRACK_MAX, profile.arsenal.upgrades[id] ?? 0)

export const canBuyTrack = (id: TrackId): boolean => {
  const l = trackLevel(id)
  return l < TRACK_MAX && profile.scrap >= trackCost(l)
}

export const buyTrack = (id: TrackId): boolean => {
  if (!canBuyTrack(id)) return false
  const l = trackLevel(id)
  profile.scrap -= trackCost(l)
  profile.arsenal.upgrades[id] = l + 1
  saveProfile()
  return true
}

// ─── The Forge ───────────────────────────────────────────────────────────────

/**
 * Seconds still owed on a build as of `now` (ms).
 *
 * The save's `stamp` is the LATEST wall clock the build has ever been looked
 * at, and it never moves back: a device clock wound back credits nothing
 * until it has passed that mark again, so winding it back and then forward
 * cannot finish a build.
 */
export const forgeRemaining = (f: ForgeSave, now: number): number => {
  const elapsed = Math.max(0, (now - f.stamp) / 1000)
  return Math.max(0, f.remaining - elapsed)
}

/** Fold the time that has passed into the save (call when the Forge is shown). */
export const settleForge = (now: number = Date.now()): void => {
  const f = profile.forge
  if (!f) return
  if (now <= f.stamp) return
  f.remaining = Math.ceil(forgeRemaining(f, now))
  f.stamp = now
  saveProfile()
}

export const canForge = (w: WeaponId): boolean => {
  const next = profile.arsenal.tiers[w] + 1
  return !profile.forge && next <= TIER_MAX
    && profile.arsenal.blueprints[w] >= tierBlueprints(next) && profile.scrap >= tierScrap(next)
}

/** Start building the next tier of a weapon. One build at a time. */
export const startForge = (w: WeaponId, now: number = Date.now()): boolean => {
  if (!canForge(w)) return false
  const tier = profile.arsenal.tiers[w] + 1
  profile.arsenal.blueprints[w] -= tierBlueprints(tier)
  profile.scrap -= tierScrap(tier)
  const total = tierBuildSeconds(tier)
  profile.forge = { weapon: w, tier, total, remaining: total, stamp: now }
  saveProfile()
  return true
}

/** Data Cores to finish the running build now; 0 when there is none or it is done. */
export const forgeSkipCost = (now: number = Date.now()): number =>
  profile.forge ? skipCost(forgeRemaining(profile.forge, now)) : 0

/** Spend Data Cores to finish the build now. */
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

/** Take a finished build out of the Forge: the weapon is now that tier. */
export const claimForge = (now: number = Date.now()): boolean => {
  const f = profile.forge
  if (!f || forgeRemaining(f, now) > 0) return false
  profile.arsenal.tiers[f.weapon] = Math.max(profile.arsenal.tiers[f.weapon], f.tier)
  profile.forge = null
  saveProfile()
  return true
}
