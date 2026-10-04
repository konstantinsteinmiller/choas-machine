import { CELL, cellMid } from '../world/grid'
import { TRAINING_ROOMS, type LessonId } from '../data/fortresses/training'
import type { WeaponId } from '../data/ids'
import type { HintId } from './coach'
import { isAlive, type Garrison } from './garrison'
import { TAKEDOWN, TD_END } from './takedown'

/**
 * ─── The training ground's lessons (#57, #58) ────────────────────────────────
 *
 * Pure logic: which room the mech is in, whether its lesson is done, and
 * where the demo hologram is. Show, don't tell: in each room a hologram of
 * the mech does the lesson over and over (#87), while the matching control
 * glyph pulses, until the lesson is done; a button plays it from the start.
 * A lesson done opens the gate to the next room. The mission
 * (`trainingDirector.ts`) draws it.
 */

/** One moment of a demo, in the room's own cells (1, 1 its first cell inside). */
export interface DemoKey {
  t: number
  x?: number
  z?: number
  /** Feet above the room's floor. */
  y?: number
  /** A cell to face instead of the way it walks. */
  face?: readonly [number, number]
  crouch?: number
  aim?: number
  weapon?: WeaponId
  stab?: number
  boxed?: number
  loot?: number
  /** On a ladder, in the air, on a cable (0 … 1). */
  climb?: number
  air?: number
  cable?: number
  /** Props the lesson needs: the rope it shoots, the body it burns (shown 0 … 1), the flame. */
  rope?: number
  body?: number
  burn?: number
  /** A takedown starts here (#110): the full choreography, on the hologram guard. */
  takedown?: true
  /** A decoy is thrown here, at this cell (#114): it arcs out and stands there, a light the guard turns to. */
  decoy?: readonly [number, number]
  /** The control this moment shows: its glyph pulses. */
  hint?: HintId
}

/** The blade room's hologram guard, in the room's own cells (its back to the way in), and how far behind it the takedown starts. */
export const BLADE_VICTIM: readonly [number, number] = [7, 3.5]
/** The takedown starts as far behind as the real one (#114: the blade goes in). */
const TD_REACH_CELLS = TAKEDOWN.reach / CELL

/** Where to stand to take a guard at `v` facing toward `face` from behind (room cells). */
const behind = (v: readonly [number, number], face: readonly [number, number]): [number, number] => {
  const dx = face[0] - v[0]
  const dz = face[1] - v[1]
  const l = Math.hypot(dx, dz) || 1
  return [v[0] - (dx / l) * TD_REACH_CELLS, v[1] - (dz / l) * TD_REACH_CELLS]
}

/**
 * The decoy room's hologram guard (#115): it turns to the decoy, walks over,
 * and stands staring at it, puzzled; the mech comes round and takes it.
 */
const DECOY_AT: readonly [number, number] = [7, 3]
const DECOY_GUARD: readonly [number, number] = [7.6, 3.9]
const DECOY_BEHIND = behind(DECOY_GUARD, DECOY_AT)

/** A hologram guard a lesson's takedown is played on: where it stands (room cells), facing what; missing values carry over. */
export interface VictimKey { t: number; x?: number; z?: number; face?: readonly [number, number] }
export const VICTIMS: Readonly<Partial<Record<LessonId, readonly VictimKey[]>>> = {
  blade: [{ t: 0, x: 7, z: 3.5, face: [9, 3.5] }],
  decoy: [
    { t: 0, x: 9, z: 7, face: [1, 7] }, { t: 1.6, x: 9, z: 7, face: DECOY_AT },
    { t: 4.2, x: DECOY_GUARD[0], z: DECOY_GUARD[1], face: DECOY_AT }
  ]
}

