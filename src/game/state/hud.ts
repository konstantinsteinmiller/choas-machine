import { reactive } from 'vue'
import { emit } from '../bus'
import type { WeaponId } from '../data/ids'
import type { HintId, HintView } from '../sim/coach'

/**
 * ─── The HUD mirror ──────────────────────────────────────────────────────────
 *
 * The one reactive object the simulation writes for the DOM to read. The sim
 * itself keeps plain fields and never touches Vue; it copies what the HUD
 * needs in here, and only when a value CHANGES, so a 60 Hz step never drives a
 * 60 Hz re-render.
 *
 * Anything that moves every frame (the joystick knob, the hold ring) is not
 * in here at all: those are written straight to the DOM by a HUD ticker.
 *
 * `phase` is also the contract with the platform layer: `isGameplayLive` and
 * the Playgama ready signal (`whenInteractive`) key off it.
 */

/**
 * Where the current screen is in its life:
 * - `boot`  nothing built yet (the loader is up)
 * - `intro` the drop-in cinematic; no input
 * - `play`  the player has control of the mech
 * - `outro` the extraction cinematic; no input
 * - `dead`  the mech is down, the defeat screen follows
 * - `done`  the mission is over, the rewards screen is up
 * - `base`  the Mobile Command Base (menus)
 * - `cinema` a story scene plays over whatever was up (#100); the gameplay bracket is closed
 */
export type Phase = 'boot' | 'intro' | 'play' | 'outro' | 'dead' | 'done' | 'base' | 'cinema'

/** What the training ground calls out (`training.shout.*`, `training.reset.*` in the locales). */
export type TrainingShout = '' | 'shout.backstab' | 'reset.cover' | 'reset.seen' | 'reset.ammo' | 'reset.box' | 'reset.decoy' | 'reset.decoyTouch' | 'reset.decoyAny'
  // A shut lesson door, walked into (#171): what it wants.
  | 'door.cover' | 'door.weapons' | 'door.rocket' | 'door.supply' | 'door.blade' | 'door.burn' | 'door.decoy' | 'door.rope' | 'door.salvage'

