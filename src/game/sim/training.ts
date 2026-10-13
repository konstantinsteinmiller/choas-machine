import { CELL, cellMid } from '../world/grid'
import {
  HIDE_DRONE, HIDE_DRONE_ALT, HIDE_SPOT, HIDE_TARGET, HOOK_WALL_H, JUMP_DECK_H, JUMP_PIT_COL, ROCKET_HOLO, TRAINING_ROOMS, type LessonId
} from '../data/fortresses/training'
import type { WeaponId } from '../data/ids'
import type { HumanDeath } from '../models/garrison'
import type { HintId } from './coach'
import { isAlive, type Garrison } from './garrison'
import { VARIANTS, guardToWorld, type BackstabVariant } from './backstab'

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
  /** The grappling hook's line, out from the hand to the wall top (0 … 1, #117). */
  hook?: number
  /** Where the hook bites (room cells x, z, and the height of the top): set on the throw. */
  grip?: readonly [number, number, number]
  body?: number
  burn?: number
  /** A takedown starts here (#110): the full choreography, on the hologram guard. */
  takedown?: true
  /** A decoy is thrown here, at this cell (#114): it arcs out and stands there, a light the guard turns to. */
  decoy?: readonly [number, number]
  /** A rocket leaves the launcher's nose here, at this cell (#146): it flies, and its target comes apart. */
  rocket?: readonly [number, number]
  /** The control this moment shows: its glyph pulses. */
  hint?: HintId
}

/**
 * The blade room's hologram guard, in the room's own cells (its back to the
 * way in), and what it looks at: in the middle of the room, straight ahead of
 * the way in (#158: up in the far corner it went unseen).
 */
export const BLADE_VICTIM: readonly [number, number] = [5, 7]
const BLADE_LOOK: readonly [number, number] = [7, 7]

/**
 * The demo's backstab (#110): always the one variant, so the ghost's path
 * walks up to exactly where it starts and walks off from where it ends.
 */
export const DEMO_BACKSTAB: BackstabVariant = 'neck'
const TD_END = VARIANTS[DEMO_BACKSTAB].end

/**
 * Where the mech stands, and a point it faces, at the first key (`at: 0`) or
 * the last (`at: 1`) of the demo's backstab on a guard at `v` facing toward
 * `face` (room cells): the variant's own place behind it (#114: the blade goes in).
 */
const behind = (v: readonly [number, number], face: readonly [number, number], at: 0 | 1 = 0): { x: number; z: number; face: [number, number] } => {
  const keys = VARIANTS[DEMO_BACKSTAB].keys
  const k = at === 0 ? keys[0]! : keys[keys.length - 1]!
  const yaw = Math.atan2(face[0] - v[0], face[1] - v[1])
  const [x, , z] = guardToWorld(v[0], 0, v[1], yaw, k.mx / CELL, 0, k.mz / CELL)
  const my = yaw + k.myaw
  return { x, z, face: [x + Math.sin(my), z + Math.cos(my)] }
}
const BLADE_BEHIND = behind(BLADE_VICTIM, BLADE_LOOK)
const BLADE_AFTER = behind(BLADE_VICTIM, BLADE_LOOK, 1)

/**
 * The decoy room's hologram guard (#115): it turns to the decoy, walks over,
 * and stands staring at it, puzzled; the mech comes round and takes it.
 */
const DECOY_AT: readonly [number, number] = [7, 3]
const DECOY_GUARD: readonly [number, number] = [7.6, 3.9]
const DECOY_BEHIND = behind(DECOY_GUARD, DECOY_AT)
const DECOY_AFTER = behind(DECOY_GUARD, DECOY_AT, 1)

/** The hide room's firing spot (room cells), where the demo's ghost shoots from; and its hologram sentry, beside the real one. */
export const HIDE_FIRE: readonly [number, number] = [5, 7]
const HIDE_HOLO_TARGET: readonly [number, number] = [HIDE_TARGET[0] - 1.2, HIDE_TARGET[1]]

/**
 * The barrel room's hologram drum (room cells): out in front of the real one,
 * well short of the wall, ahead and to the left of the way in (where the
 * camera at the projector sees it; to the right the doorway hides it).
 */
export const DEMO_DRUM: readonly [number, number] = [4, 4.6]

