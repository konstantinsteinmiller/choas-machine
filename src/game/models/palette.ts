/**
 * Shared palette: the lilac, pink and cyan of the storyboard. Everything that
 * has a signature colour pulls it from here so the models, the particles and
 * the HUD agree.
 */
export const PAL = {
  // The mech: lilac armour over a dark suit, a pink visor, cyan power lines.
  mechArmor: '#b9a6ff',
  mechArmorHi: '#d8ccff',
  mechArmorDeep: '#8a74e0',
  mechSuit: '#3a2a6e',
  mechSuitDeep: '#241848',
  mechVisor: '#1c1233',
  mechEye: '#ff5fb7',
  mechCore: '#5fe9ff',
  mechBlade: '#ff7fd0',
  // Weapons
  gunMetal: '#4a3d86',
  gunDark: '#2a1f55',
  gunAccent: '#5fe9ff',
  // The garrison: humans in dark teal uniforms, so they read against lilac.
  skin: '#ffcfa8',
  skinDeep: '#e0a67c',
  uniform: '#2f6f8f',
  uniformDeep: '#1f4c66',
  uniformTrim: '#ffd23f',
  boot: '#1c1233',
  bootDeep: '#120a24',
  sole: '#0d0719',
  // Round 5 (#147): the guard's vest and pads, darker than the uniform.
  vest: '#244b63',
  vestDeep: '#1a3648',
  lens: '#4aa6c8',
  helmet: '#3d8fb0',
  helmetDeep: '#2c6a86',
  commander: '#c2344f',
  commanderDeep: '#7d1c33',
  commanderTrim: '#ffe98f',
  // Machines of the base: steel violet with warning red eyes.
  steel: '#b3a8e6',
  steelDeep: '#8377c4',
  steelDark: '#51458f',
  hazard: '#ffd23f',
  // Glows
  glowCyan: '#7ff4ff',
  glowPink: '#ff5fb0',
  glowRed: '#ff4060',
  glowYellow: '#fff27a',
  glowGreen: '#8dff7a',
  glowWhite: '#ffffff',
  // Marks
  white: '#f6f1ff',
  black: '#150c2b'
} as const