/** The demo of each lesson. Missing values carry over from the key before. */
export const DEMOS: Readonly<Record<LessonId, readonly DemoKey[]>> = {
  move: [
    { t: 0, x: 2, z: 7, hint: 'move' }, { t: 2.2, x: 5, z: 4 }, { t: 3.4, x: 5, z: 4, face: [9, 9], hint: 'look' },
    { t: 4.8, x: 9, z: 7 }, { t: 5.8, x: 10.4, z: 7 }
  ],
  // Up the ladder, a run and a jump over the gap, down to the way out.
  jump: [
    { t: 0, x: 1.5, z: 7, y: 0 }, { t: 0.5, x: 1.6, z: 7, hint: 'climb', climb: 0 }, { t: 0.6, climb: 1 },
    { t: 1.8, x: 2.4, z: 7, y: 2.5, climb: 1 }, { t: 2, climb: 0 }, { t: 2.9, x: 4.3, z: 7, y: 2.5, hint: 'jump' },
    { t: 3.2, x: 5, z: 7, y: 3.6, air: 1 }, { t: 3.5, x: 5.8, z: 7, y: 2.5, air: 0 }, { t: 4.5, x: 8.4, z: 7, y: 2.5 },
    { t: 4.9, x: 9.3, z: 7, y: 0, air: 1 }, { t: 5.1, air: 0 }, { t: 5.9, x: 10.4, z: 7, y: 0 }
  ],
  cover: [
    { t: 0, x: 1.5, z: 7, crouch: 0, hint: 'crouch' }, { t: 0.8, x: 1.5, z: 7, crouch: 1 },
    { t: 5.6, x: 9.4, z: 7.3, crouch: 1 }, { t: 6.6, x: 10.4, z: 7, crouch: 1 }
  ],
  weapons: [
    { t: 0, x: 2, z: 7, face: [10, 2], weapon: 'sniper', aim: 0, hint: 'scope' }, { t: 0.7, aim: 1 }, { t: 1.8, aim: 1, hint: 'fire' },
    { t: 2.6, aim: 0, weapon: 'rocket', face: [8.5, 11], hint: 'weapon' }, { t: 3.2, aim: 1, hint: 'fire' }, { t: 4.4, aim: 1 },
    { t: 5.2, aim: 0, weapon: 'minigun', face: [9, 6], hint: 'weapon' }, { t: 5.8, aim: 1, hint: 'fire' }, { t: 8, aim: 1 }
  ],
  // Over the crate: it is the mech's.
  supply: [{ t: 0, x: 1.5, z: 7, hint: 'supply' }, { t: 2.4, x: 5, z: 7 }, { t: 2.8, x: 5, z: 7 }, { t: 4.6, x: 10.4, z: 7 }],
  // Crouched, from behind, up to the hologram guard: the takedown, all of it (#110).
  blade: [
    { t: 0, x: 1.5, z: 7, crouch: 0, hint: 'crouch' }, { t: 0.6, crouch: 1 },
    { t: 4, x: BLADE_VICTIM[0] - TD_REACH_CELLS, z: BLADE_VICTIM[1], crouch: 1, face: [BLADE_VICTIM[0], BLADE_VICTIM[1]] },
    { t: 4.3, hint: 'blade', takedown: true, crouch: 0 },
    { t: 4.3 + TD_END, x: BLADE_VICTIM[0] - TD_REACH_CELLS, z: BLADE_VICTIM[1] },
    { t: 5.6 + TD_END, x: 6, z: 7 }
  ],
  // The guard here is already down (#113: one takedown lesson is enough):
  // over to the body, and the flame, until nothing is left (#99).
  burn: [
    { t: 0, x: 1.5, z: 7, body: 1, burn: 0 }, { t: 3, x: 6, z: 8.6, face: [6, 10] },
    { t: 3.3, burn: 0, hint: 'burn' }, { t: 3.5, burn: 1 }, { t: 5.4, burn: 1, body: 0 }, { t: 5.6, burn: 0 },
    { t: 7.2, x: 10.4, z: 7 }
  ],
  // A decoy where the guard will see it; the guard goes to look; round the
  // cover, crouched, up behind it while it stares; the takedown (#115).
  decoy: [
    { t: 0, x: 1.5, z: 7 }, { t: 0.8, x: 2.2, z: 7, face: DECOY_AT, hint: 'decoy', decoy: DECOY_AT }, { t: 1.8, x: 2.2, z: 7, face: DECOY_AT },
    { t: 2.3, crouch: 1, hint: 'crouch' }, { t: 3.6, x: 2.2, z: 10.5, crouch: 1 }, { t: 5.2, x: 5.5, z: 10.5, crouch: 1 },
    { t: 7, x: DECOY_BEHIND[0], z: DECOY_BEHIND[1], crouch: 1, face: DECOY_GUARD },
    { t: 7.2, hint: 'blade', takedown: true, crouch: 0 },
    { t: 7.2 + TD_END, x: DECOY_BEHIND[0], z: DECOY_BEHIND[1] },
    { t: 8.8 + TD_END, x: 10.4, z: 7 }
  ],
  box: [
    { t: 0, x: 1.5, z: 7, boxed: 0, hint: 'hide' }, { t: 0.6, boxed: 1 }, { t: 3, x: 5, z: 7, boxed: 1 },
    { t: 4.2, x: 5, z: 7, boxed: 1 }, { t: 6.6, x: 10.4, z: 7, boxed: 1 }
  ],
  hook: [
    { t: 0, x: 1.5, z: 7 }, { t: 3.2, x: 9.6, z: 7, y: 0, climb: 0 }, { t: 3.6, hint: 'grapple', y: 0, climb: 1 },
    { t: 4.6, x: 10.4, z: 7, y: 6, climb: 1 }, { t: 5.2, x: 11, z: 7, y: 6, climb: 0 }, { t: 5.8, x: 11.8, z: 7, y: 0 }
  ],
  // Up on the tower already (#116: the climb is not the lesson): a rope to
  // the platform with T, along it, and down.
  rope: [
    { t: 0, x: 3.4, z: 7, y: 4, rope: 0, face: [8.5, 7] }, { t: 0.8, hint: 'rope', rope: 0 }, { t: 1.1, rope: 1 },
    { t: 1.6, x: 3.4, z: 7, y: 4, cable: 1 }, { t: 4.4, x: 8.4, z: 7, y: 2, cable: 1 }, { t: 4.6, cable: 0 },
    { t: 5.1, x: 9.6, z: 7, y: 0, air: 1 }, { t: 5.3, air: 0 }, { t: 6, x: 10.4, z: 7, y: 0 }
  ],
  beacon: [{ t: 0, x: 1.5, z: 7 }, { t: 3, x: 5.4, z: 8.3, hint: 'sabotage' }, { t: 5, x: 5.4, z: 8.3, face: [6, 9] }],
  salvage: [
    { t: 0, x: 1.5, z: 7, loot: 0 }, { t: 3, x: 5.4, z: 8.3, hint: 'loot' }, { t: 3.4, face: [6, 9], loot: 1 }, { t: 5.6, loot: 1 }
  ],
  extract: [{ t: 0, x: 1.5, z: 7, hint: 'goal' }, { t: 3.5, x: 6, z: 7 }]
}