/** A hologram guard a lesson's takedown is played on: where it stands (room cells), facing what; missing values carry over. */
export interface VictimKey { t: number; x?: number; z?: number; face?: readonly [number, number] }
export const VICTIMS: Readonly<Partial<Record<LessonId, readonly VictimKey[]>>> = {
  blade: [{ t: 0, x: BLADE_VICTIM[0], z: BLADE_VICTIM[1], face: BLADE_LOOK }],
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
  // Crouched all the way, and through the gap under the gate (#186); it stops
  // just past the glass, still crouched and held there, where a player at the
  // gate still sees it (further on it was out of sight).
  cover: [
    { t: 0, x: 1.5, z: 7, crouch: 0, hint: 'crouch' }, { t: 0.8, x: 1.5, z: 7, crouch: 1 },
    { t: 5.6, x: 9.4, z: 7.3, crouch: 1 }, { t: 6.6, x: 10.4, z: 7, crouch: 1 },
    { t: 7.2, x: 11, z: 7, crouch: 1 }, { t: 7.8, x: 11.5, z: 7, crouch: 1 }, { t: 9.0, x: 11.5, z: 7, crouch: 1 }
  ],
  weapons: [
    // The minigun on all three (#201 follow-up: players kept the rifle all
    // the way): drawn first, then a stream into the sentry, a turn, the two.
    { t: 0, x: 2, z: 7, face: [10, 2], weapon: 'sniper', aim: 0, hint: 'weapon' }, { t: 0.8, weapon: 'minigun', aim: 0 },
    { t: 1.3, aim: 1, hint: 'fire' }, { t: 2.15, aim: 1 }, { t: 2.5, aim: 0, face: [8.5, 11] }, { t: 3.1, aim: 1, hint: 'fire' }, { t: 5.6, aim: 1 }
  ],
  // The launcher (#146): 3 draws it, up it comes (aimed up at the ledge), and
  // the rocket leaves its nose for the hologram's mech beside the real one,
  // which comes apart. The ghost stands ahead and to the left of the way in,
  // clear of the doorway's edge, so the player sees it aim up and fire.
  rocket: [
    { t: 0, x: 1.5, z: 7.5, face: ROCKET_HOLO, weapon: 'sniper', aim: 0 },
    { t: 0.9, x: 2.6, z: 5.4, face: ROCKET_HOLO, hint: 'rocket' }, { t: 1.2, weapon: 'rocket' }, { t: 1.7, aim: 1 },
    { t: 2.3, aim: 1, hint: 'fire', rocket: ROCKET_HOLO }, { t: 4.4, aim: 1 }, { t: 5, aim: 0 }
  ],
  // Shoot, then hide: from the firing spot, one round into the sentry; the
  // moment it is fired, away at a run, crouched, behind the crates, and kept
  // down there while the drone comes to the empty spot and sweeps it.
  hide: [
    { t: 0, x: 1.5, z: 7, weapon: 'sniper', aim: 0 }, { t: 1.2, x: HIDE_FIRE[0], z: HIDE_FIRE[1], face: HIDE_HOLO_TARGET, hint: 'scope' },
    { t: 1.7, aim: 1 }, { t: 2.6, aim: 1, hint: 'fire' }, { t: 2.85, aim: 0, crouch: 0 },
    { t: 3.1, x: HIDE_FIRE[0] - 0.2, z: HIDE_FIRE[1] - 0.3, crouch: 1, hint: 'crouch' }, { t: 4.1, x: HIDE_SPOT[0], z: HIDE_SPOT[1], crouch: 1, face: HIDE_FIRE },
    { t: 10.6, crouch: 1 }, { t: 11.2, crouch: 0 }
  ],
  // Over the crate: it is the mech's.
  supply: [{ t: 0, x: 1.5, z: 7, hint: 'supply' }, { t: 2.4, x: 5, z: 7 }, { t: 2.8, x: 5, z: 7 }, { t: 4.6, x: 10.4, z: 7 }],
  // Crouched, from behind, up to the hologram guard: the takedown, all of it (#110).
  blade: [
    { t: 0, x: 1.5, z: 7, crouch: 0, hint: 'crouch' }, { t: 0.6, crouch: 1 },
    { t: 3.2, x: BLADE_BEHIND.x, z: BLADE_BEHIND.z, crouch: 1, face: BLADE_BEHIND.face },
    { t: 3.5, hint: 'blade', takedown: true, crouch: 0 },
    { t: 3.5 + TD_END, x: BLADE_AFTER.x, z: BLADE_AFTER.z },
    { t: 4.6 + TD_END, x: 3.5, z: 9 }
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
    { t: 7, x: DECOY_BEHIND.x, z: DECOY_BEHIND.z, crouch: 1, face: DECOY_BEHIND.face },
    { t: 7.2, hint: 'blade', takedown: true, crouch: 0 },
    { t: 7.2 + TD_END, x: DECOY_AFTER.x, z: DECOY_AFTER.z },
    { t: 8.8 + TD_END, x: 10.4, z: 7 }
  ],
  box: [
    { t: 0, x: 1.5, z: 7, boxed: 0, hint: 'hide' }, { t: 0.6, boxed: 1 }, { t: 3, x: 5, z: 7, boxed: 1 },
    { t: 4.2, x: 5, z: 7, boxed: 1 }, { t: 6.6, x: 10.4, z: 7, boxed: 1 }
  ],
  // To the foot of the wall, the hook up to its top, reeled up on the line,
  // over the top, and down the far side (#117: the hook flies, it is no ladder).
  hook: [
    { t: 0, x: 1.5, z: 7 }, { t: 3.2, x: 9.6, z: 7, y: 0 }, { t: 3.3, hint: 'grapple', hook: 0, grip: [10.55, 7, HOOK_WALL_H] }, { t: 3.6, hook: 1 },
    { t: 3.75, x: 9.6, z: 7, y: 0, air: 0, hook: 1 }, { t: 4.6, x: 10.2, z: 7, y: 5.3, air: 1, hook: 1 },
    { t: 4.9, x: 10.7, z: 7, y: 6, air: 0, hook: 0 }, { t: 5.3, x: 11, z: 7, y: 6 },
    { t: 5.8, x: 11.8, z: 7, y: 0, air: 1 }, { t: 6, air: 0 }
  ],
  // Up on the tower already (#116: the climb is not the lesson): a rope to
  // the platform with T, along it, and down.
  rope: [
    { t: 0, x: 3.4, z: 7, y: 4, rope: 0, face: [8.5, 7] }, { t: 0.8, hint: 'rope', rope: 0 }, { t: 1.1, rope: 1 },
    { t: 1.6, x: 3.5, z: 7, y: 4, cable: 1 }, { t: 4, x: 7.5, z: 7, y: 2, cable: 1 }, { t: 4.2, cable: 0 },
    { t: 4.8, x: 9.3, z: 7, y: 2 }, { t: 5.2, x: 9.9, z: 7, y: 0, air: 1 }, { t: 5.4, air: 0 }, { t: 6, x: 10.4, z: 7, y: 0 }
  ],
  // The barrel (#198): a hologram drum out in front of the real one, its
  // guards round it; the rifle up, one round, and the lot of them go up with it.
  barrel: [
    { t: 0, x: 1.5, z: 7, weapon: 'sniper', aim: 0 }, { t: 1.1, x: 2.4, z: 7.4, face: DEMO_DRUM, hint: 'scope' },
    { t: 1.7, aim: 1 }, { t: 2.7, aim: 1, hint: 'fire' }, { t: 6, aim: 1 }, { t: 6.6, aim: 0 }
  ],
  salvage: [
    { t: 0, x: 1.5, z: 7, loot: 0 }, { t: 3, x: 5.4, z: 8.3, hint: 'loot' }, { t: 3.4, face: [6, 9], loot: 1 }, { t: 5.6, loot: 1 }
  ],
  extract: [{ t: 0, x: 1.5, z: 7, hint: 'goal' }, { t: 3.5, x: 6, z: 7 }]
}