export const hud = reactive({
  phase: 'boot' as Phase,
  /**
   * A story scene is holding its closing still (#179, #184): the fortress it
   * shows, so the HUD frames it as a look ahead (its name, locked); '' when not.
   */
  cineStill: '' as '' | 'bastion' | 'foundry' | 'harbour' | 'spire',
  /** Which controls to draw: the touch HUD or the desktop one. */
  device: 'mouse' as 'touch' | 'mouse',
  crouched: false,
  sprinting: false,
  /** The weapon is up. */
  aiming: false,
  /** The camera is in the mech's head, looking through the scope. */
  scoped: false,
  weapon: 'sniper' as WeaponId,
  /** How the mech is getting about: decides which controls make sense. */
  mode: 'ground' as 'ground' | 'ladder' | 'cable' | 'air' | 'mantle',
  /** Lit segments of the base's alert meter, 0 … 5. */
  alert: 0,
  /** Full alert: the stealth phase is over. */
  chaos: false,
  /** Somebody has eyes on the mech right now and the meter is climbing. */
  watched: false,
  /** Rounds in hand: the magazine, or rockets left; −1 for the minigun. */
  ammo: 5,
  /** What a full load of the weapon in hand is: the pips the strip draws. */
  ammoMax: 5,
  /** Carried besides what is loaded (the rifle's reserve, the belt); −1 for none (#76). */
  reserve: 15,
  /** The weapon in hand has nothing left to fire. */
  dry: false,
  /** The weapon in hand is running low, short of dry (#145). */
  ammoLow: false,
  reloading: false,
  overheated: false,
  /** A decoy is ready (1) or not (0): they never run out, they cool down (#114). */
  decoys: 0,
  /** Whole seconds until the next decoy is ready; 0 when it is. */
  decoyCool: 0,
  /** A wall the hook can take is in front of the mech, or under its look (#102). */
  grapple: false,
  /** The rope gun has somewhere to shoot (#94), and ropes left. */
  rope: false,
  ropes: 0,
  /** The flamethrower (#99): something at the mech's feet to burn, fuel left, and 0 … 1 through a burn. */
  burn: false,
  fuel: 0,
  burning: 0,
  /** The hook is out: 'up' while it can still be recalled, 'over' once it cannot. */
  grappling: '' as '' | 'up' | 'over',
  /** How many heard the hook bite. */
  grappleHeard: 0,
  /** The blade's offer right now, or '' when there is none. */
  strike: '' as '' | 'backstab' | 'drop' | 'strike' | 'air',
  /** Under a third of its armor: the HUD says so. */
  armorLow: false,
  /** A kill-cam is playing: the HUD stands down. */
  cine: false,
  /** What the mission wants next: the target dead, then the way out. */
  objective: 'salvage' as 'salvage' | 'extract' | 'done',
  /** Piles stripped, and how many the raid needs. */
  salvageGot: 0,
  salvageNeed: 0,
  /** Under the hide box. */
  boxed: false,
  /** Something within reach to sabotage ('' none): a beacon, the Warden's generator, the Foreman's servo; and 0 … 1 of doing it. */
  sabotage: '' as '' | 'beacon' | 'alarm' | 'generator' | 'servo',
  sabotaging: 0,
  /** The base's alarm: 0 quiet, 1 a guard runs for a beacon, 2 lighting it (`alarmLit` 0 … 1), 3 lit. */
  alarm: 0,
  alarmLit: 0,
  /** The boss whose bar is up ('' none), its health 0 … 1, and whether it carries a shield. */
  bossKind: '' as '' | 'warden' | 'foreman' | 'goliath' | 'airship',
  bossHp: 1,
  bossShield: false,
  /** A pile within reach; and 0 … 1 of stripping one. */
  loot: false,
  looting: 0,
  /** Underfoot: 0 in the open, 1 in shadow, 2 crouched in a thicket (hidden). */
  concealed: 0 as 0 | 1 | 2,
  /** The scope's zoom (1 = the loadout's own). */
  zoom: 1,
  /**
   * The training ground: which room, lessons done of how many, whether the
   * demo can be asked for again, the scrap line; the room's targets down of
   * how many (#153, 0 of 0: no such goal); and the line called out over the
   * middle of the screen (#155, #156), replayed on every `shoutSeq`.
   */
  training: {
    on: false, room: -1, done: 0, total: 0, replay: false, scrapWhy: false,
    goalDown: 0, goalTotal: 0, shout: '' as TrainingShout, shoutSeq: 0,
    /** The control a line is about (#171: a shut door's), drawn beside it as its key or button. */
    shoutHint: '' as HintId | '',
    /** The control the player is nudged to use until they do (#186): an arrow on its button, or its key big. */
    nudge: '' as HintId | ''
  },
  /** 0 … 1 of holding the scope on a unit to tag it. */
  tagging: 0,
  /** A body to grab ('grab'), or one in tow ('drop'). */
  drag: '' as '' | 'grab' | 'drop',
  /** What the in-world prompt offers right now (#83), '' for nothing. */
  prompt: '' as PromptKind,
  /** A second key on offer at the same spot (the rope beside the hook). */
  prompt2: '' as PromptKind,
  /** The control lessons on screen (replaced only when they change). */
  hints: [] as HintView[]
})

/**
 * The objective's place on screen, for the marker: `x`, `y` in 0 … 1 of the
 * view (left to right, top to bottom), `behind` when it is at the camera's
 * back, `dist` in metres from the mech.
 */
export const waypoint = { on: false, x: 0.5, y: 0.5, behind: false, dist: 0 }

/** What a key does where the mech stands, as the in-world prompt names it (#83). */
export type PromptKind = '' | 'salvage' | 'strike' | 'assassinate' | 'sabotage' | 'silence' | 'cutPower' | 'jam' | 'grab' | 'drop' | 'hook' | 'rope' | 'burn'

/** Where the in-world prompt sits: 0 … 1 of the view, and on screen at all. */
export const prompt = { on: false, x: 0.5, y: 0.5, far: false }

/**
 * The training hologram's button press (#114): which control, where over its
 * head on screen (0 … 1), and a count that changes with every press (the pop
 * restarts on it). Written each frame by the training ground.
 */
