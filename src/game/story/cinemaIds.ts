/**
 * The story's scenes (round 4, #100 #103), and how long each runs. Tiny on
 * purpose: menus and the flow read it without pulling the scenes' code in.
 */
export const CINEMA_IDS = ['intro', 'salvage', 'fallBastion', 'fallFoundry', 'outro'] as const
export type CinemaId = (typeof CINEMA_IDS)[number]

export const CINEMA_LENGTH: Readonly<Record<CinemaId, number>> = {
  intro: 59, salvage: 10, fallBastion: 16, fallFoundry: 16, outro: 40
}

/**
 * Space held this long skips a cutscene (#175: a story scene, a mission's
 * drop-in and its way out), its ring filling round the key; a press alone
 * does not (Space is the jump).
 */
export const SKIP_HOLD_S = 1.5

/**
 * The intro ends on a still of what is coming (#179): the third fortress,
 * held this long: long enough to take in where the next fight is.
 */
export const INTRO_STILL_S = 6

/** The `seen` flag a scene sets once it has played. */
export const seenKey = (id: CinemaId): string => `cine:${id}`

/**
 * Which scene a banked extraction earns, if any: the haul after the first
 * clear of Bastion I and II (#103), the fall of the Bastion and the Foundry
 * at their first clear of threat III, the outro at the Spire's first clear
 * of threat III (round 5, #144: it used to wait on a Harbour threat V that
 * no longer exists).
 */
export const cinemaAfterClear = (fort: string, level: number, firstClear: boolean): CinemaId | null => {
  if (!firstClear) return null
  if (fort === 'bastion' && level <= 2) return 'salvage'
  if (fort === 'bastion' && level === 3) return 'fallBastion'
  if (fort === 'foundry' && level === 3) return 'fallFoundry'
  if (fort === 'spire' && level === 3) return 'outro'
  return null
}