/** A demo loops until its lesson is done (#87), with this pause between plays. */
export const DEMO_GAP_S = 0.9
/** A glyph pulses this long after its moment in a demo. */
export const HINT_HOLD_S = 1.6

/** What the mission reports each step: counts are totals since the raid began. */
export interface TrainingContext {
  x: number
  y: number
  z: number
  bladeKills: number
  sniperKills: number
  rockets: number
  overheats: number
  zooms: number
  sabotaged: number
  piles: number
  /** Supplies picked up; and whether the mech has room for nothing more (so the supply room cannot shut it in). */
  supplies: number
  stocked: boolean
  /** Bodies and wrecks burnt (#99); ropes shot (#94). */
  burns: number
  ropes: number
  /** Every defender of the mech's room is down (#109). */
  cleared?: boolean
}

export interface Training {
  /** The room the mech is in. */
  room: number
  done: boolean[]
  /** The counts when the room was entered: a lesson is done by what is done in it. */
  base: TrainingContext | null
  /** Seconds into the demo playing (−1 none), plays left after it, and the pause before the next. */
  demoT: number
  demoLeft: number
  gap: number
  /** Times the mech was seen and sent back to the room's door. */
  resets: number
}

export type TrainingEvent = { type: 'enter'; room: number } | { type: 'done'; room: number }

