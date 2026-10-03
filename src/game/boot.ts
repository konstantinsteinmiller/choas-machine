import { getRenderer } from './engine/renderer'
import { afterPaint, createSlicer, yieldToBrowser, type Slice } from './engine/slicer'
import type { Material, Mesh, Object3D } from 'three'
import { bakeTextures, loadTextureOverrides } from './world/textures'
import { FortressView, viewAngleFromUrl } from './scenes/fortressView'
import { Mission } from './sim/mission'
import { input } from './engine/inputState'
import { buildProvingGround } from './data/fortresses/proving'
import { buildTrainingGround } from './data/fortresses/training'
import { answersTo } from './sim/adapt'
import { buildBastion } from './data/fortresses/bastion'
import type { GameMode } from './engine/app'
import { registerModeFactories, createBootMode, flow } from './flow'
import { CommandBase } from './scenes/commandBase'
import { currentLoadout } from './state/progress'
import { initProfile, profile } from './state/profile'
import { installSynth, loadSfxOverrides } from './audio/synth'
import { installGameSounds } from './audio/gameSounds'
import { holdAudio, releaseAudio } from './audio/engine'

/**
 * ─── Boot priming ────────────────────────────────────────────────────────────
 *
 * Called by the LOADER (`useAssets.preloadAssets`) while the splash is up:
 * creates the renderer, bakes the shared canvas textures, builds the FIRST
 * scene and compiles its shaders. By the time the splash clears, the first
 * frame is ready to draw.
 *
 * Three rules, each one a measured failure before it was a rule:
 * - The loader PAINTS FIRST. Nothing heavy starts until the splash has been
 *   on screen for a frame, so the player gets feedback before the work.
 * - A heavy build is time-sliced, so the bar keeps moving.
 * - The scene NEVER builds its own copy. `GameScene` waits on `adoptBootMode`
 *   for the prepared mode; a second build in the scene would run without the
 *   shader precompile and freeze the loader through both.
 */

/**
 * Compile a scene's shader programs off the critical frame. `compileAsync`
 * waits for the GPU asynchronously, but first derives the parameters and
 * cache key of EVERY material and assembles every new program's source, all
 * synchronously — one ~500-800 ms task on a throttled CPU. So programs are
 * created one material at a time (sliced; the GPU still compiles them in
 * parallel), and readiness is polled directly rather than through a final
 * `compileAsync`, which would re-derive everything in one task again.
 */
const precompile = async (
  mode: GameMode, slice: Slice = createSlicer(12), onProgress: (f01: number) => void = () => {}
): Promise<void> => {
  try {
    const renderer = getRenderer()
    const seen = new Set<string>()
    const reps: Object3D[] = []
    mode.scene.traverse((o) => {
      const mat = (o as Mesh).material as Material | Material[] | undefined
      if (!mat) return
      const key = (Array.isArray(mat) ? mat : [mat]).map(m => m.uuid).join()
      if (seen.has(key)) return
      seen.add(key)
      reps.push(o)
    })
    const pending = new Set<Material>()
    // `compile` walks only what is visible: a prop hidden until its moment
    // (a lesson's card, the intro's showcase props, a set that streams in
    // later) would compile on its first draw, mid-play. Shown for the call,
    // with its hidden ancestors, then put back.
    const hidden: Object3D[] = []
    for (let i = 0; i < reps.length; i++) {
      hidden.length = 0
      for (let o: Object3D | null = reps[i]!; o; o = o.parent) if (!o.visible) { hidden.push(o); o.visible = true }
      try {
        for (const m of renderer.compile(reps[i]!, mode.camera, mode.scene)) pending.add(m)
      } finally {
        for (const o of hidden) o.visible = false
      }
      onProgress((i + 1) / reps.length * 0.8)
      await slice()
    }
    // KHR_parallel_shader_compile: poll completion without blocking.
    const started = performance.now()
    await new Promise<void>((resolve) => {
      const check = () => {
        for (const m of pending) {
          const prog = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram
          if (!prog || prog.isReady()) pending.delete(m)
        }
        // Capped: a driver that never reports completion must not hold the boot.
        if (pending.size === 0 || performance.now() - started > 8000) resolve()
        else setTimeout(check, 16)
      }
      check()
    })
  } catch (e) {
    console.warn('[boot] shader precompile failed (will compile on first draw)', e)
  }
}

