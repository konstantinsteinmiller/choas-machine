import { deviceClass, isAppleTouch } from '@/use/deviceProfile'
import { IOS_LEGACY } from '@/use/perfVariants'

/**
 * ─── Scenery quality ─────────────────────────────────────────────────────────
 *
 * How much BACKDROP a device gets: the city round every mission
 * (`world/cityscape.ts`) and the intro's sets (`story/intro.ts`). Nothing the
 * player plays with changes with it — only how many far buildings, landmarks,
 * vehicles, raindrops and hologram towers there are to look at.
 *
 * `low` for a device that has already told us it is weak (`deviceClass`,
 * which reads the GPU's name, the RAM and the cores), and for a touch-first
 * phone with 4 GB or less, or 4 cores or fewer: budget phones, where fill,
 * vertices and the main thread are all short. Everything else gets `full`.
 *
 * Since round 5 nothing lowers the canvas resolution below the display's own
 * pixel ratio (`renderer.ts`); this scenery knob is what a weak device gives up.
 *
 * `?scenery=low|full` pins it (QA, screenshots, A/B arms).
 */

export type SceneQuality = 'low' | 'full'

let cached: SceneQuality | null = null

export const sceneQuality = (): SceneQuality => {
  if (cached) return cached
  let pinned: string | null = null
  try { pinned = new URLSearchParams(window.location.search).get('scenery') } catch { /* no window */ }
  if (pinned === 'low' || pinned === 'full') return (cached = pinned)
  let weak = false
  try { weak = deviceClass() === 'weak' } catch { /* no WebGL to ask */ }
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number }
  let touch = false
  try { touch = window.matchMedia('(pointer: coarse)').matches } catch { /* no matchMedia */ }
  const smallRam = typeof nav?.deviceMemory === 'number' && nav.deviceMemory <= 4
  const fewCores = typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4
  const ios = !IOS_LEGACY && isAppleTouch()
  cached = weak || ios || (touch && (smallRam || fewCores)) ? 'low' : 'full'
  return cached
}

/** Test seam: forget the answer. */
export const __resetSceneQuality = (): void => { cached = null }
