import { QUIP_SAID, type QuipId } from '../audio/voiceCatalog'

/**
 * ─── When CM-07 speaks (#126) ────────────────────────────────────────────────
 *
 * The clown star of the show, never chatty: a line on a big moment, and then
 * quiet for a good while. Unseen it whispers; spotted, out loud. Pure.
 */

/** Between any two lines (s). */
export const QUIP_GAP_S = 15
/** A headshot or a burn may follow sooner, if it is not the same line again. */
export const QUIP_GAP_HOT_S = 10
/** The same line, not again this soon. */
export const QUIP_REPEAT_S = 60
/** How long the bubble stays up. */
export const QUIP_SHOW_S = 2.8

const HOT: ReadonlySet<QuipId> = new Set(['headshot', 'burnHuman', 'burnMachine'])

export interface Quips {
  /** When the last line was said, and which. */
  last: number
  lastId: QuipId | null
  by: Partial<Record<QuipId, number>>
}

export const makeQuips = (): Quips => ({ last: -1e9, lastId: null, by: {} })

/**
 * May CM-07 say `id` now? `spotted`: anyone is onto it (then out loud,
 * else whispered). Null when it keeps quiet (too soon, said lately, or no
 * take for how it would have to say it); else how, and it counts as said.
 */
export const pickQuip = (s: Quips, id: QuipId, now: number, spotted: boolean): { id: QuipId; whisper: boolean } | null => {
  const whisper = !spotted
  if (whisper ? !QUIP_SAID[id].whisper : !QUIP_SAID[id].loud) return null
  const gap = HOT.has(id) && s.lastId !== id ? QUIP_GAP_HOT_S : QUIP_GAP_S
  if (now - s.last < gap) return null
  if (now - (s.by[id] ?? -1e9) < QUIP_REPEAT_S) return null
  s.last = now
  s.lastId = id
  s.by[id] = now
  return { id, whisper }
}
