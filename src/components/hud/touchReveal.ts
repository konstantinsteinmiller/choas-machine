import { reactive } from 'vue'
import { LESSON_IDS, type LessonId } from '@/game/data/fortresses/training'
import { hud } from '@/game/state/hud'
import { profile } from '@/game/state/profile'

/**
 * ─── The touch buttons, revealed in the order the training needs them ───────
 *
 * A first-time player on a phone used to meet the whole cluster at once. In
 * the training each button now appears in the room that first needs it, and
 * stays: jump (and the hook, an offer of its own) from the start; sneak in the
 * cover room; the trigger, the weapon switch and the scope in the weapons
 * room (the three guards); the decoy in the decoy room; the disguise in the
 * box room. Anywhere else — a mission, a desktop, a player who has been
 * through the training before — everything is there.
 *
 * The room that reveals a button also points at it (`RevealArrow`), until it
 * is pressed.
 */

export type Revealable = 'crouch' | 'shoot' | 'weapon' | 'scope' | 'decoy' | 'hide'

/** The room each button first appears in. */
export const REVEAL_ROOM: Readonly<Record<Revealable, LessonId>> = {
  crouch: 'cover', shoot: 'weapons', weapon: 'weapons', scope: 'weapons', decoy: 'decoy', hide: 'box'
}

/** The button a room introduces, pointed at until pressed (by its test id). */
export const REVEAL_ARROW: Readonly<Partial<Record<LessonId, string>>> = {
  cover: 'btn-crouch', weapons: 'btn-weapons', decoy: 'btn-decoy', box: 'btn-hide'
}

/** The furthest the player has come in this run of the training (rooms do not un-reveal walking back). */
const reached = (): number => Math.max(hud.training.room, hud.training.done)

/** Is this button on screen yet? */
export const revealed = (b: Revealable): boolean => {
  if (hud.device !== 'touch' || !hud.training.on || profile.seen.includes('training')) return true
  return reached() >= LESSON_IDS.indexOf(REVEAL_ROOM[b])
}

/** Buttons pressed at least once this session (their test ids): the new-button arrow lets go. */
export const pressedOnce = reactive(new Set<string>())