export const makeTraining = (): Training => ({
  room: -1, done: TRAINING_ROOMS.map(() => false), base: null, demoT: -1, demoLeft: 0, gap: 0, resets: 0
})

/** The room a point is in (by its column); −1 west of the first. */
export const roomAt = (x: number): number => {
  const cx = Math.floor(x / CELL)
  for (let i = TRAINING_ROOMS.length - 1; i >= 0; i--) if (cx >= TRAINING_ROOMS[i]!.x0) return i
  return -1
}

/** The door's middle and the room's way in, in metres. */
export const doorOf = (i: number): { x: number; z: number } | null => {
  const d = TRAINING_ROOMS[i]?.door
  return d ? { x: cellMid(d.cx), z: (cellMid(d.cz0) + cellMid(d.cz1)) / 2 } : null
}
export const entryOf = (i: number): { x: number; z: number } => {
  const r = TRAINING_ROOMS[i]!
  return { x: cellMid(r.x0) + 0.4, z: (r.z0 + 6.5) * CELL }
}

/** Whether room `i`'s lesson is done, given what was done since it was entered. */
export const lessonDone = (i: number, c: TrainingContext, b: TrainingContext): boolean => {
  const r = TRAINING_ROOMS[i]!
  const atDoor = (): boolean => {
    const d = doorOf(i)
    return !!d && Math.abs(c.x - d.x) < CELL * 1.6 && Math.abs(c.z - d.z) < CELL * 1.6
  }
  switch (r.lesson) {
    case 'move': case 'jump': case 'cover': case 'decoy': case 'box': return atDoor()
    case 'supply': return c.supplies > b.supplies || (atDoor() && c.stocked)
    case 'burn': return c.burns > b.burns
    case 'rope': return c.ropes > b.ropes
    // The full drill (a rifle kill, two rockets, an overheat, a zoom), or the room
    // emptied whichever way: a player who has taken every target is done (#109).
    case 'weapons': return !!c.cleared || (c.sniperKills > b.sniperKills && c.rockets - b.rockets >= 2 && c.overheats > b.overheats && c.zooms > b.zooms)
    // From behind, and close in from the side: two.
    case 'blade': return c.bladeKills - b.bladeKills >= 2
    case 'hook': return roomAt(c.x) > i
    case 'beacon': return c.sabotaged > b.sabotaged
    case 'salvage': return c.piles > b.piles
    case 'extract': return false
  }
}

const startDemo = (t: Training): void => {
  t.demoT = 0
  t.demoLeft = 0
  t.gap = 0
}

/**
 * Seen in a training room: its defenders back at their places, at peace.
 * Also every defender ANYWHERE that is not at peace: one from the room before
 * (a sentry looking through the doorway) used to stay in combat, the mech was
 * "seen" again on the very next step, and sent back to the door on every
 * step after that, unable to move while it was shot (the #67 playtest: two of
 * three new players ended their session there).
 */
export const rewindRoom = (gar: Garrison, room: number): void => {
  for (const u of gar.units) {
    if (!isAlive(u)) continue
    const here = roomAt(u.homeX) === room
    if (!here && (u.state === 'patrol' || u.state === 'dormant')) continue
    u.x = u.px = u.homeX
    u.z = u.pz = u.homeZ
    u.yaw = u.pyaw = u.homeYaw
    u.look = 0
    u.state = 'patrol'
    u.t = 0
    u.detect = 0
    u.sees = false
    u.seenFor = 0
    u.unseenFor = 9
    u.lured = false
    u.poke = false
    u.path = []
    u.wp = u.route.length > 1 ? 1 : 0
    u.wait = u.route[0]?.wait ?? 0
    u.shouted = false
    u.fought = false
    u.runner = -1
    u.burst = 0
    u.fireT = 0
    u.aimT = 0
    u.noise = 0
    if (u.kind === 'searchlight' && u.route[0]) { u.spotX = u.route[0].x; u.spotZ = u.route[0].z }
  }
  gar.alert.level = 0
  gar.alert.chaos = false
  gar.lkp.t = -1e9
  gar.runner = -1
}