/**
 * ─── The demos' rounds and their targets ─────────────────────────────────────
 *
 * A playtester saw the weapons room's hologram guards fall with nothing to
 * say why. Every round a demo fires is drawn now: out of the ghost's muzzle
 * at `t`, flying `fly` seconds into its target, and the target goes down only
 * when the round that takes it lands (`targetDies`). The barrel room's round
 * goes into a hologram drum, and the drum's blast takes its guards.
 */

/** A hologram guard a demo's rounds take: where it stands (room cells), its heading, how it falls; thrown by a blast, how much further (m) and how high (m). */
export interface DemoTarget { at: readonly [number, number]; yaw: number; death: HumanDeath; fling?: number; lift?: number }

/** One round: fired at `t`, at target `target` (or at the lesson's drum), landing `y` metres up it after `fly` seconds. */
export interface DemoShot { t: number; weapon: WeaponId; target: number | 'drum'; y: number; fly: number }

/** The drum is hit, and goes up this long after (a spark, then the bang). */
export const DRUM_FUSE_S = 0.06
/** The blast reaches a guard this long after it goes up, per metre. */
const BLAST_S_PER_M = 0.012

/** The hide room's demo round is fired here. */
const HIDE_SHOT_T = 2.6

/** A guard round the drum, facing it. */
const round = (x: number, z: number, fling: number, lift: number): DemoTarget =>
  ({ at: [x, z], yaw: Math.atan2(DEMO_DRUM[0] - x, DEMO_DRUM[1] - z), death: 'thrown', fling, lift })

