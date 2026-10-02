import type { GameIconName } from './iconNames'

/**
 * ─── The floor under every icon-only control ────────────────────────────────
 *
 * A glyph has no accessible name of its own. A button that is nothing but a
 * glyph is announced as "button" by a screen reader and is unqueryable by a
 * selector-based test — so every icon-only control in the game has to carry an
 * `aria-label`, and every call site is expected to pass one from its own screen
 * ("Next stage", not "Next").
 *
 * This map is what happens when one forgets. It is deliberately not a substitute
 * for the caller's label: a generic name is a worse label than a specific one,
 * just an enormously better one than none.
 *
 * Where the game already names an action, the key points at THAT string rather
 * than a second translation of the same word — the settings cog is
 * `options.title` in every shipped language already. Only the generic transport
 * and navigation glyphs, which the game had no word for, get keys of their own
 * under `ui.*`.
 */
export const ICON_LABEL_KEYS: Partial<Record<GameIconName, string>> = {
  play: 'ui.play',
  pause: 'ui.pause',
  replay: 'ui.replay',
  'skip-forward': 'ui.next',
  menu: 'ui.menu',
  home: 'ui.home',
  back: 'ui.back',
  info: 'ui.info',
  // Named by the screens they open.
  settings: 'options.title',
  close: 'close',
  music: 'options.music',
  'music-off': 'options.music',
  sound: 'options.soundEffects',
  'sound-off': 'options.soundEffects'
}

/**
 * Resolve the accessible name for a glyph control.
 *
 * `explicit` is the caller's own label and always wins. `te` is vue-i18n's
 * key-exists check, passed in so this module stays free of the i18n runtime and
 * can be unit-tested without one — and so a key that gets renamed degrades to
 * the glyph's name instead of rendering the raw key path aloud.
 */
export const resolveIconLabel = (
  explicit: string | undefined,
  icon: GameIconName | undefined,
  t: (key: string) => string,
  te: (key: string) => boolean
): string | undefined => {
  if (explicit) return explicit
  if (!icon) return undefined
  const key = ICON_LABEL_KEYS[icon]
  return key && te(key) ? t(key) : icon
}
