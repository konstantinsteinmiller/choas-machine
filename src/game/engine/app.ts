import { PerspectiveCamera, Scene } from 'three'
import { getRenderer, resizeRenderer, fovForAspect } from './renderer'
import { frameStart, frameEnd, phaseStart, phaseEnd } from '@/use/usePerfProbe'
import { advance, STEP } from './clock'
import { emit } from '../bus'

/**
 * ─── The game loop ───────────────────────────────────────────────────────────
 *
 * ONE requestAnimationFrame for the whole game. Logic runs on a fixed 60 Hz
 * step (deterministic enough for replays and snapshot resumes, and immune to
 * 120/144 Hz displays speeding the game up); rendering runs every frame and
 * interpolates between the last two logic states. Slow motion is a time scale
 * on that clock (`clock.ts`), so it changes how often a step runs and never
 * how long one is.
 *
 * The loop only RUNS while gameplay wants it AND the platform/ad/modal gate
 * allows it (`setSuspended`). A suspended loop cancels its RAF outright — a
 * portal's pause event must stop the loop, not merely skip work inside it.
 */

export interface GameMode {
  scene: Scene
  camera: PerspectiveCamera
  /** One fixed logic step. `first` is true for the first step of a frame
   *  (one-shot input edges are consumed there). */
  update(dt: number, first: boolean): void
  /** Draw. `alpha` ∈ [0,1) interpolates between logic steps; `dt` is the real
   *  frame time (camera look, UI-side animation). */
  render(alpha: number, dt: number): void
  resize?(w: number, h: number): void
  /** Called once when the mode becomes the live one (`setMode`). Modes can be
   *  built in the background, so start-of-mode effects belong here. */
  enter?(): void
  dispose(): void
}

class GameApp {
  mode: GameMode | null = null
  private raf = 0
  private last = 0
  private acc = 0
  private wants = false
  private suspended = false
  private container: HTMLElement | null = null
  private scale = 1
  private ro: ResizeObserver | null = null
  /** Rolling frame stats for the perf meter. */
  frameMs = 16.7
  width = 1
  height = 1

  attach(container: HTMLElement): void {
    const r = getRenderer()
    this.container = container
    container.appendChild(r.domElement)
    this.ro?.disconnect()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
  }

  detach(): void {
    this.ro?.disconnect()
    this.ro = null
    const r = getRenderer()
    if (r.domElement.parentElement) r.domElement.parentElement.removeChild(r.domElement)
    this.container = null
  }

  resize(): void {
    const el = this.container
    const w = el ? el.clientWidth : window.innerWidth
    const h = el ? el.clientHeight : window.innerHeight
    // A zero-size viewport (Playables resize-to-zero, a collapsed iframe)
    // must not produce a NaN projection.
    this.width = Math.max(1, w)
    this.height = Math.max(1, h)
    if (this.mode) {
      resizeRenderer(this.mode.camera, this.width, this.height)
      this.mode.resize?.(this.width, this.height)
    } else {
      getRenderer().setSize(this.width, this.height, false)
    }
  }

  setMode(mode: GameMode | null): void {
    if (this.mode && this.mode !== mode) this.mode.dispose()
    this.mode = mode
    if (mode) {
      mode.camera.aspect = this.width / this.height
      mode.camera.fov = fovForAspect(mode.camera.aspect)
      mode.camera.updateProjectionMatrix()
      this.resize()
      mode.enter?.()
    }
    this.acc = 0
    // A mode never inherits the last one's slow motion.
    this.setTimeScale(1)
  }

  /** A mode set aside by `pushMode`, live again on `popMode`. */
  private under: GameMode | null = null

  /**
   * Show another mode for a while (a cinematic, #100) WITHOUT disposing the
   * live one: it waits under, untouched, until `popMode` brings it back.
   */
  pushMode(mode: GameMode): void {
    if (this.under) this.popMode()
    this.under = this.mode
    this.mode = null
    this.setMode(mode)
  }

  /** Dispose the pushed mode and bring back the one under it. */
  popMode(): void {
    const back = this.under
    this.under = null
    this.setMode(back)
  }

  /** The simulation's speed: 1 is real time, 0.1 a kill-cam, 0 a freeze. */
  get timeScale(): number {
    return this.scale
  }

  /** Change the simulation's speed. The render keeps its real frame time. */
  setTimeScale(scale: number): void {
    const s = Number.isFinite(scale) ? Math.max(0, scale) : 1
    if (s === this.scale) return
    this.scale = s
    emit('timeScale', { scale: s })
  }

  /** Gameplay wants the loop (a mode is active and not ended). */
  setWanted(on: boolean): void {
    this.wants = on
    this.sync()
  }

  /** Platform / ad / modal gate. */
  setSuspended(on: boolean): void {
    this.suspended = on
    this.sync()
  }

  get running(): boolean {
    return this.raf !== 0
  }

  private sync(): void {
    const run = this.wants && !this.suspended
    if (run && this.raf === 0) {
      this.last = performance.now()
      this.acc = 0
      this.raf = requestAnimationFrame(this.frame)
    } else if (!run && this.raf !== 0) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
      // Draw one last frame so a paused screen is not stale mid-transition.
      this.mode?.render(0, 0)
    }
  }

  /** Render once without advancing (used while suspended / for thumbnails). */
  renderOnce(): void {
    this.mode?.render(0, 0)
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const dtMs = now - this.last
    this.last = now
    this.frameMs = this.frameMs * 0.9 + dtMs * 0.1
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000))
    const mode = this.mode
    if (!mode) return
    // Perf seam (`?perfprobe=1`, see PERF-LEDGER.md): a const-false no-op in
    // every player's session.
    frameStart(now)
    const tick = advance(this.acc, dt, this.scale)
    this.acc = tick.acc
    phaseStart('step')
    for (let n = 0; n < tick.steps; n++) mode.update(STEP, n === 0)
    phaseEnd('step')
    phaseStart('draw')
    mode.render(tick.alpha, dt)
    phaseEnd('draw')
    frameEnd()
  }
}

export const app = new GameApp()

export const newScene = (): Scene => new Scene()