export const DEMO_TARGETS: Readonly<Partial<Record<LessonId, readonly DemoTarget[]>>> = {
  // The sentry and the two the minigun cuts down.
  weapons: [
    { at: [10, 2], yaw: Math.PI, death: 'back' }, { at: [8, 11], yaw: 0, death: 'front' }, { at: [9, 11], yaw: 0, death: 'back' }
  ],
  // Five round the drum, a gap toward the ghost for its round; thrown furthest
  // where the room has the length (the wall and the ladder are close east).
  hide: [{ at: HIDE_HOLO_TARGET, yaw: Math.PI, death: 'front' }],
  barrel: [round(4.08, 5.5, 0, 1.3), round(4.23, 3.73, 1, 1.4), round(3.48, 3.86, 0.8, 1.9), round(3.15, 4.29, 0.8, 1.2), round(3.15, 4.91, 0.6, 1.6)]
}

/** The minigun's burst: `n` rounds, one every `every` s from `t0`, into target `target`. */
const burst = (t0: number, n: number, every: number, target: number): DemoShot[] =>
  Array.from({ length: n }, (_, k) => ({ t: t0 + k * every, weapon: 'minigun' as const, target, y: 1.05 + ((k * 7) % 5) * 0.12, fly: 0.11 }))

export const DEMO_SHOTS: Readonly<Partial<Record<LessonId, readonly DemoShot[]>>> = {
  // The minigun's stream: into the sentry, then on the two.
  weapons: [...burst(1.5, 8, 0.07, 0), ...burst(3.35, 9, 0.07, 1), ...burst(4.02, 7, 0.07, 2)],
  barrel: [{ t: 2.7, weapon: 'sniper', target: 'drum', y: 0.7, fly: 0.1 }],
  hide: [{ t: HIDE_SHOT_T, weapon: 'sniper', target: 0, y: 1.45, fly: 0.1 }]
}

/** When the lesson's drum goes up (−1 none): its round lands, and a beat after. */
export const drumBlast = (lesson: LessonId): number => {
  const s = DEMO_SHOTS[lesson]?.find(q => q.target === 'drum')
  return s ? s.t + s.fly + DRUM_FUSE_S : -1
}

/** When a demo's target goes down: the last round into it lands, or the drum's blast reaches it. */
export const targetDies = (lesson: LessonId, k: number): number => {
  let t = -1
  for (const s of DEMO_SHOTS[lesson] ?? []) if (s.target === k) t = Math.max(t, s.t + s.fly)
  const blast = drumBlast(lesson)
  const tg = DEMO_TARGETS[lesson]?.[k]
  if (blast >= 0 && tg) t = Math.max(t, blast + Math.hypot(tg.at[0] - DEMO_DRUM[0], tg.at[1] - DEMO_DRUM[1]) * CELL * BLAST_S_PER_M)
  return t
}

/**
 * The hide room's hologram drone: on its beat by the south wall; the shot
 * heard, it flies to the firing spot (the ghost long gone), sweeps its light
 * round the empty spot, and goes back. Room cells; `sweep` 0 … 1 is how wide
 * its light circles.
 */
export interface DroneKey { t: number; x: number; z: number; sweep: number }
export const HIDE_DRONE_KEYS: readonly DroneKey[] = [
  { t: 0, x: HIDE_DRONE[0]![0] + 1, z: HIDE_DRONE[0]![1], sweep: 0 },
  { t: HIDE_SHOT_T + 0.3, x: HIDE_DRONE[1]![0] - 1, z: HIDE_DRONE[1]![1], sweep: 0 },
  { t: 6.4, x: HIDE_FIRE[0], z: HIDE_FIRE[1], sweep: 0 },
  { t: 6.8, x: HIDE_FIRE[0], z: HIDE_FIRE[1], sweep: 1 },
  { t: 9.2, x: HIDE_FIRE[0], z: HIDE_FIRE[1], sweep: 1 },
  { t: 9.5, x: HIDE_FIRE[0], z: HIDE_FIRE[1], sweep: 0 },
  { t: 11.2, x: HIDE_DRONE[0]![0] + 1, z: HIDE_DRONE[0]![1], sweep: 0 }
]
/** The hologram drone's height over the floor (m). */
export const HIDE_DRONE_Y = HIDE_DRONE_ALT

/** Where the hide room's hologram drone is at `time` (room cells), and how wide its light sweeps. */
export const droneAt = (time: number): { x: number; z: number; sweep: number } => {
  const k = HIDE_DRONE_KEYS
  let a = k[0]!
  let b = k[0]!
  for (let i = 0; i < k.length; i++) if (k[i]!.t <= time) { a = k[i]!; b = k[Math.min(i + 1, k.length - 1)]! }
  const f = b === a ? 0 : Math.min(1, Math.max(0, (time - a.t) / Math.max(1e-3, b.t - a.t)))
  const e = f * f * (3 - 2 * f)
  return { x: a.x + (b.x - a.x) * e, z: a.z + (b.z - a.z) * e, sweep: a.sweep + (b.sweep - a.sweep) * f }
}

