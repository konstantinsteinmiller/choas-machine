/**
 * The disguises (#97), as data: what the save and the menus need, without the
 * models (`disguises.ts` builds those).
 */
export const DISGUISE_IDS = ['toaster', 'crate', 'clown', 'horse', 'bush', 'teddy'] as const
export type DisguiseId = (typeof DISGUISE_IDS)[number]
/** The one every mech has from the start. */
export const FREE_DISGUISE: DisguiseId = 'toaster'
/** Scrap to unlock one where there is no rewarded video (and always as the alternative). */
export const DISGUISE_SCRAP = 400
