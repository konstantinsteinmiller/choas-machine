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

type BaseFactory = (onProgress: (p01: number) => void) => Promise<GameMode>
let baseFactory: BaseFactory | null = null

export const registerModeFactories = (base: BaseFactory): void => {
  baseFactory = base
}

/**
 * The first scene of a session, built behind the loader (`boot.ts`). Until
 * the campaign exists this is always the base.
 */
export const createBootMode = async (onProgress: (p01: number) => void = () => {}): Promise<GameMode> => {
  if (!baseFactory) throw new Error('[flow] no mode factory registered')
  const mode = await baseFactory(onProgress)
  onProgress(1)
  flow.screen = 'base'
  setPhase('base')
  return mode
}

/** Leave whatever is running for the Command Base. */
export const goBase = async (): Promise<void> => {
  if (!baseFactory) return
  flow.modal = ''
  flow.loading = true
  flow.loadProgress = 0
  const mode = await baseFactory((p) => { flow.loadProgress = p })
  flow.loading = false
  flow.screen = 'base'
  setPhase('base')
  app.setMode(mode)
  app.setWanted(true)
}