/**
 * Down in the jump room's gap (#154): the way out of it, shown right there.
 * The hook thrown up to the far deck's edge (G pops up), the mech reeled up
 * onto it, and on to the way out. Rows are shifted to beside the mech
 * (`Training.pitZ`); the decks run the whole length of the gap.
 */
export const PIT_DEMO: readonly DemoKey[] = [
  { t: 0, x: JUMP_PIT_COL, z: 7, y: 0 }, { t: 0.7, x: JUMP_PIT_COL, z: 7, y: 0, face: [JUMP_PIT_COL + 2, 7] },
  { t: 0.9, hint: 'grapple', hook: 0, grip: [JUMP_PIT_COL + 0.55, 7, JUMP_DECK_H] }, { t: 1.2, hook: 1 },
  { t: 1.35, x: JUMP_PIT_COL, z: 7, y: 0, air: 0, hook: 1 }, { t: 2, x: JUMP_PIT_COL + 0.35, z: 7, y: JUMP_DECK_H - 0.3, air: 1, hook: 1 },
  { t: 2.25, x: JUMP_PIT_COL + 1.1, z: 7, y: JUMP_DECK_H, air: 0, hook: 0 }, { t: 3.4, x: JUMP_PIT_COL + 3.2, z: 7, y: JUMP_DECK_H }
]

/** Whether a point is down in room `i`'s gap: the jump room, the gap's column, below the decks (#154). */
export const inPit = (i: number, x: number, y: number): boolean => {
  const r = TRAINING_ROOMS[i]
  return !!r && r.lesson === 'jump' && Math.floor(x / CELL) === r.x0 + JUMP_PIT_COL - 1 && y < JUMP_DECK_H - 1
}

/** A demo loops until its lesson is done (#87), with this pause between plays. */
export const DEMO_GAP_S = 0.9
/** A glyph pulses this long after its moment in a demo. */
export const HINT_HOLD_S = 2.6

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
  /** Every defender of the mech's room is down (#109): the room it is in now, not the one it left (#168). */
  cleared?: boolean
  /** Times the mech has gone into a crouch (#171: the cover room's door wants one). */
  crouches?: number
  /** The mech is crouched now: one that came to the cover room's door already down has done its crouch. */
  crouched?: boolean
  /** Times the mech's room has been started over (#171: the decoy room's first try wants the blade). */
  tries?: number
  /**
   * The hide room: its sentry is down; a drone in it has gone to look where a
   * shot came from since the room was last set up (`hunted`); and one is
   * still on that hunt (flying there, or sweeping the spot).
   */
  shotDown?: boolean
  hunted?: boolean
  searching?: boolean
  /**
   * A rope has an end in the mech's room, wherever it was shot from: the rope
   * room's lesson is any rope at all (a playtester's rope from the top of the
   * wall it is entered over, down into the room, did not count: that wall top
   * is the hook room's, the shot was before the room was entered).
   */
  roped?: boolean
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
  /** Times the mech was seen and sent back to the room's door: in all, and per room (#165). */
  resets: number
  roomResets: number[]
  /** Down in the jump room's gap (#154): the way-out demo plays instead, this many rows from its own. */
  pit: boolean
  pitZ: number
  /** The disguise room's alarm post is going off: seconds left before the room starts over (−1 not). */
  alarmT: number
}

export type TrainingEvent = { type: 'enter'; room: number } | { type: 'done'; room: number }

