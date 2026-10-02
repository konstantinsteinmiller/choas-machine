import { reactive } from 'vue'
import { app, type GameMode } from './engine/app'
import { setPhase } from './state/hud'
import { isFreshProfile } from './state/profile'
import { bankDefeat, bankMission, unlockedLevel } from './state/progress'
import type { MissionResult, Payout } from './sim/rewards'

/**
 * ─── Game flow ───────────────────────────────────────────────────────────────
 *
 * The director between the two modes: a MISSION (a fortress infiltration) and
 * the BASE (the Mobile Command Base: Armory, Chassis Bay, Forge), and the
 * screens that sit between them (the rewards tally, the defeat screen).
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
  loadProgress: 0,
  /** The boot loader is still on screen: nothing scripted starts under it. */
  curtain: true,
  /** The threat level of the mission in play, or picked for the next one. */
  level: 1,
  /** What the last extraction paid (the rewards screen reads it). */
  result: null as Payout | null,
  /** The run the rewards or defeat screen is about. */
  run: null as MissionResult | null,
  /** Tech Scrap kept from the last defeat. */
  kept: 0
})

type Progress = (p01: number) => void
type ModeFactory = (onProgress: Progress) => Promise<GameMode>
interface Factories {
  mission: ModeFactory
  base: ModeFactory
  /** Warm a freshly built mode (shader compile) before it is shown. */
  prepare?: (mode: GameMode) => Promise<void>
}
let factories: Factories | null = null

export const registerModeFactories = (f: Factories): void => {
  factories = f
}

/**
 * The first scene of a session, built behind the loader (`boot.ts`). A new
 * player lands straight in the fortress: there is no menu in front of the
 * game. A returning one opens in the Command Base (plan G17).
 */
export const createBootMode = async (onProgress: Progress = () => {}): Promise<GameMode> => {
  if (!factories) throw new Error('[flow] no mode factories registered')
  const fresh = isFreshProfile()
  flow.level = fresh ? 1 : unlockedLevel()
  const mode = await (fresh ? factories.mission : factories.base)(onProgress)
  onProgress(1)
  flow.screen = fresh ? 'mission' : 'base'
  setPhase(fresh ? 'intro' : 'base')
  return mode
}

const swap = async (screen: Screen, factory: ModeFactory, phase: 'intro' | 'base'): Promise<void> => {
  if (flow.loading || !factories) return
  flow.modal = ''
  flow.loading = true
  flow.loadProgress = 0
  // The scene being left stops here: it must not go on simulating (and
  // spending the frame) under the veil while the next one is built.
  app.setWanted(false)
  let mode: GameMode
  try {
    mode = await factory((p) => { flow.loadProgress = p * 0.9 })
    await factories.prepare?.(mode)
    flow.loadProgress = 1
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

/** Drop into the fortress, at `level` (default: the one picked). */
export const startMission = async (level: number = flow.level): Promise<void> => {
  if (!factories) return
  flow.level = Math.min(unlockedLevel(), Math.max(1, level))
  await swap('mission', factories.mission, 'intro')
}

/** Leave whatever is running for the Command Base. */
export const goBase = async (): Promise<void> => {
  if (factories) await swap('base', factories.base, 'base')
}

/** The mech is away: bank the run and show what it paid. */
export const finishMission = (run: MissionResult): void => {
  flow.run = { ...run }
  flow.result = bankMission(run, flow.level)
  flow.modal = 'rewards'
}

/** The mech is down: bank the share that survives it. The mission opens the
 *  defeat screen itself, a beat later. */
export const failMission = (run: MissionResult): void => {
  flow.run = { ...run }
  flow.kept = bankDefeat(run, flow.level)
}
