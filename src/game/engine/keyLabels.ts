import { computed, reactive, watch } from 'vue'
import { getState, setState } from '@/use/useGameState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { KB_LAYOUT_KEY } from '@/keys'
import { boundCode } from './keyBindings'

/**
 * ─── What the key is called on THIS keyboard ─────────────────────────────────
 *
 * The game binds PHYSICAL keys (`KeyboardEvent.code`, see `keyBindings.ts`):
 * the key under the left ring finger is `KeyW` on every layout. Its printed
 * letter is not — an AZERTY player walks with Z Q S D, a QWERTZ player's
 * `KeyY` reads Z. Every keycap the HUD draws asks this module for the letter.
 *
 * Auto-detection, strongest evidence first:
 *   1. the Keyboard API's layout map (Chromium; refused in some embeds by the
 *      `keyboard-map` permissions policy, absent in Firefox and Safari by
 *      their choice — it is a fingerprinting surface);
 *   2. what the player TYPES: every letter key pressed teaches its own label
 *      (`observeKey`), and a telltale one (KeyW → "z", KeyY → "z") settles
 *      the whole layout. Remembered, so the next session starts right;
 *   3. before any of that, the browser language: French (not Canadian, not
 *      Swiss) guesses AZERTY; German, Swiss, Czech, Slovak, Hungarian and
 *      the ex-Yugoslav languages guess QWERTZ. A guess only — the first
 *      telltale key overrides it.
 * Switched off (Options → Controls), the player's chosen layout decides.
 *
 * Digits always read as digits (AZERTY prints & é " on them unshifted, and a
 * "&" on a weapon button helps nobody). The big named keys get their word in
 * the player's language (`keys.*`): the symbols (␣ ⇧ ⇥ ⏎) were not read as
 * keys at all — Brazilian playtesters took the space bar's ␣ for a smile, and
 * an ABNT2 keyboard prints nothing on it.
 */

export type Layout = 'qwerty' | 'qwertz' | 'azerty'
export const LAYOUTS: Layout[] = ['qwerty', 'qwertz', 'azerty']

/** Where a layout's letters differ from US QWERTY. */
const TABLES: Record<Layout, Record<string, string>> = {
  qwerty: {},
  qwertz: { KeyY: 'Z', KeyZ: 'Y' },
  azerty: { KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyZ: 'W', KeyM: ',', Semicolon: 'M' }
}

type Source = 'none' | 'language' | 'typed' | 'map'

interface Saved { auto: boolean; manual: Layout; detected: Layout | null }

export const keyboard = reactive({
  /** Detect the layout (true) or use `manual`. */
  auto: true,
  manual: 'qwerty' as Layout,
  /** What detection concluded, and from what. */
  detected: null as Layout | null,
  source: 'none' as Source
})

/** From the layout map and from typing: exact labels, any layout. */
const exact = reactive<Record<string, string>>({})

export const activeLayout = computed<Layout>(() => (keyboard.auto ? keyboard.detected ?? 'qwerty' : keyboard.manual))

/** The keys called by a word, the `keys.*` i18n key and its English. */
const WORDS: Record<string, readonly [string, string]> = {
  Space: ['space', 'Space'], ShiftLeft: ['shift', 'Shift'], ShiftRight: ['shift', 'Shift'], Tab: ['tab', 'Tab'],
  Enter: ['enter', 'Enter'], Backspace: ['backspace', 'Backspace'], CapsLock: ['caps', 'Caps Lock']
}

/** A translator (vue-i18n's `t`): the HUD passes its own so a key's word is in the game's language. */
export type KeyWords = (key: string) => string

const NAMED: Record<string, string> = {
  Escape: 'Esc', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', IntlBackslash: '<'
}

const fallback = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return code.slice(6)
  if (code.startsWith('F') && /^F\d+$/.test(code)) return code
  return NAMED[code] ?? code
}

/**
 * The printed label of a physical key, e.g. `KeyW` → "W" (or "Z" on AZERTY);
 * `Space` → "Espaço" with a Portuguese `t`, "Space" without one.
 */
export const keyLabel = (code: string, t?: KeyWords): string => {
  const word = WORDS[code]
  if (word) return t ? t(`keys.${word[0]}`) : word[1]
  if (code.startsWith('Digit') || code.startsWith('Numpad')) return fallback(code)
  if (keyboard.auto && exact[code]) return exact[code]!
  return TABLES[activeLayout.value][code] ?? fallback(code)
}

/** The label the HUD draws for a key it was written with (the DEFAULT key of
 *  an action): the action's key as bound now, in this keyboard's letters. */
export const actionKeyLabel = (defaultCode: string, t?: KeyWords): string => keyLabel(boundCode(defaultCode), t)

// ─── Detection ──────────────────────────────────────────────────────────────

/** Settle a layout from one code → character pair, if it tells. */
export const classify = (code: string, ch: string): Layout | null => {
  const c = ch.toLowerCase()
  if ((code === 'KeyW' && c === 'z') || (code === 'KeyQ' && c === 'a') || (code === 'KeyA' && c === 'q')) return 'azerty'
  if ((code === 'KeyY' && c === 'z') || (code === 'KeyZ' && c === 'y')) return 'qwertz'
  if ((code === 'KeyW' && c === 'w') || (code === 'KeyZ' && c === 'z') || (code === 'KeyY' && c === 'y')) return 'qwerty'
  return null
}

