import { ref } from 'vue'
import { mobileCheck } from '@/utils/function'

/**
 * ─── A keyboard beside the touch HUD ─────────────────────────────────────────
 *
 * A touchscreen laptop or a 2-in-1 is a touch-first device: the game keeps
 * the touch HUD for the session (`engine/input.ts`, `touchFirst`). Its player
 * may still be using a mouse and keyboard — a playtester clicked the hook
 * button's picture on a lesson card with the mouse and nothing happened. Where
 * that is likely (a fine pointer, not a phone) or certain (a key was pressed),
 * every picture of a button — the lesson card, the prompt over the world, the
 * hologram's press — shows its keyboard shortcut beside it.
 */
const fine = typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches
export const keyboardToo = ref(fine && !(typeof navigator !== 'undefined' && mobileCheck()))

if (typeof window !== 'undefined' && !keyboardToo.value) {
  const seen = (e: KeyboardEvent): void => {
    // Modifier and system keys alone say nothing (an on-screen keyboard's shift).
    if (e.key.length !== 1 && !/^(Tab|Enter|Escape|Arrow\w+| )$/.test(e.key)) return
    keyboardToo.value = true
    window.removeEventListener('keydown', seen, true)
  }
  window.addEventListener('keydown', seen, true)
}