/** Play the room's demo from the start (the button). Not once the lesson is done. */
export const replayDemo = (t: Training): boolean => {
  if (t.room < 0 || t.done[t.room]) return false
  startDemo(t)
  return true
}

/** The length of a demo, seconds. */
export const demoLength = (lesson: LessonId): number => DEMOS[lesson][DEMOS[lesson].length - 1]!.t + 0.6

/** Advance the lessons one step. */
export const stepTraining = (t: Training, c: TrainingContext, dt: number): TrainingEvent[] => {
  const out: TrainingEvent[] = []
  const here = roomAt(c.x)
  if (here > t.room) {
    t.room = here
    t.base = { ...c }
    out.push({ type: 'enter', room: here })
    if (!t.done[here]) startDemo(t)
    else t.demoT = -1
  }
  if (t.room >= 0 && !t.done[t.room] && t.base && lessonDone(t.room, c, t.base)) {
    t.done[t.room] = true
    t.demoT = -1
    t.demoLeft = 0
    out.push({ type: 'done', room: t.room })
  }
  // The demo: play, pause, play again, until the lesson is done.
  if (t.demoT >= 0) {
    const lesson = TRAINING_ROOMS[t.room]!.lesson
    t.demoT += dt
    if (t.demoT > demoLength(lesson)) { t.demoT = -1; t.gap = DEMO_GAP_S }
  } else if (t.gap > 0) {
    t.gap -= dt
    if (t.gap <= 0) t.demoT = 0
  }
  return out
}

/** A lesson's hologram guard at `time` (#110, #115): where (metres), its heading, whether it walks; null for a lesson without one. */
export const victimFrame = (i: number, time: number): { x: number; z: number; yaw: number; speed: number } | null => {
  const r = TRAINING_ROOMS[i]!
  const keys = VICTIMS[r.lesson]
  if (!keys) return null
  let prev = { t: 0, x: keys[0]!.x ?? 0, z: keys[0]!.z ?? 0, face: keys[0]!.face ?? null as readonly [number, number] | null }
  const full = keys.map((k) => { prev = { t: k.t, x: k.x ?? prev.x, z: k.z ?? prev.z, face: k.face ?? prev.face }; return prev })
  let a = full[0]!
  let b = full[0]!
  for (let k = 0; k < full.length; k++) if (full[k]!.t <= time) { a = full[k]!; b = full[Math.min(k + 1, full.length - 1)]! }
  const f = b === a ? 0 : Math.min(1, Math.max(0, (time - a.t) / Math.max(1e-3, b.t - a.t)))
  const lx = a.x + (b.x - a.x) * f
  const lz = a.z + (b.z - a.z) * f
  const moving = b !== a && f < 1 && Math.hypot(b.x - a.x, b.z - a.z) > 0.05
  const toX = (v: number): number => (r.x0 + v - 1) * CELL + CELL / 2
  const toZ = (v: number): number => (r.z0 + v - 1) * CELL + CELL / 2
  const face = moving ? [b.x, b.z] as const : a.face
  const yaw = face ? Math.atan2(toX(face[0]) - toX(lx), toZ(face[1]) - toZ(lz)) : 0
  return { x: toX(lx), z: toZ(lz), yaw, speed: moving ? 0.5 : 0 }
}

