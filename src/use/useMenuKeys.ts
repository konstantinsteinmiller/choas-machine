import { ref } from 'vue'

/**
 * ─── Menus by keyboard (#170) ────────────────────────────────────────────────
 *
 * Every dialog (`FModal`: the settings, the pause menu, …) is driven from the
 * keyboard as well as by pointer: Tab and Shift+Tab walk its controls and
 * wrap round inside it (focus never escapes to the game behind), the arrows
 * move between controls (up/down) and change the one in hand where it has
 * values (left/right on a tab row, a slider, a picker), Space and Enter press
 * what has focus, Esc closes. Only named keys are read (`e.key` for the
 * arrows, Tab, Enter; Space by `e.code` or its ' ' key), never letters, so
 * it is the same on QWERTY, QWERTZ, AZERTY or any other layout.
 *
 * Pure DOM: `menuStep` decides the next control, `focusablesIn` lists them.
 */

/** A key being captured for a binding (the Controls tab): menus leave every key alone meanwhile. */
export const keyCapture = ref(false)
/** Pickers with their list open (`FSelect`): Esc and the arrows are the list's meanwhile. */
export const listsOpen = ref(0)

const FOCUSABLE = [
  'button:not([disabled])', 'a[href]', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
].join(',')

/** The controls in `root` the keyboard can reach, in document order (hidden ones left out). */
export const focusablesIn = (root: ParentNode): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"], [hidden]') && shown(el))

/** On screen: the browser's own check where it has one, else no ancestor hidden by its style. */
const shown = (el: HTMLElement): boolean => {
  const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility
  if (check) return check.call(el, { visibilityProperty: true })
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const st = getComputedStyle(e)
    if (st.display === 'none' || st.visibility === 'hidden') return false
  }
  return true
}

export type MenuKey = 'next' | 'prev' | 'up' | 'down' | 'left' | 'right'

/** What a key means to a menu, or null: by named key only (layout-agnostic). */
export const menuKey = (e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>): MenuKey | null => {
  if (e.altKey || e.ctrlKey || e.metaKey) return null
  if (e.key === 'Tab' || e.code === 'Tab') return e.shiftKey ? 'prev' : 'next'
  switch (e.key) {
    case 'ArrowDown': return 'down'
    case 'ArrowUp': return 'up'
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
  }
  return null
}

/** Whether a control uses this arrow itself: a slider's and a tab row's left/right, a picker's left/right. */
export const ownsArrow = (el: Element | null, k: MenuKey): boolean => {
  if (!el) return false
  const horizontal = k === 'left' || k === 'right'
  if (!horizontal) return false
  if (el instanceof HTMLInputElement && el.type === 'range') return true
  if (el.getAttribute('role') === 'tab') return true
  if (el.getAttribute('aria-haspopup') === 'listbox') return true
  return false
}

/** The control to move to from `active` for key `k` among `list` (wrapping), or null when the control keeps the key. */
export const menuStep = (list: readonly HTMLElement[], active: Element | null, k: MenuKey): HTMLElement | null => {
  if (!list.length) return null
  const i = active ? list.indexOf(active as HTMLElement) : -1
  if (i >= 0 && ownsArrow(active, k)) return null
  const forward = k === 'next' || k === 'down' || k === 'right'
  if (i < 0) return forward ? list[0]! : list[list.length - 1]!
  return list[(i + (forward ? 1 : -1) + list.length) % list.length]!
}
