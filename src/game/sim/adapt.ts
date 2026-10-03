/**
 * ─── The base learns (R26) ───────────────────────────────────────────────────
 *
 * The last raid's habits, answered in the next one, and said on the Command
 * Base's threat card before the player deploys:
 *  - many headshots → the guards wear helmets (the first round to the head
 *    takes the helmet off instead of the guard);
 *  - the hide box used a lot → guards check a box that sits still in plain
 *    view, and poke it;
 *  - rifle kills from the perch → a searchlight sweeps the perch.
 * Pure: counted by the mission, kept in the profile, read by the fortress
 * builder and the garrison.
 */

export interface Habits {
  headshots: number
  /** Times the mech went under the hide box. */
  boxUses: number
  /** Rifle kills made from the perch. */
  perchKills: number
}

export interface Answers {
  helmets: boolean
  boxCheck: boolean
  perchLight: boolean
}

/** How much of a habit the base needs to see before it answers. */
export const HELMETS_AT = 4
export const BOX_AT = 3
export const PERCH_AT = 2

export const NO_ANSWERS: Readonly<Answers> = { helmets: false, boxCheck: false, perchLight: false }

export const answersTo = (h: Habits | null | undefined): Answers => !h ? { ...NO_ANSWERS } : {
  helmets: h.headshots >= HELMETS_AT,
  boxCheck: h.boxUses >= BOX_AT,
  perchLight: h.perchKills >= PERCH_AT
}

/** The answers that are in force, in the order the threat card lists them. */
export const ANSWER_IDS = ['helmets', 'boxCheck', 'perchLight'] as const
export type AnswerId = (typeof ANSWER_IDS)[number]