/** Where the ghost is and what it does, at `time` into room `i`'s demo, in metres. */
export interface DemoFrame {
  x: number
  y: number
  z: number
  yaw: number
  speed: number
  crouch: number
  aim: number
  weapon: WeaponId
  stab: number
  boxed: number
  loot: number
  climb: number
  air: number
  cable: number
  rope: number
  body: number
  burn: number
  /** Seconds into the demo's takedown (#110), or −1. */
  td: number
  /** The decoy thrown (#114): where it lands (metres) and seconds since the throw; null before. */
  decoy: { x: number; z: number; t: number } | null
  /** The control just pressed (#114): its key pops up over the hologram, for HINT_HOLD_S. */
  press: { hint: HintId; t: number } | null
  /** The control whose glyph should pulse now, if any. */
  hint: HintId | null
}

export const demoFrame = (i: number, time: number): DemoFrame => {
  const r = TRAINING_ROOMS[i]!
  const keys = DEMOS[r.lesson]
  // Fill every key from the one before.
  let prev: Required<Omit<DemoKey, 'hint' | 'face' | 'takedown' | 'decoy'>> & { face: readonly [number, number] | null } = {
    t: 0, x: 1.5, z: 7, y: 0, crouch: 0, aim: 0, weapon: 'sniper', stab: 0, boxed: 0, loot: 0,
    climb: 0, air: 0, cable: 0, rope: 0, body: 0, burn: 0, face: null
  }
  const full = keys.map((k) => {
    prev = { ...prev, ...k, face: k.face ?? (k.x !== undefined || k.z !== undefined ? null : prev.face) } as typeof prev
    return prev
  })
  let a = full[0]!
  let b = full[0]!
  for (let k = 0; k < full.length; k++) {
    if (full[k]!.t <= time) { a = full[k]!; b = full[Math.min(k + 1, full.length - 1)]! }
  }
  const span = Math.max(1e-3, b.t - a.t)
  const f = b === a ? 0 : Math.min(1, Math.max(0, (time - a.t) / span))
  const lerp = (p: number, q: number): number => p + (q - p) * f
  const lx = lerp(a.x, b.x)
  const lz = lerp(a.z, b.z)
  const toX = (v: number): number => (r.x0 + v - 1) * CELL + CELL / 2
  const toZ = (v: number): number => (r.z0 + v - 1) * CELL + CELL / 2
  const dx = (b.x - a.x) * CELL
  const dz = (b.z - a.z) * CELL
  const moving = b !== a && Math.hypot(dx, dz) > 0.05
  const face = a.face
  const yaw = face ? Math.atan2(toX(face[0]) - toX(lx), toZ(face[1]) - toZ(lz)) : moving ? Math.atan2(dx, dz) : Math.PI / 2
  let hint: HintId | null = null
  for (const k of keys) if (k.hint && k.t <= time && time - k.t < HINT_HOLD_S) hint = k.hint
  let td = -1
  for (const k of keys) if (k.takedown && time >= k.t && time - k.t <= TD_END + 4) td = time - k.t
  let decoy: DemoFrame['decoy'] = null
  for (const k of keys) if (k.decoy && time >= k.t) decoy = { x: toX(k.decoy[0]), z: toZ(k.decoy[1]), t: time - k.t }
  let press: DemoFrame['press'] = null
  for (const k of keys) if (k.hint && k.t <= time && time - k.t < HINT_HOLD_S) press = { hint: k.hint, t: time - k.t }
  return {
    x: toX(lx), y: lerp(a.y, b.y), z: toZ(lz), yaw,
    speed: moving ? Math.min(1, Math.hypot(dx, dz) / span / 3) : 0,
    crouch: lerp(a.crouch, b.crouch), aim: lerp(a.aim, b.aim), weapon: a.weapon,
    stab: lerp(a.stab, b.stab), boxed: lerp(a.boxed, b.boxed), loot: lerp(a.loot, b.loot),
    climb: lerp(a.climb, b.climb), air: lerp(a.air, b.air), cable: lerp(a.cable, b.cable),
    rope: lerp(a.rope, b.rope), body: lerp(a.body, b.body), burn: lerp(a.burn, b.burn), td, decoy, press, hint
  }
}
