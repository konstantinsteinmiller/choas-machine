import { WEAPON_IDS, type WeaponId } from './ids'
import type { GameIconName } from '@/components/icons/iconNames'

/**
 * ─── What the Command Base sells ─────────────────────────────────────────────
 *
 * The Armory's and the Chassis Bay's upgrade tracks (GDD 3.2), the weapon
 * tiers the smithy makes, and the one function that turns a save into the numbers a
 * mission plays with (`loadoutOf`). Pure data and arithmetic: the balance
 * test runs on this file alone.
 */

export const TRACK_IDS = [
  'sniperZoom', 'sniperDamage', 'sniperSilence', 'minigunCooling', 'minigunDamage', 'rocketBlast', 'rocketAmmo',
  'armor', 'speed', 'decoy'
] as const
export type TrackId = (typeof TRACK_IDS)[number]
export type Station = 'armory' | 'chassis'

export interface Track {
  id: TrackId
  station: Station
  icon: GameIconName
  /** The weapon it belongs to, for grouping in the Armory. */
  weapon?: WeaponId
}

export const TRACKS: Readonly<Record<TrackId, Track>> = {
  sniperZoom: { id: 'sniperZoom', station: 'armory', icon: 'scope', weapon: 'sniper' },
  sniperDamage: { id: 'sniperDamage', station: 'armory', icon: 'sniper', weapon: 'sniper' },
  sniperSilence: { id: 'sniperSilence', station: 'armory', icon: 'sound-off', weapon: 'sniper' },
  minigunCooling: { id: 'minigunCooling', station: 'armory', icon: 'bolt', weapon: 'minigun' },
  minigunDamage: { id: 'minigunDamage', station: 'armory', icon: 'minigun', weapon: 'minigun' },
  rocketBlast: { id: 'rocketBlast', station: 'armory', icon: 'rocket', weapon: 'rocket' },
  rocketAmmo: { id: 'rocketAmmo', station: 'armory', icon: 'plus', weapon: 'rocket' },
  armor: { id: 'armor', station: 'chassis', icon: 'armor' },
  speed: { id: 'speed', station: 'chassis', icon: 'mech' },
  decoy: { id: 'decoy', station: 'chassis', icon: 'decoy' }
}

export const TRACK_MAX = 5
const TRACK_BASE_COST = 60
const TRACK_COST_GROWTH = 1.6

/** Tech Scrap for the next level of a track that stands at `level`; 0 at the top. */
export const trackCost = (level: number): number =>
  level >= TRACK_MAX ? 0 : Math.round((TRACK_BASE_COST * Math.pow(TRACK_COST_GROWTH, level)) / 5) * 5

/** Everything a track costs from nothing to its top. */
export const trackTotalCost = (): number => {
  let n = 0
  for (let l = 0; l < TRACK_MAX; l++) n += trackCost(l)
  return n
}

// ─── The Forge ───────────────────────────────────────────────────────────────

export const TIER_MAX = 5
/** Blueprints of the weapon, and Tech Scrap, to start building a tier. */
const TIER_BLUEPRINTS: Readonly<Record<number, number>> = { 2: 2, 3: 3, 4: 4, 5: 5 }
const TIER_SCRAP: Readonly<Record<number, number>> = { 2: 120, 3: 260, 4: 520, 5: 980 }
/** Each tier is this much more damage than the one before it. */
export const TIER_DAMAGE_STEP = 0.18
export const tierBlueprints = (tier: number): number => TIER_BLUEPRINTS[tier] ?? 0
export const tierScrap = (tier: number): number => TIER_SCRAP[tier] ?? 0
/** Data Cores to cut a smithy wait short: one, whatever is left of it. */
export const skipCost = (remaining: number): number => (remaining <= 0 ? 0 : 1)

// ─── What a mission plays with ───────────────────────────────────────────────

export interface Loadout {
  /** The scope's field of view at the reference aspect, degrees. */
  scopeFov: number
  /** Damage multiplier per weapon: its tier and its damage track together. */
  damage: Record<WeaponId, number>
  /** How far a silenced miss is heard, metres. */
  missEarshot: number
  /** Seconds of fire before the minigun overheats, and how fast it cools. */
  heatSeconds: number
  coolRate: number
  blastRadius: number
  rockets: number
  armor: number
  speed: number
  decoySeconds: number
}

/** The mech as it leaves the factory. */
export const BASE_LOADOUT: Readonly<Loadout> = {
  scopeFov: 17,
  damage: { sniper: 1, minigun: 1, rocket: 1 },
  missEarshot: 8,
  heatSeconds: 5,
  coolRate: 0.4,
  blastRadius: 5.5,
  rockets: 6,
  armor: 100,
  speed: 1,
  decoySeconds: 9
}

export interface LoadoutSource {
  tiers: Record<WeaponId, number>
  upgrades: Record<string, number>
}

const level = (src: LoadoutSource, id: TrackId): number => Math.min(TRACK_MAX, Math.max(0, src.upgrades[id] ?? 0))

/** The numbers a mission plays with, from what the player owns. */
export const loadoutOf = (src: LoadoutSource): Loadout => {
  const tier = (w: WeaponId): number => 1 + TIER_DAMAGE_STEP * (Math.min(TIER_MAX, Math.max(1, src.tiers[w] ?? 1)) - 1)
  return {
    scopeFov: BASE_LOADOUT.scopeFov - 1.2 * level(src, 'sniperZoom'),
    damage: {
      sniper: tier('sniper') * (1 + 0.12 * level(src, 'sniperDamage')),
      minigun: tier('minigun') * (1 + 0.12 * level(src, 'minigunDamage')),
      rocket: tier('rocket')
    },
    missEarshot: BASE_LOADOUT.missEarshot - level(src, 'sniperSilence'),
    heatSeconds: BASE_LOADOUT.heatSeconds + 0.7 * level(src, 'minigunCooling'),
    coolRate: BASE_LOADOUT.coolRate * (1 + 0.1 * level(src, 'minigunCooling')),
    blastRadius: BASE_LOADOUT.blastRadius + 0.5 * level(src, 'rocketBlast'),
    rockets: BASE_LOADOUT.rockets + level(src, 'rocketAmmo'),
    armor: BASE_LOADOUT.armor + 20 * level(src, 'armor'),
    speed: BASE_LOADOUT.speed + 0.04 * level(src, 'speed'),
    decoySeconds: BASE_LOADOUT.decoySeconds + 2 * level(src, 'decoy')
  }
}

/**
 * What one level of a track is worth, as the number the Base shows next to
 * it: the value at `lvl` (so `trackValue(id, 0)` is the factory figure).
 */
export const trackValue = (id: TrackId, lvl: number): number => {
  const l = loadoutOf({ tiers: Object.fromEntries(WEAPON_IDS.map(w => [w, 1])) as Record<WeaponId, number>, upgrades: { [id]: lvl } })
  switch (id) {
    case 'sniperZoom': return Math.round((BASE_LOADOUT.scopeFov / l.scopeFov) * 35) / 10
    case 'sniperDamage': return Math.round(l.damage.sniper * 100)
    case 'sniperSilence': return l.missEarshot
    case 'minigunCooling': return Math.round(l.heatSeconds * 10) / 10
    case 'minigunDamage': return Math.round(l.damage.minigun * 100)
    case 'rocketBlast': return l.blastRadius
    case 'rocketAmmo': return l.rockets
    case 'armor': return l.armor
    case 'speed': return Math.round(l.speed * 100)
    case 'decoy': return l.decoySeconds
  }
}
