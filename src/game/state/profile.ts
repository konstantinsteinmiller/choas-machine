import { reactive, toRaw, watch } from 'vue'
import { SMITH_STEPS, tierWait, trackWait, type SmithStep } from '../sim/smithy'
import { TIER_MAX, TRACK_IDS, TRACK_MAX } from '../data/upgrades'
import { getState, setStates } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import {
  SCHEMA_KEY, CLEARED_KEY, MEDALS_KEY, MISSIONS_DONE_KEY, SCRAP_KEY, CORES_KEY, ARSENAL_KEY,
  FORTRESSES_KEY, FORGE_KEY, LESSONS_KEY, SEEN_KEY, STATS_KEY
} from '@/keys'
import { MEDAL_IDS, UNLOCK_IDS, WEAPON_IDS, type InputFamily, type MedalId, type UnlockId, type WeaponId } from '../data/ids'

/**
 * ─── The player profile ──────────────────────────────────────────────────────
 *
 * One reactive object the Command Base binds to and a mission reads its stats
 * from. It is persisted into the single `cmachine_state` blob as a handful of
 * `cm_*` fields (see `src/keys.ts`) at CHECKPOINTS — a mission end, a
 * purchase, a forge start — never per frame.
 *
 * Every field has a default and `loadProfile()` fills anything missing or
 * malformed, so an older save (or a partial cloud row) always hydrates into a
 * complete profile. The profile never holds one of the blob's own objects:
 * load and save both copy, so nothing changes in the blob between checkpoints.
 */

/** Version of the saved shape. Raise it with a step in `MIGRATIONS`. */
export const SCHEMA_VERSION = 1

export interface FortressSave {
  /** Times cleared, replays included. */
  clears: number
  medals: Record<MedalId, boolean>
  bestScore: number
  /** Fastest clear in seconds; 0 until cleared. */
  bestTime: number
}

export interface ArsenalSave {
  /** Unspent blueprints per weapon; the Forge consumes them. */
  blueprints: Record<WeaponId, number>
  /** Built tier per weapon, 1 (Mk I) to 5. */
  tiers: Record<WeaponId, number>
  /** Armory and Chassis Bay track levels, by track id. */
  upgrades: Record<string, number>
  unlocks: UnlockId[]
}

/**
 * The smithy's job (`sim/smithy.ts`): a weapon tier, or an upgrade track's
 * next level, on its way through the furnace, the anvil and the quench.
 */
export interface ForgeSave {
  /** The weapon a tier is for (an upgrade's weapon, or the sniper for the chassis). */
  weapon: WeaponId
  /** The tier being built; for an upgrade, the level it goes to. */
  tier: number
  /** Set when the job is an upgrade track rather than a weapon tier. */
  track?: string
  /** The next game to play. */
  step: SmithStep
  /** The wait before that game, in seconds (the melt, then the cooling). */
  total: number
  /** Seconds still owed, as of `stamp`. */
  remaining: number
  /** Wall clock (ms) when `remaining` was last settled. */
  stamp: number
  /** 0 … 1 how each game so far went. */
  scores: number[]
  /** Tech Scrap paid for it: the stars refund a share. */
  paid: number
}

export interface StatsSave {
  kills: number
  headshots: number
  stealthKills: number
  bladeKills: number
  alerts: number
  deaths: number
  playSeconds: number
}

export interface Profile {
  scrap: number
  cores: number
  /** Missions completed, replays included. */
  missions: number
  arsenal: ArsenalSave
  fortresses: Record<string, FortressSave>
  forge: ForgeSave | null
  lessons: Record<InputFamily, Record<string, number>>
  seen: string[]
  stats: StatsSave
}

const perWeapon = (n: number): Record<WeaponId, number> =>
  Object.fromEntries(WEAPON_IDS.map(w => [w, n])) as Record<WeaponId, number>

const noMedals = (): Record<MedalId, boolean> =>
  Object.fromEntries(MEDAL_IDS.map(m => [m, false])) as Record<MedalId, boolean>

export const defaultProfile = (): Profile => ({
  scrap: 0,
  cores: 0,
  missions: 0,
  arsenal: { blueprints: perWeapon(0), tiers: perWeapon(1), upgrades: {}, unlocks: [] },
  fortresses: {},
  forge: null,
  lessons: { touch: {}, desk: {} },
  seen: [],
  stats: { kills: 0, headshots: 0, stealthKills: 0, bladeKills: 0, alerts: 0, deaths: 0, playSeconds: 0 }
})

export const profile = reactive<Profile>(defaultProfile())

// ─── Reading a stored value defensively ──────────────────────────────────────

const int = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(record(v))) {
    const c = int(n, 0)
    if (c > 0) out[k] = c
  }
  return out
}
/** A structured-clone-safe copy with no reactive proxies in it. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v))) as T

const readFortress = (v: unknown): FortressSave => {
  const f = record(v)
  const m = record(f.medals)
  const medals = noMedals()
  for (const id of MEDAL_IDS) medals[id] = m[id] === true
  return { clears: int(f.clears, 0), medals, bestScore: int(f.bestScore, 0), bestTime: int(f.bestTime, 0) }
}

const readForge = (v: unknown): ForgeSave | null => {
  const f = record(v)
  if (!WEAPON_IDS.includes(f.weapon as WeaponId)) return null
  const track = typeof f.track === 'string' && (TRACK_IDS as readonly string[]).includes(f.track) ? f.track : undefined
  const tier = track ? int(f.tier, 1, 1, TRACK_MAX) : int(f.tier, 2, 2, TIER_MAX)
  // A build from before the smithy (an hour-long timer): it goes on to the
  // quench, with what is left of its wait cut to the smithy's.
  const step = SMITH_STEPS.includes(f.step as SmithStep) ? (f.step as SmithStep) : 'quench'
  const longest = track ? trackWait(tier) : tierWait(tier)
  const total = Math.min(longest, int(f.total, longest, 0))
  const scores = Array.isArray(f.scores) ? f.scores.filter((s): s is number => typeof s === 'number' && s >= 0 && s <= 1).slice(0, 2) : []
  return {
    weapon: f.weapon as WeaponId,
    tier,
    ...(track ? { track } : {}),
    step,
    total,
    remaining: int(f.remaining, total, 0, total),
    stamp: int(f.stamp, 0),
    scores,
    paid: int(f.paid, 0)
  }
}

// ─── Migrations ──────────────────────────────────────────────────────────────

/**
 * One step per schema version, applied to the raw stored fields before they
 * are read. `MIGRATIONS[n]` upgrades a save written at version `n` to `n + 1`.
 * Version 1 is the first shape, so the list is empty.
 */