// Audio sleeps until the first scene is on screen (PERF-LEDGER.md entry 4).
// Held here, when this module is evaluated: the scene imports it, so this runs
// before the scene mounts and asks for its music.
holdAudio()

registerModeFactories({
  mission: async (onProgress) => {
    const search = window.location.search
    // DEV ONLY: the model bench and the fortress turntable. The
    // `import.meta.env.DEV` guard folds both branches out of every build.
    if (import.meta.env.DEV && new URLSearchParams(search).get('bench') === 'models') {
      return new (await import('./scenes/modelBench')).ModelBench(search)
    }
    const view = import.meta.env.DEV ? viewAngleFromUrl(search) : undefined
    // DEV ONLY: `?fort=proving` plays the kit's test layout instead of the campaign's.
    const proving = import.meta.env.DEV && new URLSearchParams(search).get('fort') === 'proving'
    const level = import.meta.env.DEV ? Number(new URLSearchParams(search).get('level')) || flow.level : flow.level
    // DEV ONLY: `?fort=training` too. The training ground is the flow's call otherwise.
    const fortParam = import.meta.env.DEV ? new URLSearchParams(search).get('fort') : null
    const training = fortParam === 'training' || (flow.training && fortParam !== 'bastion')
    const fortress = training ? buildTrainingGround() : proving ? buildProvingGround() : buildBastion(level, profile.missions, answersTo(profile.habits))
    if (view) return FortressView.create(fortress, view, createSlicer(12), onProgress)
    return Mission.create(fortress, input, createSlicer(12), onProgress, level, currentLoadout())
  },
  base: (onProgress) => CommandBase.create(createSlicer(12), onProgress),
  prepare: (mode) => precompile(mode)
})

let prepared: GameMode | null = null
let primed: Promise<void> | null = null

export const primeGame = (onProgress: (p01: number) => void): Promise<void> => {
  if (primed) return primed
  primed = (async () => {
    // The loader is on screen before any of the work below starts.
    await afterPaint()
    // Boot milestones as User Timing marks: free, and they line up in the
    // DevTools Performance panel (and `scripts/boot-timeline.mjs`).
    performance.mark('boot:prime-start')
    initProfile()
    installSynth()
    installGameSounds()
    // Drop-in files (only those that exist; see game/assets/overrides.ts).
    // SFX decode in the background; the detail maps must land before the
    // atlas bakes, and cost nothing when there are none.
    loadSfxOverrides()
    onProgress(0.03)
    await yieldToBrowser()
    getRenderer()
    onProgress(0.07)
    await loadTextureOverrides()
    bakeTextures()
    onProgress(0.1)
    await yieldToBrowser()
    performance.mark('boot:build-start')
    const mode = await createBootMode((p) => onProgress(0.1 + p * 0.88))
    performance.mark('boot:built')
    await precompile(mode)
    onProgress(1)
    prepared = mode
    performance.mark('boot:primed')
  })()
  return primed
}

/** Hand the pre-built first mode to the scene (once). */
export const takePreparedMode = (): GameMode | null => {
  const m = prepared
  prepared = null
  return m
}

/** Longest the scene waits on priming before building its own scene. */
const ADOPT_CAP_MS = 20000

/**
 * The first scene for `GameScene`: the loader's prepared mode, once priming
 * has finished (starting it if nothing has). Capped, so a prime that hangs
 * ends in a direct build rather than a black screen forever.
 */
export const adoptBootMode = async (): Promise<GameMode> => {
  try {
    const p = primed ?? primeGame(() => {})
    await Promise.race([
      p.catch((e) => console.error('[boot] priming failed', e)),
      new Promise((resolve) => setTimeout(resolve, ADOPT_CAP_MS))
    ])
    const m = takePreparedMode()
    performance.mark(m ? 'boot:adopted' : 'boot:fallback-build')
    if (m) return m
    initProfile()
    return await createBootMode()
  } finally {
    // The scene shows on the next frame: audio may wake (and the drop-in
    // plays). Whatever happened above, a boot never leaves the game silent.
    queueMicrotask(releaseAudio)
  }
}
