// ─── Game-state field catalogue ─────────────────────────────────────────────
//
// Field names INSIDE the single `cmachine_state` blob (see
// `useGameState.ts`). These are NOT separate localStorage keys — they are
// properties of the one persisted object — but they are still a contract with
// the player base: renaming any of them strands existing players' progress on
// the old field. Treat them as load-bearing constants.
//
// Everything is `cm_`-prefixed (`STATE_FIELD_PREFIX`) so
// `SaveMergePolicy.isPayloadKey` can allowlist the whole surface with a single
// prefix.

/** Schema version of the blob (number). Bumped by a migration, never by hand. */
export const SCHEMA_KEY = 'cm_v'

// ─── Headline progress (flat numbers the save-merge score reads) ───────────
//
// Kept as flat numeric fields rather than buried inside a structured field
// because the save layer scores two snapshots against each other WITHOUT
// knowing anything about the game's object shapes
// (`SaveMergePolicy.computeMeta`), and a portal plugin (GamePix) reports two
// of them as score/level.

/** Fortresses cleared at least once — the campaign position. */
export const CLEARED_KEY = 'cm_cleared'
/** Medals earned across all fortresses (Ghost, Marksman, Swift). */
export const MEDALS_KEY = 'cm_medals'
/** Lifetime missions completed, replays included. */
export const MISSIONS_DONE_KEY = 'cm_missions'
/** Tech Scrap — the upgrade currency. */
export const SCRAP_KEY = 'cm_scrap'

// ─── Structured progress ────────────────────────────────────────────────────

/** Data Cores — earned only; they skip Forge timers. */
export const CORES_KEY = 'cm_cores'
/** `ArsenalSave` — blueprints, weapon tiers, upgrade levels, unlocked gear. */
export const ARSENAL_KEY = 'cm_arsenal'
/** `Record<fortressId, FortressSave>` — clears, medals and bests per fortress. */
export const FORTRESSES_KEY = 'cm_fortresses'
/** `ForgeSave | null` — the weapon tier under construction and its clock. */
export const FORGE_KEY = 'cm_forge'
/** `Record<InputFamily, Record<lessonId, uses>>` — control lessons learned. */
export const LESSONS_KEY = 'cm_lessons'
/** `string[]` — one-time moments already shown (first launch, reveals). */
export const SEEN_KEY = 'cm_seen'
/** `StatsSave` — lifetime counters. */
export const STATS_KEY = 'cm_stats'

// ─── User settings ──────────────────────────────────────────────────────────

export const SOUND_KEY = 'cm_user_sound_volume'
export const MUSIC_KEY = 'cm_user_music_volume'
export const LANGUAGE_KEY = 'cm_user_language'
/** `true` once the PLAYER picked a language in Options. A stored language
 *  without it is not a choice. */
export const LANGUAGE_CHOSEN_KEY = 'cm_user_language_chosen'
/** Look sensitivity multiplier (number, 0.4–2.0). Absent = 1. */
export const LOOK_SENS_KEY = 'cm_user_look_sensitivity'
/** Mobile-only hard audio mute (boolean). */
export const MOBILE_MUTE_KEY = 'cm_mobile_mute'
/** Vibration on / off (boolean). Absent means ON — see `useHaptics.ts`. */
export const HAPTICS_KEY = 'cm_user_haptics'
/** Kill-cams on / off (boolean). Absent means ON — see `useKillCam.ts`. */
export const KILLCAM_KEY = 'cm_user_killcam'
/** Rebound main keys, action → `KeyboardEvent.code` (`engine/keyBindings.ts`). */
export const KEY_BINDINGS_KEY = 'cm_user_key_bindings'
/** Keyboard layout: auto-detect on / off, the manual pick, the layout last
 *  detected from typing (`engine/keyLabels.ts`). */
export const KB_LAYOUT_KEY = 'cm_user_keyboard_layout'
