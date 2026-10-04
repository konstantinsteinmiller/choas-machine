import { reactive } from 'vue'
import { app, type GameMode } from './engine/app'
import { hud, setPhase } from './state/hud'
import { isFreshProfile, markSeen, profile, saveProfile } from './state/profile'
import { bankDefeat, bankMission, campaignScore, fortressOpen, highestCleared, levelKey, unlockedLevel } from './state/progress'
import { cinemaAfterClear, seenKey, type CinemaId } from './story/cinemaIds'
import { currentMusicTrack, setMusicTrack } from '@/use/useSound'
import type { TrackId } from './audio/songs'
import { reportRun } from '@/use/useLeaderboard'
import { showMidgameAd } from '@/use/useAds'
import { canShowInterstitial, markInterstitialShown } from '@/use/useAdGate'
import { isAdShowing } from '@/use/useGamePause'
import type { MissionResult, Payout } from './sim/rewards'
import type { FortressId } from './data/fortresses/registry'

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
export type Modal = '' | 'pause' | 'rewards' | 'defeat'

export const flow = reactive({
  screen: 'boot' as Screen,
  modal: '' as Modal,
  /** A scene is being built behind the loading overlay. */
  loading: false,
  /** 0..1 progress of that build. */
  loadProgress: 0,
  /** The boot loader is still on screen: nothing scripted starts under it. */
  curtain: true,
  /** The fortress of the mission in play, or picked for the next one (`data/fortresses/registry.ts`). */
  fortress: 'bastion' as FortressId,
  /** The threat level of the mission in play, or picked for the next one. */
  level: 1,
  /** What the last extraction paid (the rewards screen reads it). */
  result: null as Payout | null,
  /** The run the rewards or defeat screen is about. */
  run: null as MissionResult | null,
  /** Tech Scrap kept from the last defeat. */
  kept: 0,
  /** Where a downed raid can pick up again: beside the first pile it
   *  stripped, with the piles it had stripped still stripped. */
  checkpoint: null as Checkpoint | null,
  /** The next mission starts straight on the perch (a retry): no drop-in. */
  quick: false,
  /** The next mission resumes from `checkpoint`. */
  resume: false,
  /** The mission being built (or played) is the training ground. */
  training: false,
  /** The story scene playing over everything (#100), or null. */
  cinema: null as CinemaId | null
})

export interface Checkpoint {
  level: number
  x: number
  y: number
  z: number
  yaw: number
  /** The piles stripped by the time the mech went down. */
  piles: number[]
}

type Progress = (p01: number) => void
type ModeFactory = (onProgress: Progress) => Promise<GameMode>
/** A story scene, as the flow sees it. */
export type CinemaMode = GameMode & { done: Promise<void>; skip(): void; music: TrackId }