export const makeTraining = (): Training => ({
  room: -1, done: TRAINING_ROOMS.map(() => false), base: null, demoT: -1, demoLeft: 0, gap: 0, resets: 0, roomResets: TRAINING_ROOMS.map(() => 0), pit: false, pitZ: 0, alarmT: -1
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
  // The first (walking) room's gate opens well before it is reached (#196
  // follow-up): its lesson is only to walk, a shut door on the very first
  // steps confused players.
  const reach = r.lesson === 'move' ? CELL * 3.5 : CELL * 1.6
  const atDoor = (): boolean => {
    const d = doorOf(i)
    return !!d && Math.abs(c.x - d.x) < reach && Math.abs(c.z - d.z) < reach
  }
  switch (r.lesson) {
    case 'move': case 'jump': case 'box': return atDoor()
    // To the door, and crouched on the way at least once (#171), or crouched
    // there now: a player who came in already down (as the card says to) was
    // told "crouch" by a door it was crouched at, and pressing it stood the mech up.
    case 'cover': return atDoor() && ((c.crouches ?? 0) > (b.crouches ?? 0) || !!c.crouched)
    // The guard down (#171): by the blade on the first try; after a try
    // started over, any way at all (#165: a player who will not learn the
    // decoy is let through after the hint).
    case 'decoy': return !!c.cleared && (c.bladeKills > b.bladeKills || (c.tries ?? 0) > 0)
    case 'supply': return c.supplies > b.supplies || (atDoor() && c.stocked)
    case 'burn': return c.burns > b.burns
    case 'rope': return c.ropes > b.ropes || !!c.roped
    // All three down (#168), whichever way: the hologram shows the drill (a
    // rifle kill, the mini-gun on the other two). The launcher has its own room (#146).
    case 'weapons': return !!c.cleared
    // The mech on the ledge is down (#146), however that was done.
    case 'rocket': return !!c.cleared
    // From behind, and close in from the side: two.
    case 'blade': return c.bladeKills - b.bladeKills >= 2
    case 'hook': return roomAt(c.x) > i
    // The yard behind the wall cleared (#198): the drum is the way to it.
    case 'barrel': return !!c.cleared
    // The sentry shot, and the drone that came to where the shot was fired
    // from gave up there without finding the mech (being found starts the
    // room over: `stepTraining` in the mission).
    case 'hide': return !!c.shotDown && !!c.hunted && !c.searching
    case 'salvage': return c.piles > b.piles
    case 'extract': return false
  }
}

/** What a lesson still has to work with: defenders standing in its room, bodies left to burn, fuel, ropes; the hide room's drones. */
export interface LessonStock { alive: number; bodies: number; fuel: number; ropes: number; barrels?: number; drones?: number }

/**
 * The lesson can no longer be done with what is left in its room: the
 * blade room's guards shot instead of bladed, the body gone, the fuel or the
 * ropes spent. The room is then set up again (`restoreLesson` in the mission).
 */
export const lessonStuck = (i: number, c: TrainingContext, b: TrainingContext, s: LessonStock): boolean => {
  switch (TRAINING_ROOMS[i]!.lesson) {
    case 'blade': return c.bladeKills - b.bladeKills + s.alive < 2
    case 'burn': return c.burns <= b.burns && (s.bodies === 0 || s.fuel <= 0)
    case 'rope': return c.ropes <= b.ropes && !c.roped && s.ropes <= 0
    // The drums gone up and somebody in the yard still standing (#198).
    case 'barrel': return s.alive > 0 && s.barrels === 0
    // The sentry down with no drone sent to look (the blade, a room started
    // over after the mech was found), or the drone itself brought down.
    case 'hide': return (!!c.shotDown && !c.hunted && !c.searching) || s.drones === 0
    // The decoy room's guard shot on the first try (#171): it stands again, and the try starts over.
    case 'decoy': return !!c.cleared && c.bladeKills <= b.bladeKills && (c.tries ?? 0) === 0
    default: return false
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
    // A training dummy (the rocket room's mech) never wakes.
    u.state = u.dummy ? 'dormant' : 'patrol'
    u.t = 0
    u.detect = 0
    u.sees = false
    u.seenFor = 0
    u.unseenFor = 9
    u.lured = false
    u.decoyWatch = 0
    u.poke = false
    u.path = []
    u.wp = u.route.length > 1 ? 1 : 0
    u.wait = u.route[0]?.wait ?? 0
    u.shouted = false
    u.fought = false
    u.runner = -1
    u.burst = 0
    u.hunt = 0
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

/**
 * Caught (the owner: the room started over under the player before they saw
 * why, scoped in, still in the box). Seen in any room, the mech is held where
 * it stands for CAUGHT_S, out of its scope and its disguise, the guard that
 * has it shouting: time to take in what happened. Then the room starts over.
 * In the disguise room the alarm post by the way out goes off as well, the
 * room in red, for BOX_ALARM_S.
 */
export const CAUGHT_S = 2
export const BOX_ALARM_S = 3
export type AlarmStep = 'off' | 'start' | 'ring' | 'reset'
/** Advance the caught beat a step: `seen`, a defender has the mech. 'reset' (or 'off' while seen, outside the rooms): start the room over now. */
export const stepAlarm = (t: Training, seen: boolean, dt: number): AlarmStep => {
  if (t.alarmT < 0) {
    if (!seen || t.room < 0) return 'off'
    t.alarmT = TRAINING_ROOMS[t.room]!.lesson === 'box' ? BOX_ALARM_S : CAUGHT_S
    return 'start'
  }
  t.alarmT -= dt
  if (t.alarmT > 0) return 'ring'
  t.alarmT = -1
  return 'reset'
}

/** Play the room's demo from the start (the button). Not once the lesson is done. */
export const replayDemo = (t: Training): boolean => {
  if (t.room < 0 || t.done[t.room]) return false
  startDemo(t)
  return true
}

/** The length of a demo, seconds. */
export const demoLength = (lesson: LessonId): number => keysLength(DEMOS[lesson])
const keysLength = (keys: readonly DemoKey[]): number => keys[keys.length - 1]!.t + 0.6

/** The demo playing in the mech's room: its own, or the way out of the gap (#154). */
export const activeKeys = (t: Training): readonly DemoKey[] => (t.pit ? PIT_DEMO : DEMOS[TRAINING_ROOMS[t.room]!.lesson])

/** Where the demo playing now is, at its own time (the room, the keys, the rows it is shifted by). */
export const currentFrame = (t: Training): DemoFrame => demoFrame(t.room, t.demoT, activeKeys(t), t.pit ? t.pitZ : 0)

/**
 * The hologram plays while the mech is this near its room's projector disc
 * (#168): on the way in, and every time it comes back to it. Only in the
 * room it is in, so never through a shut door.
 */
export const DEMO_NEAR_M = 6.5

/** Whether the mech is by its room's projector disc, in that room. */
export const nearProjector = (t: Training, c: TrainingContext): boolean => {
  if (t.room < 0 || roomAt(c.x) !== t.room) return false
  const e = entryOf(t.room)
  return Math.hypot(c.x - e.x, c.z - e.z) < DEMO_NEAR_M
}

/** What a shut lesson door says to a mech walking into it (#171): the line, and the control it is about. */
export const DOOR_LINES: Readonly<Partial<Record<LessonId, { line: string; hint: HintId | null }>>> = {
  cover: { line: 'door.cover', hint: 'crouch' },
  weapons: { line: 'door.weapons', hint: 'scope' },
  rocket: { line: 'door.rocket', hint: 'rocket' },
  hide: { line: 'door.hide', hint: 'fire' },
  supply: { line: 'door.supply', hint: 'supply' },
  blade: { line: 'door.blade', hint: 'blade' },
  burn: { line: 'door.burn', hint: 'burn' },
  decoy: { line: 'door.decoy', hint: 'decoy' },
  rope: { line: 'door.rope', hint: 'rope' },
  salvage: { line: 'door.salvage', hint: 'loot' }
}

/**
 * The cover room's door to a mech already crouched (#201 follow-up): never
 * "crouch" (the key is a toggle: pressing it stood the mech up, too tall for
 * the gap), but the way through: crawl on, under the gate.
 */
export const DOOR_CRAWL: { line: string; hint: HintId } = { line: 'door.coverCrawl', hint: 'move' }

/**
 * The mech is close to room `i`'s door wall, anywhere along it, with the
 * lesson undone (#186 follow-up): players press against the wall beside the
 * door, not into the doorway, so the nudge cannot wait for the doorway.
 */
export const NEAR_DOOR_WALL_M = CELL * 2.2
export const nearDoorWall = (t: Training, i: number, c: TrainingContext): boolean => {
  if (i < 0 || t.done[i] || roomAt(c.x) !== i) return false
  const d = doorOf(i)
  return !!d && d.x - c.x < NEAR_DOOR_WALL_M && d.x - c.x > -CELL * 0.5
}

/** The mech is up against room `i`'s shut door, from inside the room. */
export const atShutDoor = (t: Training, i: number, c: TrainingContext): boolean => {
  if (i < 0 || t.done[i] || roomAt(c.x) !== i) return false
  const d = doorOf(i)
  return !!d && d.x - c.x < CELL * 1.25 && d.x - c.x > -CELL * 0.5 && Math.abs(c.z - d.z) < CELL * 1.4
}

/** Advance the lessons one step. */
export const stepTraining = (t: Training, c: TrainingContext, dt: number): TrainingEvent[] => {
  const out: TrainingEvent[] = []
  const here = roomAt(c.x)
  if (here > t.room) {
    t.room = here
    t.base = { ...c }
    out.push({ type: 'enter', room: here })
    t.alarmT = -1
    if (!t.done[here]) startDemo(t)
    else t.demoT = -1
    // A lesson is judged on the next step, by what is done in the room: never by the step that walked in.
    return out
  }
  if (t.room >= 0 && !t.done[t.room] && t.base && lessonDone(t.room, c, t.base)) {
    t.done[t.room] = true
    t.demoT = -1
    t.demoLeft = 0
    out.push({ type: 'done', room: t.room })
  }
  // Into the jump room's gap, or out of it (#154): the demo for where the mech is.
  const pit = t.room >= 0 && !t.done[t.room] && inPit(t.room, c.x, c.y)
  if (pit !== t.pit) {
    t.pit = pit
    if (pit) {
      // Beside the mech, a little toward the middle, never on top of it.
      const r = TRAINING_ROOMS[t.room]!
      const row = c.z / CELL - r.z0 + 0.5
      t.pitZ = Math.min(11, Math.max(2, row + (row < 7 ? 1.5 : -1.5))) - 7
    }
    startDemo(t)
  }
  // The demo: play, pause, play again, until the lesson is done; while the
  // mech is by the projector (or down the gap), and again when it comes back.
  // The rope room's hologram is up on its tower: it plays wherever the mech
  // is in the room (a playtester never went near it, and never saw it).
  const near = t.pit || nearProjector(t, c) || (t.room >= 0 && TRAINING_ROOMS[t.room]!.lesson === 'rope')
  if (t.demoT >= 0) {
    t.demoT += dt
    if (t.demoT > keysLength(activeKeys(t))) { t.demoT = -1; t.gap = DEMO_GAP_S }
  } else if (t.gap > 0) {
    t.gap -= dt
    if (t.gap <= 0 && near) t.demoT = 0
  } else if (near && t.room >= 0 && !t.done[t.room]) t.demoT = 0
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
  /** The hook's line, out from the hand (0 … 1, #117), and where it bites (metres; the top's height). */
  hook: number
  grip: { x: number; y: number; z: number } | null
  body: number
  burn: number
  /** Seconds into the demo's takedown (#110), or −1. */
  td: number
  /** The decoy thrown (#114): where it lands (metres) and seconds since the throw; null before. */
  decoy: { x: number; z: number; t: number } | null
  /** The rocket fired (#146): its target (metres) and seconds since it left; null before. */
  rocket: { x: number; z: number; t: number } | null
  /** The control just pressed (#114): its key pops up over the hologram, for HINT_HOLD_S. */
  press: { hint: HintId; t: number } | null
  /** The control whose glyph should pulse now, if any. */
  hint: HintId | null
}

/** `keys`: another demo than the room's own; `shift`: rows it is moved by (both #154). */
export const demoFrame = (i: number, time: number, keys: readonly DemoKey[] = DEMOS[TRAINING_ROOMS[i]!.lesson], shift = 0): DemoFrame => {
  const r = TRAINING_ROOMS[i]!
  // Fill every key from the one before.
  let prev: Required<Omit<DemoKey, 'hint' | 'face' | 'takedown' | 'decoy' | 'rocket' | 'grip'>> & { face: readonly [number, number] | null } = {
    t: 0, x: 1.5, z: 7, y: 0, crouch: 0, aim: 0, weapon: 'sniper', stab: 0, boxed: 0, loot: 0,
    climb: 0, air: 0, cable: 0, rope: 0, hook: 0, body: 0, burn: 0, face: null
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
  const toZ = (v: number): number => (r.z0 + v + shift - 1) * CELL + CELL / 2
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
  let rocket: DemoFrame['rocket'] = null
  for (const k of keys) if (k.rocket && time >= k.t) rocket = { x: toX(k.rocket[0]), z: toZ(k.rocket[1]), t: time - k.t }
  let grip: DemoFrame['grip'] = null
  for (const k of keys) if (k.grip && time >= k.t) grip = { x: toX(k.grip[0]), y: k.grip[2] + 0.05, z: toZ(k.grip[1]) }
  let press: DemoFrame['press'] = null
  for (const k of keys) if (k.hint && k.t <= time && time - k.t < HINT_HOLD_S) press = { hint: k.hint, t: time - k.t }
  return {
    x: toX(lx), y: lerp(a.y, b.y), z: toZ(lz), yaw,
    speed: moving ? Math.min(1, Math.hypot(dx, dz) / span / 3) : 0,
    crouch: lerp(a.crouch, b.crouch), aim: lerp(a.aim, b.aim), weapon: a.weapon,
    stab: lerp(a.stab, b.stab), boxed: lerp(a.boxed, b.boxed), loot: lerp(a.loot, b.loot),
    climb: lerp(a.climb, b.climb), air: lerp(a.air, b.air), cable: lerp(a.cable, b.cable),
    rope: lerp(a.rope, b.rope), hook: lerp(a.hook, b.hook), grip, body: lerp(a.body, b.body), burn: lerp(a.burn, b.burn), td, decoy, rocket, press, hint
  }
}
