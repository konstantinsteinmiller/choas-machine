/**
 * ─── The glyph vocabulary ───────────────────────────────────────────────────
 *
 * One flat, closed list of every icon the UI can draw. It lives in its own
 * module rather than inside `GameIcon.vue` so a component can import the *type*
 * (`GameIconName`) for a prop without pulling the SFC — and, more importantly,
 * so a typo in a call site is a compile error instead of a silently blank
 * button.
 *
 * Most buttons carry a glyph rather than a caption, which makes this list
 * load-bearing: `next` is not the word "Next", it is `skip-forward`.
 */
export const GAME_ICON_NAMES = [
  // Transport / run control
  'play', 'pause', 'replay', 'skip-forward', 'skip-back', 'stop',
  // Navigation
  'menu', 'home', 'back', 'forward', 'close', 'check',
  // Meta screens
  'settings', 'forge', 'info', 'help', 'map', 'fortress',
  // The smithy's three stations: the furnace, the anvil, the quench
  'flame', 'hammer', 'drop',
  // Audio
  'music', 'music-off', 'sound', 'sound-off',
  // Progression
  'lock', 'unlock', 'star', 'star-empty', 'trophy', 'chart', 'leaderboard', 'ghost',
  // Steppers / arrows
  'plus', 'minus', 'left', 'right', 'up', 'down',
  // Currencies: Tech Scrap (a hex nut), Data Cores (a chip), Blueprints (a sheet)
  'scrap', 'core', 'blueprint', 'gem', 'clock',
  // The mech and its kit
  'mech', 'paint', 'sniper', 'minigun', 'rocket', 'blade', 'decoy', 'armor', 'shield', 'bolt', 'heart',
  // The unit frame (#145): the chassis' integrity, a magazine running low, one empty
  'chassis', 'ammo-low', 'ammo-out',
  // In the field
  'scope', 'eye', 'crouch', 'stand', 'sprint', 'hook', 'box', 'siren', 'warning', 'skull', 'drone', 'fullscreen', 'share',
  // A rewarded video is always marked with this (CrazyGames' rule, #75)
  'video',
  // The rope gun's line (#94)
  'rope',
  // The touch action pictograms: the mech doing the thing (`actionGlyphs.ts`)
  'act-jump', 'act-crouch', 'act-stand', 'act-sprint', 'act-hide', 'act-decoy', 'act-swap', 'act-fire', 'act-scope', 'act-unscope'
] as const

export type GameIconName = (typeof GAME_ICON_NAMES)[number]

/** Runtime guard for the places a name arrives as a plain string (a legacy
 *  `FIconButton` call site, a config blob) and must be proven before use. */
export const isGameIconName = (v: unknown): v is GameIconName =>
  typeof v === 'string' && (GAME_ICON_NAMES as readonly string[]).includes(v)