interface Factories {
  mission: ModeFactory
  base: ModeFactory
  /** A story scene (#100), built quickly, pushed over whatever is up. */
  cinema?: (id: CinemaId) => Promise<CinemaMode>
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
  flow.level = fresh ? 1 : unlockedLevel(flow.fortress)
  // A new player's first scene is the training ground (#57, #58).
  flow.training = fresh && !profile.seen.includes('training')
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
  // Milestones for `scripts/boot-timeline.mjs --deploy` (and DevTools), like the boot's.
  performance.mark(`swap:${screen}:start`)
  let mode: GameMode
  try {
    mode = await factory((p) => { flow.loadProgress = p * 0.9 })
    performance.mark(`swap:${screen}:built`)
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
  performance.mark(`swap:${screen}:ready`)
}

/** Drop into the fortress, at `level` (default: the one picked). */
export const startMission = async (level: number = flow.level): Promise<void> => {
  if (!factories) return
  flow.training = false
  if (!fortressOpen(flow.fortress)) flow.fortress = 'bastion'
  flow.level = Math.min(unlockedLevel(flow.fortress), Math.max(1, level))
  await swap('mission', factories.mission, 'intro')
}

/** The training ground: the first thing a new player plays, and again from the Base. */
export const startTraining = async (): Promise<void> => {
  if (!factories) return
  flow.training = true
  flow.level = 1
  await swap('mission', factories.mission, 'intro')
}

/** The scene playing, while it plays. */
let playing: CinemaMode | null = null

/**
 * Play a story scene over whatever is up (the mission, the base): pushed as a
 * mode, the phase `cinema` (the HUD steps aside, the gameplay bracket closes),
 * its own music; then everything as it was. Marks it seen.
 */
export const playCinema = async (id: CinemaId): Promise<void> => {
  if (!factories?.cinema || playing) return
  const mode = await factories.cinema(id)
  const phase = hud.phase
  const track = currentMusicTrack()
  playing = mode
  flow.cinema = id
  app.pushMode(mode)
  setPhase('cinema')
  setMusicTrack(mode.music)
  await mode.done
  playing = null
  flow.cinema = null
  app.popMode()
  setPhase(phase)
  setMusicTrack(track)
  markSeen(seenKey(id))
}

/** The skip button, or Space held. */
export const skipCinema = (): void => { playing?.skip() }

/** The training ground is done (or skipped): the intro, the first time (#100), then straight on into the first raid. */
export const finishTraining = async (): Promise<void> => {
  if (!profile.seen.includes('training')) {
    profile.seen.push('training')
    saveProfile()
  }
  flow.training = false
  if (!profile.seen.includes(seenKey('intro'))) await playCinema('intro')
  await startMission(1)
}

/** Leave whatever is running for the Command Base. */
export const goBase = async (): Promise<void> => {
  if (factories) await swap('base', factories.base, 'base')
}

/** The mech is away: bank the run and show what it paid. */
export const finishMission = (run: MissionResult): void => {
  flow.run = { ...run }
  const first = (profile.fortresses[levelKey(flow.level, flow.fortress)]?.clears ?? 0) === 0
  flow.result = bankMission(run, flow.level, flow.fortress)
  // A first clear may earn a story scene (#103, #100), before the rewards.
  const scene = cinemaAfterClear(flow.fortress, flow.level, first)
  if (scene && !profile.seen.includes(seenKey(scene))) void playCinema(scene).then(() => { flow.modal = 'rewards' })
  else flow.modal = 'rewards'
  // The board is a decoration on a game that works without it: the rewards
  // screen is already up before the request leaves, and nothing waits on it.
  void reportRun(campaignScore(), highestCleared(), { force: true })
}

/** The mech is down: bank the share that survives it. The mission opens the
 *  defeat screen itself, a beat later. */
export const failMission = (run: MissionResult, checkpoint: Checkpoint | null = null): void => {
  flow.run = { ...run }
  flow.checkpoint = checkpoint
  flow.kept = bankDefeat(run, flow.level)
}

// ─── Leaving a result screen: the one ad break ───────────────────────────────

/** Longest a result screen waits on an ad that some other placement started. */
const AD_GATE_WAIT_MS = 8000

const waitForAdGate = async (): Promise<void> => {
  const t0 = Date.now()
  while (isAdShowing.value && Date.now() - t0 < AD_GATE_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** True from the button until the next scene is up, so a double tap asks for one ad. */
let leaving = false

/**
 * The way off the rewards screen and the defeat screen: close it, play the
 * interstitial if one is due, and only then go on (to the base, or back onto
 * the perch).
 *
 * The screen closes FIRST, so an ad never opens on top of a result screen
 * (portal QA). The mission stays frozen behind the ad: `showMidgameAd` raises
 * `isAdShowing` before its first await, which suspends the loop and the
 * audio. Every mission end offers this one break, won or lost; the shared
 * pacing clock (`canShowInterstitial`) decides whether an ad actually runs.
 * There are no rewarded placements in this game.
 */
export const leaveResults = async (next: 'base' | 'retry' | 'resume'): Promise<void> => {
  if (leaving) return
  leaving = true
  flow.modal = ''
  try {
    if (canShowInterstitial()) {
      markInterstitialShown()
      await showMidgameAd()
    }
    await waitForAdGate()
  } finally {
    leaving = false
    if (next === 'base') {
      flow.checkpoint = null
      void goBase()
    } else {
      // Back onto the perch, without the drop-in; from the pile, if asked.
      flow.quick = true
      flow.resume = next === 'resume' && !!flow.checkpoint
      void startMission()
    }
  }
}
