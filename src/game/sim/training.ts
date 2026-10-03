import { CELL, cellMid } from '../world/grid'
import { TRAINING_ROOMS, type LessonId } from '../data/fortresses/training'
import type { WeaponId } from '../data/ids'
import type { HintId } from './coach'

/**
 * ─── The training ground's lessons (#57, #58) ────────────────────────────────
 *
 * Pure logic: which room the mech is in, whether its lesson is done, and
 * where the demo ghost is. Show, don't tell: each room opens with a ghost of
 * the mech doing the lesson, twice, while the matching control glyph pulses;
 * a button plays it again until the lesson is done. A lesson done opens the
 * gate to the next room. The mission (`trainingDirector.ts`) draws it.
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
  /** The control this moment shows: its glyph pulses. */
  hint?: HintId
}

/** The demo of each lesson. Missing values carry over from the key before. */
export const DEMOS: Readonly<Record<LessonId, readonly DemoKey[]>> = {
  move: [
    { t: 0, x: 2, z: 7, hint: 'move' }, { t: 2.2, x: 5, z: 4 }, { t: 3.4, x: 5, z: 4, face: [9, 9], hint: 'look' },
    { t: 4.8, x: 9, z: 7 }, { t: 5.8, x: 10.4, z: 7 }
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
  blade: [
    { t: 0, x: 1.5, z: 7, crouch: 0, hint: 'crouch' }, { t: 0.6, crouch: 1 }, { t: 4.4, x: 7, z: 7, crouch: 1 },
    { t: 4.7, stab: 0, hint: 'blade' }, { t: 5.3, stab: 1 }, { t: 6.1, stab: 0 },
    { t: 8.4, x: 3.6, z: 11, crouch: 1, face: [5, 11] }, { t: 8.7, stab: 0, hint: 'blade' }, { t: 9.3, stab: 1 }, { t: 10.1, stab: 0 }
  ],
  decoy: [
    { t: 0, x: 1.5, z: 7 }, { t: 1, x: 2.2, z: 7, face: [7, 2], hint: 'decoy' }, { t: 2.6, x: 2.2, z: 7, face: [7, 2] },
    { t: 4, x: 2.2, z: 10 }, { t: 7, x: 10, z: 10 }, { t: 7.8, x: 10.4, z: 7 }
  ],
  box: [
    { t: 0, x: 1.5, z: 7, boxed: 0, hint: 'hide' }, { t: 0.6, boxed: 1 }, { t: 3, x: 5, z: 7, boxed: 1 },
    { t: 4.2, x: 5, z: 7, boxed: 1 }, { t: 6.6, x: 10.4, z: 7, boxed: 1 }
  ],
  hook: [
    { t: 0, x: 1.5, z: 7 }, { t: 3.2, x: 9.6, z: 7, y: 0 }, { t: 3.6, hint: 'grapple', y: 0 },
    { t: 4.6, x: 10.4, z: 7, y: 6 }, { t: 5.2, x: 11, z: 7, y: 6 }, { t: 5.8, x: 11.8, z: 7, y: 0 }
  ],
  beacon: [{ t: 0, x: 1.5, z: 7 }, { t: 3, x: 5.4, z: 8.3, hint: 'sabotage' }, { t: 5, x: 5.4, z: 8.3, face: [6, 9] }],
  salvage: [
    { t: 0, x: 1.5, z: 7, loot: 0 }, { t: 3, x: 5.4, z: 8.3, hint: 'loot' }, { t: 3.4, face: [6, 9], loot: 1 }, { t: 5.6, loot: 1 }
  ],
  extract: [{ t: 0, x: 1.5, z: 7, hint: 'goal' }, { t: 3.5, x: 6, z: 7 }]
}

/** Times each demo plays by itself when its room is entered; the pause between. */
export const DEMO_PLAYS = 2
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
    case 'move': case 'cover': case 'decoy': case 'box': return atDoor()
    case 'weapons': return c.sniperKills > b.sniperKills && c.rockets - b.rockets >= 2 && c.overheats > b.overheats && c.zooms > b.zooms
    // From behind, and close in from the side: two.
    case 'blade': return c.bladeKills - b.bladeKills >= 2
    case 'hook': return roomAt(c.x) > i
    case 'beacon': return c.sabotaged > b.sabotaged
    case 'salvage': return c.piles > b.piles
    case 'extract': return false
  }
}

const startDemo = (t: Training, plays: number): void => {
  t.demoT = 0
  t.demoLeft = plays - 1
  t.gap = 0
}

/** Play the room's demo once more (the button). Not once the lesson is done. */
export const replayDemo = (t: Training): boolean => {
  if (t.room < 0 || t.done[t.room] || t.demoT >= 0) return false
  startDemo(t, 1)
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
    if (!t.done[here]) startDemo(t, DEMO_PLAYS)
    else t.demoT = -1
  }
  if (t.room >= 0 && !t.done[t.room] && t.base && lessonDone(t.room, c, t.base)) {
    t.done[t.room] = true
    t.demoT = -1
    t.demoLeft = 0
    out.push({ type: 'done', room: t.room })
  }
  // The demo: play, pause, play again.
  if (t.demoT >= 0) {
    const lesson = TRAINING_ROOMS[t.room]!.lesson
    t.demoT += dt
    if (t.demoT > demoLength(lesson)) {
      if (t.demoLeft > 0) { t.demoLeft--; t.demoT = -1; t.gap = DEMO_GAP_S } else t.demoT = -1
    }
  } else if (t.gap > 0) {
    t.gap -= dt
    if (t.gap <= 0) t.demoT = 0
  }
  return out
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
  /** The control whose glyph should pulse now, if any. */
  hint: HintId | null
}

export const demoFrame = (i: number, time: number): DemoFrame => {
  const r = TRAINING_ROOMS[i]!
  const keys = DEMOS[r.lesson]
  // Fill every key from the one before.
  let prev: Required<Omit<DemoKey, 'hint' | 'face'>> & { face: readonly [number, number] | null } = {
    t: 0, x: 1.5, z: 7, y: 0, crouch: 0, aim: 0, weapon: 'sniper', stab: 0, boxed: 0, loot: 0, face: null
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
  return {
    x: toX(lx), y: lerp(a.y, b.y), z: toZ(lz), yaw,
    speed: moving ? Math.min(1, Math.hypot(dx, dz) / span / 3) : 0,
    crouch: lerp(a.crouch, b.crouch), aim: lerp(a.aim, b.aim), weapon: a.weapon,
    stab: lerp(a.stab, b.stab), boxed: lerp(a.boxed, b.boxed), loot: lerp(a.loot, b.loot), hint
  }
}