/** The browser language's usual layout — a first guess, nothing more. */
export const guessFromLanguage = (langs: readonly string[]): Layout => {
  const l = (langs[0] ?? '').toLowerCase()
  const [lang, region = ''] = l.split('-')
  if (lang === 'fr') return region === 'ca' ? 'qwerty' : region === 'ch' ? 'qwertz' : 'azerty'
  if (['de', 'cs', 'sk', 'hu', 'sl', 'hr', 'bs', 'sq', 'lb', 'rm'].includes(lang ?? '')) return 'qwertz'
  if (lang === 'it' && region === 'ch') return 'qwertz'
  return 'qwerty'
}

const RANK: Record<Source, number> = { none: 0, language: 1, typed: 2, map: 3 }
const conclude = (layout: Layout, source: Source): void => {
  if (RANK[source] < RANK[keyboard.source]) return
  keyboard.detected = layout
  keyboard.source = source
  if (source === 'typed' || source === 'map') persist()
}

const LETTER = /^\p{L}$/u
/**
 * A label worth showing: a Latin letter, or a mark that is no letter at all
 * (AZERTY's ","). A Cyrillic, Greek, Arabic … letter is not: those keyboards
 * print the Latin letter on the same key too, and that is the one players
 * and guides call the key by ("E", not "У").
 */
const SHOWABLE = (ch: string): boolean => !LETTER.test(ch) || /^\p{Script=Latin}$/u.test(ch)
/**
 * Learn from a real key press (the game's own keydown handler calls this):
 * its label, and — from a telltale key — the layout.
 */
export const observeKey = (e: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): void => {
  if (e.ctrlKey || e.altKey || e.metaKey || !e.key || [...e.key].length !== 1) return
  if (!e.code.startsWith('Key') && !(e.code in NAMED)) return
  const l = classify(e.code, e.key)
  // A telltale key that disagrees with what we believed: the player is typing
  // on another layout NOW (the OS layout switched after the map was read, or
  // the guess was wrong). Typing is the live truth — drop the old labels.
  if (l && l !== keyboard.detected) {
    for (const k of Object.keys(exact)) delete exact[k]
    keyboard.detected = l
    keyboard.source = 'typed'
    persist()
  } else if (l && RANK[keyboard.source] < RANK.typed) conclude(l, 'typed')
  if (LETTER.test(e.key) && SHOWABLE(e.key)) exact[e.code] = e.key.toUpperCase()
}

const LETTERS = Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`)

let asked = false
/** Detect the layout once (safe to call repeatedly). */
export const loadKeyboardLayout = async (): Promise<void> => {
  if (asked) return
  asked = true
  if (typeof navigator !== 'undefined' && keyboard.source === 'none') {
    conclude(guessFromLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? '']), 'language')
  }
  const kb = (typeof navigator !== 'undefined' ? (navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> }
  }).keyboard : undefined)
  if (!kb?.getLayoutMap) return
  try {
    const map = await kb.getLayoutMap()
    for (const code of [...LETTERS, 'Semicolon', 'Comma', 'Period']) {
      const k = map.get(code)
      // Only single printable characters; a dead key or a word keeps the default.
      if (k && [...k].length === 1 && k.trim() && SHOWABLE(k)) exact[code] = k.toUpperCase()
    }
    const w = map.get('KeyW') ?? ''
    const y = map.get('KeyY') ?? ''
    conclude(classify('KeyW', w) === 'azerty' ? 'azerty' : classify('KeyY', y) === 'qwertz' ? 'qwertz' : 'qwerty', 'map')
  } catch {
    // Permissions policy in an embed, or no layout: typing will tell.
  }
}

// ─── The player's settings ──────────────────────────────────────────────────

const persist = (): void => {
  const s: Saved = { auto: keyboard.auto, manual: keyboard.manual, detected: keyboard.source === 'typed' || keyboard.source === 'map' ? keyboard.detected : null }
  setState(KB_LAYOUT_KEY, s)
}

const read = (): void => {
  const s = getState<Partial<Saved> | null>(KB_LAYOUT_KEY, null)
  if (!s || typeof s !== 'object') return
  if (typeof s.auto === 'boolean') keyboard.auto = s.auto
  if (s.manual && LAYOUTS.includes(s.manual)) keyboard.manual = s.manual
  // A layout learned last time outranks a language guess this time.
  if (s.detected && LAYOUTS.includes(s.detected) && RANK[keyboard.source] < RANK.typed) {
    keyboard.detected = s.detected
    keyboard.source = 'typed'
  }
}

export const setAutoLayout = (on: boolean): void => {
  keyboard.auto = on
  persist()
}

export const setManualLayout = (l: Layout): void => {
  keyboard.manual = l
  persist()
}

read()
watch(saveDataVersion, read)

/** Test seam. */
export const __resetKeyboardForTests = (): void => {
  keyboard.auto = true
  keyboard.manual = 'qwerty'
  keyboard.detected = null
  keyboard.source = 'none'
  for (const k of Object.keys(exact)) delete exact[k]
  asked = false
}
