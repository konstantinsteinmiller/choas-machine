import { SCRAPYARD, type Theme } from '../world/fortressMesh'
import { DUSK, type SkyColors } from '../world/sky'

/**
 * ─── A fortress's look (round 4, #79) ────────────────────────────────────────
 *
 * Each fortress gets its own palette for the blocks and the ground, its own
 * sky and haze: the cheapest variety there is. The Bastion keeps the game's
 * violet dusk.
 */

export type ThemeId = 'dusk' | 'foundry'

export interface LevelTheme {
  /** Ground, walls, cover, trims (`world/fortressMesh.ts`). */
  mesh: Theme
  /** Sky dome, lights, cloud sea and haze (`world/sky.ts`). */
  sky: SkyColors
}

/** The Foundry (#93): soot-dark plate and rust under an ember sky, its trims furnace orange. */
const FOUNDRY_MESH: Theme = {
  ...SCRAPYARD,
  groundA: '#6e5f86',
  groundB: '#665779',
  rim: '#8a76a0',
  cliffTop: '#4f3d6e',
  cliffFoot: '#22163f',
  plate: '#a99bb8',
  blockTop: '#9d8fae',
  blockSide: '#6f6488',
  blockSideAlt: '#62587b',
  rust: '#c2643a',
  blockFoot: '#3a3058',
  cover: ['#d0764a', '#4fb2c4', '#c9a23a', '#8c5bb8'],
  stair: '#9a8db0',
  pad: '#ff9a3d',
  trimWall: '#ff8a3d',
  trimTower: '#ffd166',
  ladder: '#ffd166',
  cable: '#ffe0b8'
}
const EMBER: SkyColors = {
  zenith: '#3b2a6e',
  mid: '#8a4f8f',
  horizon: '#ff9a5c',
  below: '#2a1840',
  sun: '#ffe6c8',
  skyLight: '#ffd2b0',
  groundLight: '#6a3e7a',
  cloud: '#ffb48a',
  farIsland: '#7a5a8e',
  farIslandFoot: '#2e1d52'
}

export const THEMES: Readonly<Record<ThemeId, LevelTheme>> = {
  dusk: { mesh: SCRAPYARD, sky: DUSK },
  foundry: { mesh: FOUNDRY_MESH, sky: EMBER }
}

/** A fortress's look; the training ground and anything unthemed wear the dusk. */
export const themeOf = (id: ThemeId | undefined): LevelTheme => THEMES[id ?? 'dusk']