/** CM-07's line (#126): which, said how, and where its bubble is (0 … 1 of the view); written per frame. */
export const quipPop = { on: false, x: 0.5, y: 0.4, seq: 0, id: '', whisper: false }

export const demoPop = { on: false, x: 0.5, y: 0.5, hint: '' as string, seq: 0 }

// ─── Machines uplinking to the base (#73): per-frame, outside Vue ────────────

export const MAX_UPLINKS = 3
/** The rings on screen: where (0 … 1 of the view), how full (0 … 1), and on screen at all. */
export const uplinks = {
  n: 0,
  x: new Float32Array(MAX_UPLINKS),
  y: new Float32Array(MAX_UPLINKS),
  frac: new Float32Array(MAX_UPLINKS),
  on: new Uint8Array(MAX_UPLINKS)
}

// ─── Health bars over heads (#74): per-frame, outside Vue ────────────────────

export const MAX_BARS = 8
/**
 * The bars on screen: where (0 … 1 of the view, the bar's middle), how much is
 * left (0 … 1), how big (1 at 10 m), and whether it is a machine.
 */
export const bars = {
  n: 0,
  x: new Float32Array(MAX_BARS),
  y: new Float32Array(MAX_BARS),
  frac: new Float32Array(MAX_BARS),
  size: new Float32Array(MAX_BARS),
  machine: new Uint8Array(MAX_BARS)
}

/** The mech's armor and the last hit it took: per-frame, so outside Vue. */
export const vital = {
  /** 0 … 1 of its armor. */
  armor: 1,
  /** Bearing of the last hit from the camera's heading (positive to the LEFT),
   *  and seconds since it. */
  hitAngle: 0,
  hitAge: 9
}

/** The weapon's gauges: they move every frame, so the HUD reads them from a
 *  ticker, not through Vue. */
export const gun = { heat: 0, spool: 0, reload: 0 }

/** Move to another phase and tell the bus. A no-op if nothing changes. */
export const setPhase = (phase: Phase): void => {
  const prev = hud.phase
  if (prev === phase) return
  hud.phase = phase
  emit('phase', { phase, prev })
}

/** Write a field of the mirror only when it changes. */
export const mirror = <K extends keyof typeof hud>(key: K, value: (typeof hud)[K]): void => {
  if (hud[key] !== value) hud[key] = value
}

// ─── Who is noticing the mech: per-frame, so outside Vue ─────────────────────

export const MAX_THREATS = 4
/**
 * The few defenders closest to noticing the mech, for the arcs round the
 * aim point. `angle` is the bearing from the camera's heading (radians,
 * positive to the LEFT); `level` the detection meter; `hot` a sure sighting.
 */
export const threats = {
  n: 0,
  angle: new Float32Array(MAX_THREATS),
  /** 0 … 1 within its band. */
  level: new Float32Array(MAX_THREATS),
  /** 0 white (noticing), 1 yellow (looking), 2 red (sure). */
  stage: new Uint8Array(MAX_THREATS)
}

// ─── What defenders shout when they are sure (#62): per-frame, outside Vue ──

export const MAX_CALLOUTS = 4
/**
 * The bubbles on screen: where (0 … 1 of the view, the bubble's foot), whether
 * the head is in front of the camera, and which line (0 a person, 1 a machine).
 */
export const callouts = {
  n: 0,
  x: new Float32Array(MAX_CALLOUTS),
  y: new Float32Array(MAX_CALLOUTS),
  on: new Uint8Array(MAX_CALLOUTS),
  line: new Uint8Array(MAX_CALLOUTS)
}

// ─── HUD tickers: per-frame DOM writes, outside Vue ──────────────────────────

const tickers = new Set<(dt: number) => void>()

/** Run `fn` every rendered frame. Returns the function that stops it. */
export const addHudTicker = (fn: (dt: number) => void): (() => void) => {
  tickers.add(fn)
  return () => { tickers.delete(fn) }
}

/** Called by the live mode once per rendered frame. */
export const runHudTickers = (dt: number): void => {
  for (const fn of tickers) fn(dt)
}
