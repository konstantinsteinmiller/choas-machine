/**
 * The closed id sets the save, the simulation and the UI all name things by.
 * They live apart from the data tables so the profile can type its fields
 * without importing weapon stats or level layouts.
 */

/** The mech's three ranged weapons (GDD 2.1, 2.2). The blade is not one: it
 *  is always fitted and has no tier. */
export const WEAPON_IDS = ['sniper', 'minigun', 'rocket'] as const
export type WeaponId = (typeof WEAPON_IDS)[number]

/** Gear that is earned during the campaign and then stays. */
export const UNLOCK_IDS = ['decoy', 'minigun', 'rocket'] as const
export type UnlockId = (typeof UNLOCK_IDS)[number]

/** The three medals a fortress can be cleared with (GDD 6, the tally). */
export const MEDAL_IDS = ['ghost', 'marksman', 'swift'] as const
export type MedalId = (typeof MEDAL_IDS)[number]

/** Which kind of input a control lesson was learned on. A desktop veteran on
 *  a phone has still not learned the joystick. */
export const INPUT_FAMILIES = ['touch', 'desk'] as const
export type InputFamily = (typeof INPUT_FAMILIES)[number]
