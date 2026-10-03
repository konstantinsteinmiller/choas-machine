import { MEDAL_IDS, WEAPON_IDS, type MedalId, type WeaponId } from '../data/ids'

/**
 * ─── What a mission pays ─────────────────────────────────────────────────────
 *
 * The tally at the end of an extraction (GDD 3.1, 6): a score, up to three
 * medals, and the three currencies. Pure: the mission's counters in, the
 * numbers on the rewards screen out.
 *
 *  - Tech Scrap is the everyday currency: every clear pays, more at a higher
 *    threat level, more for a clean job.
 *  - Blueprints build weapon tiers at the Forge: one per clear, one more for
 *    a Ghost run.
 *  - Data Cores are rare and only ever earned: one for each medal the first
 *    time it is won at a level, one for the first clear of a level.
 */

export const THREAT_LEVELS = 5

export interface MissionResult {
  /** Seconds from control to extraction. */
  time: number
  shots: number
  hits: number
  headshots: number
  kills: number
  bladeKills: number
  /** Times a defender was sure it saw the mech. */
  spotted: number
  bodiesFound: number
  /** The base reached full alert. */
  loud: boolean
  /** Salvage carried out (what the piles were worth), and piles stripped. */
  salvage?: number
  piles?: number
  /** The Commander, and his tank where there was one, went down. */
  bossDown?: boolean
}

/** Seconds under which a clear earns the Swift medal, by threat level. */
export const swiftPar = (level: number): number => 150 + 30 * (level - 1)
/** Share of rounds on target, and the least rounds fired, for Marksman. */
export const MARKSMAN_ACCURACY = 0.7
export const MARKSMAN_MIN_SHOTS = 4

/** The medals a result earns. */
export const medalsOf = (r: MissionResult, level: number): Record<MedalId, boolean> => ({
  // Ghost: the base never knew. No full alert, and nobody was ever sure.
  ghost: !r.loud && r.spotted === 0,
  marksman: r.shots >= MARKSMAN_MIN_SHOTS && r.hits / r.shots >= MARKSMAN_ACCURACY,
  swift: r.time <= swiftPar(level)
})

export const scoreOf = (r: MissionResult, level: number, medals: Record<MedalId, boolean>): number => {
  const quiet = r.loud ? 0 : 1500
  const time = Math.max(0, Math.round((swiftPar(level) * 2 - r.time) * 5))
  const base = r.kills * 100 + r.headshots * 150 + r.bladeKills * 120 - r.spotted * 80 - r.bodiesFound * 60
  const medalBonus = MEDAL_IDS.filter(m => medals[m]).length * 750
  return Math.max(0, Math.round((base + quiet + time + medalBonus) * (1 + 0.25 * (level - 1))))
}

export interface Payout {
  score: number
  medals: Record<MedalId, boolean>
  /** Medals not held at this level before this run. */
  newMedals: MedalId[]
  scrap: number
  cores: number
  /** One entry per blueprint, each for a weapon. */
  blueprints: WeaponId[]
  firstClear: boolean
}

/** What the player already holds at this level. */
export interface LevelRecord {
  clears: number
  medals: Record<MedalId, boolean>
}

/**
 * Tech Scrap for clearing a level, before the bonuses: what a raid that took
 * only the salvage it needed brings home (`salvageNeed` piles at about 45).
 * Kept for the tests' and the tally's sake; the payout itself counts the
 * salvage actually carried out.
 */
export const baseScrap = (level: number): number => 90 + 45 * (level - 1)
/** The Commander's own scrap, for the raid that also took him down. */
export const BOSS_SCRAP = 60
/** Salvage carried home from a run whose result does not say (an old save's tally, a test). */
const salvageOf = (r: MissionResult, level: number): number => r.salvage ?? baseScrap(level)

/**
 * The payout for an extraction. `missions` is how many the player has
 * completed before this one: it decides which weapon the blueprint is for,
 * so they come round in turn.
 */
export const payout = (r: MissionResult, level: number, held: LevelRecord, missions: number): Payout => {
  const medals = medalsOf(r, level)
  const newMedals = MEDAL_IDS.filter(m => medals[m] && !held.medals[m])
  const firstClear = held.clears === 0
  const earned = MEDAL_IDS.filter(m => medals[m]).length
  const scrap = Math.round(
    // The salvage is the haul; a medal is worth a fifth of it on top.
    salvageOf(r, level) * (1 + 0.2 * earned) + r.kills * 4 + r.headshots * 4 + (r.bossDown ? BOSS_SCRAP : 0) + (firstClear ? baseScrap(level) : 0)
  )
  const blueprints: WeaponId[] = [WEAPON_IDS[missions % WEAPON_IDS.length]!]
  if (medals.ghost) blueprints.push(WEAPON_IDS[(missions + 1) % WEAPON_IDS.length]!)
  return {
    score: scoreOf(r, level, medals),
    medals,
    newMedals,
    scrap,
    cores: newMedals.length + (firstClear ? 1 : 0),
    blueprints,
    firstClear
  }
}

/** Share of the scrap a run had earned that survives a defeat (plan G16). */
export const DEFEAT_KEEP = 0.3

/** Tech Scrap kept when the mech goes down. */
export const defeatScrap = (r: MissionResult, level: number): number =>
  // Every pile stripped is kept whole (it was taken; the Base has it); a
  // share of the rest, and a little for turning up at all.
  Math.round((r.salvage ?? 0) + (baseScrap(level) * 0.25 + r.kills * 4 + r.headshots * 4) * DEFEAT_KEEP)
