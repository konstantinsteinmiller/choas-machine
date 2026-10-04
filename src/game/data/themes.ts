import { SCRAPYARD, type Theme } from '../world/fortressMesh'
import { DUSK, type SkyColors } from '../world/sky'

/**
 * ─── A fortress's look (round 4, #79) ────────────────────────────────────────
 *
 * Each fortress gets its own palette for the blocks and the ground, its own
 * sky and haze: the cheapest variety there is. The Bastion keeps the game's
 * violet dusk.
 */

export type ThemeId = 'dusk'

export interface LevelTheme {
  /** Ground, walls, cover, trims (`world/fortressMesh.ts`). */
  mesh: Theme
  /** Sky dome, lights, cloud sea and haze (`world/sky.ts`). */
  sky: SkyColors
}

export const THEMES: Readonly<Record<ThemeId, LevelTheme>> = {
  dusk: { mesh: SCRAPYARD, sky: DUSK }
}

/** A fortress's look; the training ground and anything unthemed wear the dusk. */
export const themeOf = (id: ThemeId | undefined): LevelTheme => THEMES[id ?? 'dusk']
