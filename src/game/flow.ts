import { reactive } from 'vue'
import { app, type GameMode } from './engine/app'
import { setPhase } from './state/hud'

/**
 * ─── Game flow ───────────────────────────────────────────────────────────────
 *
 * The director between the two modes: a MISSION (a fortress infiltration) and
 * the BASE (the Mobile Command Base: holomap, Armory, Chassis Bay, Forge).
 *
 * Modes are created lazily through the registered factories so this module
 * does not import the heavy scene code itself.
 */

export type Screen = 'boot' | 'mission' | 'base'
export type Modal = '' | 'pause' | 'controls' | 'rewards' | 'defeat'

export const flow = reactive({
  screen: 'boot' as Screen,
  modal: '' as Modal,
  /** A scene is being built behind the loading overlay. */
  loading: false,
  /** 0..1 progress of that build. */
  loadProgress: 0
})

type Progress = (p01: number) => void
type ModeFactory = (onProgress: Progress) => Promise<GameMode>
interface Factories { mission: ModeFactory; base: ModeFactory }
let factories: Factories | null = null

export const registerModeFactories = (f: Factories): void => {
  factories = f
}

/**
 * The first scene of a session, built behind the loader (`boot.ts`): the
 * mission. A new player lands straight in the fortress; there is no menu in
 * front of the game.
 */
export const createBootMode = async (onProgress: Progress = () => {}): Promise<GameMode> => {
  if (!factories) throw new Error('[flow] no mode factories registered')
  const mode = await factories.mission(onProgress)
  onProgress(1)
  flow.screen = 'mission'
  setPhase('play')
  return mode
}

const swap = async (screen: Screen, factory: ModeFactory, phase: 'play' | 'base'): Promise<void> => {
  if (flow.loading) return
  flow.modal = ''
  flow.loading = true
  flow.loadProgress = 0
  // The scene being left stops here: it must not go on simulating (and
  // spending the frame) under the veil while the next one is built.
  app.setWanted(false)
  let mode: GameMode
  try {
    mode = await factory((p) => { flow.loadProgress = p })
  } catch (err) {
    flow.loading = false
    app.setWanted(true)
    throw err
  }
  flow.modal = ''
  flow.loading = false
  flow.screen = screen
  setPhase(phase)
  app.setMode(mode)
  app.setWanted(true)
}

/** Drop into the fortress. */
export const startMission = async (): Promise<void> => {
  if (factories) await swap('mission', factories.mission, 'play')
}

/** Leave whatever is running for the Command Base. */
export const goBase = async (): Promise<void> => {
  if (factories) await swap('base', factories.base, 'base')
}