type RawFields = Record<string, unknown>
const MIGRATIONS: Record<number, (raw: RawFields) => void> = {}

const FIELD_KEYS = [
  SCRAP_KEY, CORES_KEY, MISSIONS_DONE_KEY, ARSENAL_KEY, FORTRESSES_KEY, FORGE_KEY, LESSONS_KEY, SEEN_KEY, STATS_KEY
] as const

/** Fill the profile from the blob. Tolerates any missing or broken field. */
export const loadProfile = (): void => {
  const raw: RawFields = {}
  for (const k of FIELD_KEYS) raw[k] = getState<unknown>(k)
  for (let v = int(getState<unknown>(SCHEMA_KEY), SCHEMA_VERSION, 1); v < SCHEMA_VERSION; v++) MIGRATIONS[v]?.(raw)

  const d = defaultProfile()
  profile.scrap = int(raw[SCRAP_KEY], 0)
  profile.cores = int(raw[CORES_KEY], 0)
  profile.missions = int(raw[MISSIONS_DONE_KEY], 0)

  const a = record(raw[ARSENAL_KEY])
  const blueprints = record(a.blueprints)
  const tiers = record(a.tiers)
  for (const w of WEAPON_IDS) {
    d.arsenal.blueprints[w] = int(blueprints[w], 0)
    d.arsenal.tiers[w] = int(tiers[w], 1, 1, 5)
  }
  d.arsenal.upgrades = counts(a.upgrades)
  d.arsenal.unlocks = Array.isArray(a.unlocks)
    ? UNLOCK_IDS.filter(u => (a.unlocks as unknown[]).includes(u))
    : []
  profile.arsenal = d.arsenal

  const fortresses: Record<string, FortressSave> = {}
  for (const [id, f] of Object.entries(record(raw[FORTRESSES_KEY]))) fortresses[id] = readFortress(f)
  profile.fortresses = fortresses

  profile.forge = readForge(raw[FORGE_KEY])

  const lessons = record(raw[LESSONS_KEY])
  profile.lessons = { touch: counts(lessons.touch), desk: counts(lessons.desk) }

  const seen = raw[SEEN_KEY]
  profile.seen = Array.isArray(seen) ? [...new Set(seen.filter((s): s is string => typeof s === 'string'))] : []

  const stats = record(raw[STATS_KEY])
  for (const k of Object.keys(d.stats) as (keyof StatsSave)[]) d.stats[k] = int(stats[k], 0)
  profile.stats = d.stats
}

// ─── Headline numbers ────────────────────────────────────────────────────────

/** Fortresses cleared at least once: the campaign position. */
export const clearedCount = (): number =>
  Object.values(profile.fortresses).filter(f => f.clears > 0).length

/** Medals earned across every fortress. */
export const medalCount = (): number =>
  Object.values(profile.fortresses).reduce((n, f) => n + MEDAL_IDS.filter(m => f.medals[m]).length, 0)

/** The record for a fortress, created on first touch. */
export const fortressSave = (id: string): FortressSave =>
  (profile.fortresses[id] ??= { clears: 0, medals: noMedals(), bestScore: 0, bestTime: 0 })

/** A new player: nothing cleared, nothing played. Decides the first screen. */
export const isFreshProfile = (): boolean => profile.missions === 0 && clearedCount() === 0

/**
 * Persist the whole profile (a checkpoint). Cheap: one debounced blob write.
 * The flat headline fields are derived here, so the save layer's merge score
 * and the portals' score reports can never disagree with the fortress records.
 */
export const saveProfile = (): void => {
  setStates({
    [SCHEMA_KEY]: SCHEMA_VERSION,
    [CLEARED_KEY]: clearedCount(),
    [MEDALS_KEY]: medalCount(),
    [MISSIONS_DONE_KEY]: profile.missions,
    [SCRAP_KEY]: profile.scrap,
    [CORES_KEY]: profile.cores,
    [ARSENAL_KEY]: plain(profile.arsenal),
    [FORTRESSES_KEY]: plain(profile.fortresses),
    [FORGE_KEY]: profile.forge ? plain(profile.forge) : null,
    [LESSONS_KEY]: plain(profile.lessons),
    [SEEN_KEY]: plain(profile.seen),
    [STATS_KEY]: plain(profile.stats)
  })
}

/** Mark a one-time moment as shown, and save. */
export const markSeen = (flag: string): void => {
  if (profile.seen.includes(flag)) return
  profile.seen.push(flag)
  saveProfile()
}

let loaded = false
/** Load once, and re-load whenever a cloud hydrate lands new data. */
export const initProfile = (): void => {
  if (loaded) return
  loaded = true
  loadProfile()
  watch(saveDataVersion, () => loadProfile())
}
