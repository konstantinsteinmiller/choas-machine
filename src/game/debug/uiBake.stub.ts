import type { WebGLRenderer } from 'three'
import type { UiBakeHost } from './uiBake'

/**
 * The UI bake, switched off (`VITE_APP_RENDER_UI_BAKE` is not `true`):
 * `vite.config.ts` aliases `@/game/debug/uiBake` here, so no bake code ships.
 * Mirrors the real module's exports.
 */
export const MIN_FRAMES = 0
export const MAX_FRAMES = 0
export const installUiBake = (_host: UiBakeHost): void => {}
export const drawUiBake = (_renderer: WebGLRenderer): void => {}
