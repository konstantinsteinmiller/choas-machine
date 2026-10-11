import {
  BoxGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Quaternion, Scene,
  SphereGeometry, SRGBColorSpace, TextureLoader, Vector3, type Object3D, type Texture
} from 'three'
void (null as unknown as Object3D)
import { FREE_PAINT } from '../models/paintIds'
import { newScene, type GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { noSlice, type Slice } from '../engine/slicer'
import { FortressBuilder, type Fortress } from '../world/fortress'
import { CELL, VOID, heightAt } from '../world/grid'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildSky, type Sky } from '../world/sky'
import { themeOf, type ThemeId } from '../data/themes'
import { lineHandWorld, muzzleWorld, buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { BOARD_HOVER, HOUND_SCALE, STRIDE_PER_UNIT, buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import { CombatFx } from '../fx/combatFx'
import { makeGrappleVisual, type GrappleVisual } from '../fx/grappleHook'
import { buildRopeLines } from '../fx/ropeLine'
import { SalvageView } from '../world/salvageView'
import type { Rocket } from '../sim/rockets'
import type { Decoy } from '../sim/melee'
import { angleDelta } from '../sim/player'
import { mechGaitRate } from '../sim/gait'
import { AIR_IMPACT_S, AIR_KNEEL_S, AIR_RIDE_S, airAt, airCam, airMark, planAir } from '../sim/airStrike'
import { bodySink, placeKillBody } from '../sim/killPose'
import type { WeaponId } from '../data/ids'
import {
  MUZZLE, buildDrone, buildEnforcer, buildGoliath, buildGuard, buildRoomba, buildSearchlight, poseDrone, poseEnforcer, poseGoliath, poseGuard, poseRoomba, poseSearchlight, restGuardPose
} from '../models/garrison'
import { buildDropship, type Dropship } from '../models/dropship'
import { AIRSHIP_SOCKETS, TURRET_AT, buildAirship } from '../models/airship'
import { prependBaseUrl } from '@/utils/function'
import type { Rig } from '../models/kit'
import { Particles } from '../fx/particles'
import { makeFlameMaterial, setFlame } from '../fx/flameCone'
import { sfx } from '../audio/sfx'
import { emit } from '../bus'
import type { TrackId } from '../audio/songs'
import { CINEMA_LENGTH, INTRO_STILL_S, type CinemaId } from './cinemaIds'
import { hud } from '../state/hud'
import { buildFuelBarrel } from '../models/supplies'
import { glowVC, toonVC } from '../models/toon'

/**
 * ─── The story's scenes (round 4, #100 #103) ─────────────────────────────────
 *
 * Wordless scenes played in the engine, each a little stage (a few cells of
 * fortress in a fortress's own look, under its sky) with the game's own rigs
 * as the cast and a timeline that moves them and the camera. `story.md` is
 * the script. A scene runs as a mode pushed over whatever was up
 * (`app.pushMode`): the mission or the base waits under it, untouched.
 *
 * Each timeline is a pure function of the scene's clock, so a skip simply
 * ends it, and the tests can sample any moment.
 */

type V3 = readonly [number, number, number]
type Key = readonly [number, number, number, number]

const smooth = (k: number): number => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t) }
/** A value at `t` on keys [time, x, y, z], eased between them. */
export const track = (keys: readonly Key[], t: number, out = new Vector3()): Vector3 => {
  if (t <= keys[0]![0]) return out.set(keys[0]![1], keys[0]![2], keys[0]![3])
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!
    if (t <= b[0]) {
      const a = keys[i - 1]!
      const f = smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]))
      return out.set(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f)
    }
  }
  const z = keys[keys.length - 1]!
  return out.set(z[1], z[2], z[3])
}
/** How fast a track is moving at `t` (m/s), for the legs' pace. */
const pace = (keys: readonly Key[], t: number): number => {
  const a = track(keys, t - 0.05, new Vector3())
  const b = track(keys, t + 0.05, new Vector3())
  return a.distanceTo(b) / 0.1
}

/**
 * A round between two points (#129): walk there, stand and look about, walk
 * back, stand, `period` seconds the lot, `off` shifting where in it `t` is.
 * Writes the position; returns the heading and whether it walks.
 */
const round = (t: number, a: V3, b: V3, period: number, out: Vector3, off = 0): { yaw: number; walking: boolean } => {
  const ph = ((((t + off) / period) % 1) + 1) % 1
  const there = Math.atan2(b[0] - a[0], b[2] - a[2])
  const back = Math.atan2(a[0] - b[0], a[2] - b[2])
  let k = 0
  let yaw = there
  let walking = false
  if (ph < 0.4) { k = ph / 0.4; walking = true } else if (ph < 0.5) { k = 1 } else if (ph < 0.9) { k = 1 - (ph - 0.5) / 0.4; yaw = back; walking = true } else { k = 0; yaw = back }
  const e = smooth(k)
  out.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e)
  return { yaw, walking }
}

/** How far a `round` has walked by `t` (m), there and back counted: what its feet have covered. */
const roundDist = (t: number, a: V3, b: V3, period: number, off = 0): number => {
  const u = (t + off) / period
  const ph = u - Math.floor(u)
  const leg = ph < 0.4 ? smooth(ph / 0.4) : ph < 0.5 ? 1 : ph < 0.9 ? 1 + smooth((ph - 0.5) / 0.4) : 2
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * (2 * Math.floor(u) + leg)
}

/** 0 … 1 across [a, b]. */
const span = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)))
const between = (t: number, a: number, b: number): boolean => t >= a && t < b
/** The intro's kill from the rope runs this much slower than the game's (it has no kill-cam slow time). */
const INTRO_DIVE_SLOW = 1.3
/** When it leaves the rope (s into the intro). */
const DIVE_AT = 14.2
const tmpCam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fov: 0 }
/** The walk cycle's angle per metre walked: feet that keep pace with the ground. */
const WALK_STRIDE = mechGaitRate(0, 0)
/** How far along a keyed track it has gone by `t` (m): what its feet have covered. */
const trackDist = (keys: readonly Key[], t: number): number => {
  const t0 = keys[0]![0]
  const end = Math.min(t, keys[keys.length - 1]![0])
  if (end <= t0) return 0
  const a = track(keys, t0, new Vector3())
  const b = new Vector3()
  let d = 0
  for (let i = 1; i <= 48; i++) {
    track(keys, t0 + ((end - t0) * i) / 48, b)
    d += a.distanceTo(b)
    a.copy(b)
  }
  return d
}
/**
 * A run from `a` to `b` across [t0, t1]: up to speed, a steady pace, eased to
 * a stop (no mid-way rush). Writes the position; returns metres run and m/s.
 */
const runTo = (t: number, t0: number, t1: number, a: V3, b: V3, out: Vector3): { dist: number; speed: number } => {
  const k = span(t, t0, t1)
  const ramp = 0.18
  const v = 1 / (1 - ramp)
  const f = k < ramp ? (0.5 * v * k * k) / ramp : k < 1 - ramp ? v * (k - ramp / 2) : 1 - (0.5 * v * (1 - k) * (1 - k)) / ramp
  const dv = k < ramp ? (v * k) / ramp : k < 1 - ramp ? v : (v * (1 - k)) / ramp
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  out.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
  return { dist: len * f, speed: (len * dv) / (t1 - t0) }
}
/** A heading `k` of the way from `a` to `b`, eased, the short way round. */
const turnTo = (a: number, b: number, k: number): number => a + angleDelta(a, b) * smooth(k)

/** A camera: where it is, what it looks at, its field of view. */
interface Cam { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number }
const camOf = (c: Cam, pos: Vector3, at: Vector3, fov: number): Cam => {
  c.x = pos.x; c.y = pos.y; c.z = pos.z; c.tx = at.x; c.ty = at.y; c.tz = at.z; c.fov = fov
  return c
}
const camLerp = (out: Cam, a: Cam, b: Cam, k: number): Cam => {
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k
  out.tx = a.tx + (b.tx - a.tx) * k; out.ty = a.ty + (b.ty - a.ty) * k; out.tz = a.tz + (b.tz - a.tz) * k
  out.fov = a.fov + (b.fov - a.fov) * k
  return out
}
const newCam = (): Cam => ({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, fov: 50 })
/** A cut the director eases over (s): one shot flows into the next instead of jumping. */
const CUT_BLEND_S = 0.8
/**
 * The intro's camera operator: the shots the timeline asks for, with every
 * jump between them eased into one move (a cut reads as an edit error in a
 * piece this short), a breath of hand-held drift, and the jolt of a blast.
 */
interface Director { want: Cam; prev: Cam | null; shown: Cam; from: Cam | null; k: number }
const directors = new WeakMap<object, Director>()

/** What every scene works with. */
interface Stage {
  t: number
  dt: number
  cam: PerspectiveCamera
  mech: Rig
  mp: MechPose
  dog: Rig
  dp: DogPose
  fx: Particles
  /**
   * The game's own combat effects (#117): muzzle flashes, tracers, the rocket
   * with its exhaust, the explosion. Null where there is no canvas (tests).
   */
  cfx: CombatFx | null
  /** Rockets in flight, drawn as the game draws them. */
  rockets: Rocket[]
  /** Decoys standing, drawn as the game's own holograms (#131). */
  decoys: Decoy[]
  /** The nose of the mech's weapon, as posed last frame (where its rounds leave from). */
  muzzle: (w: WeaponId, out: Vector3) => Vector3
  /** The floor under (x, z), or −Infinity over nothing. */
  floor: (x: number, z: number) => number
  extra: Record<string, Rig | Object3D | Dropship | Mesh | Vector3 | GrappleVisual>
  /** Moments that have fired (sounds, bursts): once each. */
  fired: Set<string>
  once: (key: string, at: number, f: () => void) => void
  line: (m: Mesh, a: Vector3, b: Vector3) => void
  look: (pos: Vector3, at: Vector3, fov?: number) => void
  place: (o: Object3D, p: Vector3, yaw?: number) => void
}

interface Script {
  theme: ThemeId
  music: TrackId
  /** A picture the scene ends on, held for its last INTRO_STILL_S (#179), and the fortress it shows; under `public/`. */
  still?: { src: string; fortress: 'bastion' | 'foundry' | 'harbour' | 'spire' }
  /** The ground: cells laid out with the fortress builder. */
  stage: (b: FortressBuilder) => void
  cast: (s: Stage, scene: Group) => void
  frame: (s: Stage) => void
}

const tmpA = new Vector3()
const tmpB = new Vector3()
const tmpC = new Vector3()
const tmpD = new Vector3()
const UP = new Vector3(0, 1, 0)

// ─── Intro: the ability showcase (about 50 s) ───────────────────────────────

/** The finale (#179): the Airship rises over the perch, opens up with everything, the dog takes the mech away. */
const SHIP_UP = 35.6
const DUCK = 37.9
const FIRE = 38
const DOG_IN = 41.2
const LEAP = 42.5
const AWAY = 43.2
/**
 * The barrel (#198), cut in after the sentry's rifle shot: a squad in the
 * yard round a fuel drum, an Enforcer, three guards and a drone; the mech
 * crouched on the wall above, the rifle up, the scope in on the drum, one
 * round, and the yard goes up. The rest of the intro runs on after it as it
 * was written, its clock this much behind the scene's (`INTRO.frame`).
 */
export const BARREL_BEAT_AT = 23
export const BARREL_BEAT_S = 6
/** The squad is in the yard from here on (the camera is up on the sentry by then). */
const SQUAD_IN = 19.95
/** Into the beat: the scope comes up, the round, the blast. */
const BEAT_SCOPE = 1.7
const BEAT_SHOT = 3.3
/** The drum in the yard, its squad round it, and where the mech crouches over them. */
const DRUM: V3 = [53, 4, 19]
const SQUAD: ReadonlyArray<{ x: number; z: number }> = [{ x: 51, z: 19.6 }, { x: 54.7, z: 21 }, { x: 54.9, z: 17.1 }]
const SQUAD_MECH: V3 = [50.6, 4, 22.2]
const SQUAD_DRONE: V3 = [52, 6.6, 17]
const HIDE: V3 = [61.3, 10, 20.6]
/** The still of the third fortress takes over here (on the intro's own clock, behind the scene's by the beat). */
const STILL_AT = CINEMA_LENGTH.intro - BARREL_BEAT_S - INTRO_STILL_S
/** Where the mech crouches on the perch, behind its parapet, and the board it leaps onto. */
const PERCH: V3 = [77.3, 14, 23.4]
const PICKUP: V3 = [74.4, 14.7, 23.4]
/** The pods' rockets: when each leaves, and where it lands (the perch's parapet and its east face). */
const SHIP_ROCKETS: ReadonlyArray<{ at: number; pod: 'podL' | 'podR'; to: V3 }> = [
  { at: 38.6, pod: 'podL', to: [80.3, 13.2, 21.6] },
  { at: 39.3, pod: 'podR', to: [79.4, 15.6, 24.6] },
  { at: 40.0, pod: 'podL', to: [80.3, 15.0, 22.8] },
  { at: 40.7, pod: 'podR', to: [80.3, 11.8, 25.2] }
]
const ROCKET_FLIGHT = 0.7
/** The board gets away: the one cut left a cut, out to behind the Airship. */
const FAR_CUT = 44.6
const shotCam = newCam()
const camA = newCam()
const camB = newCam()
const camC = newCam()
const droneAt = new Vector3()
/** The Goliath creeps along the far wall (x at `at`). */
const tankAt = (at: number): number => 74 - 4 * smooth(span(at, 18, 25))
const shipInv = new Matrix4()

/** The Airship's turrets swung and pitched onto a point (as `sim/airshipView.ts` does, at once). */
const aimShip = (ship: Rig, x: number, y: number, z: number): void => {
  ship.root.updateMatrixWorld(true)
  shipInv.copy(ship.root.matrixWorld).invert()
  for (const id of ['F', 'B'] as const) {
    const local = tmpA.set(x, y, z).applyMatrix4(shipInv)
    const [tx, ty, tz] = TURRET_AT[id]
    const dx = local.x - tx
    const dy = local.y - ty
    const dz = local.z - tz
    ship.bones[`turret${id}`]!.rotation.y = Math.atan2(dx, dz)
    ship.bones[`barrels${id}`]!.rotation.x = Math.max(-1.2, Math.min(1.2, -Math.atan2(dy, Math.hypot(dx, dz))))
  }
  ship.root.updateMatrixWorld(true)
}
/** The world point at one of the Airship's sockets (a barrel's or a tube's mouth). */
const shipSocket = (ship: Rig, name: keyof typeof AIRSHIP_SOCKETS, i: number, out: Vector3): Vector3 => {
  const list = AIRSHIP_SOCKETS[name]
  const [bone, x, y, z] = list[i % list.length]!
  return ship.bones[bone]!.localToWorld(out.set(x, y, z))
}

/**
 * The barrel's squad and, during its beat, the mech and the camera (#198).
 * `beat` is the time into the beat, or -1 outside it (the squad then stands
 * hidden before it, and lies where the blast left it after).
 */
const squadFrame = (s: Stage, t: number, beat: number, shoot: (fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, w: WeaponId) => void): void => {
  const squad = s.extra.squad as Group
  // In the yard from when the camera has left it for the sentry: never popping in on screen.
  squad.visible = t >= SQUAD_IN
  if (!squad.visible) return
  const boomAt = BARREL_BEAT_AT + BEAT_SHOT + 0.08
  const since = t - boomAt
  const blown = since >= 0
  ;(s.extra.drum as Group).visible = !blown
  // Thrown off their feet, out from the drum, and down.
  const fling = (x: number, z: number, y: number, far: number, out: Vector3): Vector3 => {
    const k = blown ? smooth(Math.min(1, since / 0.45)) : 0
    const dx = x - DRUM[0]
    const dz = z - DRUM[2]
    const d = Math.hypot(dx, dz) || 1
    return out.set(x + (dx / d) * far * k, y + (blown ? Math.sin(Math.PI * Math.min(1, since / 0.45)) * 0.9 : 0), z + (dz / d) * far * k)
  }
  SQUAD.forEach((q, i) => {
    const r = s.extra[`sq${i}`] as Rig
    s.place(r.root, fling(q.x, q.z, DRUM[1], 1.6, tmpA), Math.atan2(DRUM[0] - q.x, DRUM[2] - q.z))
    poseGuard(r, { ...restGuardPose(), time: t + i, lookYaw: blown ? 0 : Math.sin(t * 0.8 + i * 2) * 0.4, deadT: blown ? Math.max(0.01, since) : 0, death: 'back' })
  })
  const em = s.extra.sqMech as Rig
  s.place(em.root, fling(SQUAD_MECH[0], SQUAD_MECH[2], SQUAD_MECH[1], 0.5, tmpA), Math.atan2(DRUM[0] - SQUAD_MECH[0], DRUM[2] - SQUAD_MECH[2]))
  poseEnforcer(em, { time: t, stride: 0, speed: 0, power: 1, aimYaw: blown ? 0 : Math.sin(t * 0.5) * 0.3, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: blown ? Math.max(0.01, since) : 0 })
  const dr = s.extra.sqDrone as Rig
  const fall = blown ? Math.max(DRUM[1], SQUAD_DRONE[1] - 9 * since * since) : SQUAD_DRONE[1] + Math.sin(t * 1.7) * 0.12
  s.place(dr.root, tmpA.set(SQUAD_DRONE[0] - (blown ? Math.min(1, since) * 1.2 : 0), fall, SQUAD_DRONE[2] - (blown ? Math.min(1, since) * 0.8 : 0)), Math.PI * 0.4)
  poseDrone(dr, { time: t, spin: t * 40, pitch: 0.1, roll: 0, eyeYaw: Math.sin(t * 0.9) * 0.5, eyePitch: 0.4, alarm: 0, deadT: blown ? Math.max(0.01, since) : 0, landed: blown && fall <= DRUM[1] + 0.01 })
  if (blown && since < 3 && Math.floor(t * 8) !== Math.floor((t - s.dt) * 8)) {
    s.fx.emit({ x: DRUM[0], y: DRUM[1] + 1, z: DRUM[2], vx: 0.2, vy: 1.6, vz: 0, color: '#3a3050', size: 1.2, sizeEnd: 3, life: 2.2, drag: 0.4 })
  }
  if (beat < 0) return

  // The mech: crouched at the wall's edge over the yard, the rifle up.
  const mp = s.mp
  s.place(s.mech.root, tmpA.set(HIDE[0], HIDE[1], HIDE[2]), Math.atan2(DRUM[0] - HIDE[0], DRUM[2] - HIDE[2]))
  mp.crouch = 1
  mp.weapon = 'sniper'
  mp.aim = beat >= BEAT_SCOPE - 0.5 ? 1 : 0
  mp.aimPitch = -0.55
  mp.recoil = between(beat, BEAT_SHOT, BEAT_SHOT + 0.4) ? 1 - span(beat, BEAT_SHOT, BEAT_SHOT + 0.4) : 0
  mp.speed = 0
  mp.climb = 0
  mp.air = 0
  mp.cable = 0
  // The camera: the squad from over its shoulder; the scope in on the drum; the blast; back out.
  // The scope's eye: over the mech's head, a little toward the drum (its arm out of the frame).
  const toward = Math.atan2(DRUM[0] - HIDE[0], DRUM[2] - HIDE[2])
  const eye = tmpB.set(HIDE[0] + Math.sin(toward) * 0.7, HIDE[1] + 2.3, HIDE[2] + Math.cos(toward) * 0.7)
  const aim = tmpC.set(DRUM[0], DRUM[1] + 0.7, DRUM[2])
  if (beat < BEAT_SCOPE) {
    const k = smooth(beat / BEAT_SCOPE)
    // From beside the mech, off its shoulder: the squad and the drum in the clear.
    s.look(tmpD.set(66.5 - 1.5 * k, 15.6 - 0.6 * k, 16 + 1.2 * k), tmpA.set(DRUM[0] + 1.5 * (1 - k), DRUM[1] + 1.2, DRUM[2] + 0.8), 52)
  } else if (beat < BEAT_SHOT + 0.25) {
    const k = smooth(span(beat, BEAT_SCOPE, BEAT_SCOPE + 1.1))
    s.look(eye, aim, 50 - 38 * k)
  } else {
    const k = smooth(span(beat, BEAT_SHOT + 0.25, BARREL_BEAT_S - 0.6))
    s.look(tmpD.set(eye.x + (67 - eye.x) * k, eye.y + (17 - eye.y) * k, eye.z + (25.5 - eye.z) * k), aim, 12 + 44 * smooth(span(beat, BEAT_SHOT + 0.25, BEAT_SHOT + 0.9)))
  }
  s.once('sqScope', BARREL_BEAT_AT + BEAT_SCOPE, () => sfx('scopeIn'))
  s.once('sqShot', BARREL_BEAT_AT + BEAT_SHOT, () => {
    sfx('sniper')
    const n = s.muzzle('sniper', new Vector3())
    shoot(n.x, n.y, n.z, DRUM[0], DRUM[1] + 0.7, DRUM[2], 'sniper')
  })
  s.once('sqBoom', boomAt, () => {
    sfx('explode')
    if (s.cfx) s.cfx.explosion(DRUM[0], DRUM[1] + 0.7, DRUM[2], DRUM[1])
    else s.fx.orbBurst(DRUM[0], DRUM[1] + 0.7, DRUM[2], '#ff9a3d', 1.4)
    s.fx.sparks(DRUM[0], DRUM[1] + 1, DRUM[2], '#ffd27a', 30, 8, 0.35)
  })
}

/**
 * The shot to show this frame, from the one the timeline asked for (`d.want`).
 * `hard`: a cut that stays a cut. `jolt` 0 … 1: a blast just went off.
 */
const direct = (d: Director, dt: number, t: number, hard: boolean, jolt: number, out: Cam): Cam => {
  const w = d.want
  const p = d.prev
  if (!p || hard) {
    d.prev = { ...w }
    d.from = null
  } else {
    const jump = Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z)
    const ax = p.tx - p.x, ay = p.ty - p.y, az = p.tz - p.z
    const bx = w.tx - w.x, by = w.ty - w.y, bz = w.tz - w.z
    const cos = (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1)
    const turn = Math.acos(Math.min(1, Math.max(-1, cos)))
    if (dt > 0 && (jump > 1.2 + 30 * dt || turn > 0.2 + 3 * dt || Math.abs(w.fov - p.fov) > 4 + 60 * dt)) {
      d.from = { ...d.shown }
      d.k = 0
    }
    Object.assign(p, w)
  }
  if (d.from) {
    d.k += dt / CUT_BLEND_S
    if (d.k >= 1) d.from = null
  }
  if (d.from) camLerp(out, d.from, w, smooth(d.k))
  else Object.assign(out, w)
  Object.assign(d.shown, out)
  // Held by a hand, not a tripod; the tighter the lens, the steadier the hand.
  const h = out.fov / 50
  const a = (0.05 + 0.2 * jolt) * h
  out.x += Math.sin(t * 0.71) * a + Math.sin(t * 83) * 0.12 * jolt * h
  out.y += Math.sin(t * 0.93 + 1) * a * 0.8 + Math.sin(t * 71) * 0.1 * jolt * h
  out.z += Math.sin(t * 0.57 + 2) * a + Math.sin(t * 67) * 0.12 * jolt * h
  out.tx += Math.sin(t * 0.43 + 3) * a * 1.4
  out.ty += Math.sin(t * 0.61 + 4) * a
  return out
}

const INTRO: Script = {
  theme: 'dusk',
  music: 'hero',
  still: { src: '/images/intro-next-fortress.webp', fortress: 'harbour' },
  stage: (b) => {
    // West shelf at 0, a cliff up to a plateau (outcrop A), a gap, then a
    // piece of the Bastion (#131): its walls 10 m, a sunken yard 6 m below
    // them nearest the gap, a ladder out of the yard, the sentry's tower and
    // the perch tower at its east end.
    b.ground(0, 0, 7, 23, 0)
    b.fill(8, 0, 17, 23, 10)
    b.fill(22, 0, 39, 23, 10)
    b.ground(22, 6, 29, 17, 4)
    b.ladder(29, 11, 'e')
    b.fill(36, 5, 37, 6, 14).fill(38, 11, 39, 12, 14)
    // The perch's east edge (#179): a parapet to duck behind when the Airship opens up.
    b.fill(39, 11, 39, 12, 15.8)
    // The yard: crates, a barrel and a heap to look like the base.
    b.cover(23, 15, 1).cover(27, 7, 1).cover(24, 7, 2)
    b.solid('barrel', 28, 15, 1.0, 0.4)
    b.heap(26, 14, 1.2)
    b.prop('lamp', 22, 11, -Math.PI / 2)
  },
  cast: (s, root) => {
    // g0 on the walls, g1 in the yard (the decoy's), g2 the sentry, g3 the Warden.
    const guards = [buildGuard(), buildGuard(), buildGuard(), buildGuard(true)]
    guards.forEach((g, i) => { s.extra[`g${i}`] = g; root.add(g.root) })
    const drone = buildDrone()
    const tank = buildGoliath()
    const enforcer = buildEnforcer()
    const hound = buildRobodog(true)
    const roomba = buildRoomba()
    const lamp = buildSearchlight()
    s.extra.drone = drone
    s.extra.tank = tank
    s.extra.enforcer = enforcer
    s.extra.hound = hound
    s.extra.roomba = roomba
    s.extra.lamp = lamp
    root.add(drone.root, tank.root, enforcer.root, hound.root, roomba.root, lamp.root)
    // The Airship (#179): the game's own, out of sight until the finale.
    const ship = buildAirship()
    ship.root.visible = false
    s.extra.ship = ship
    root.add(ship.root)
    // The game's own grappling hook and strung rope (#164): the braided line,
    // the hook's head, the pitons; not glowing tubes of their own.
    const hook = makeGrappleVisual()
    hook.setVisible(false)
    s.extra.hook = hook
    root.add(hook.group)
    const rope = buildRopeLines([{ ax: 36, ay: 10.06, az: 24, bx: 60, by: 10.06, bz: 24 }])
    rope.group.visible = false
    s.extra.rope = rope.group
    root.add(rope.group)
    // The decoy in flight: the game's emitter orb (it stands up as the game's hologram).
    const ball = new Mesh(new SphereGeometry(0.18, 10, 8), new MeshBasicMaterial({ color: '#5fe9ff', toneMapped: false }))
    const rocket = new Mesh(new SphereGeometry(0.2, 8, 6), new MeshBasicMaterial({ color: '#ffd166', toneMapped: false }))
    ball.visible = rocket.visible = false
    s.extra.ball = ball
    s.extra.rocket = rocket
    root.add(ball, rocket)
    // The barrel's squad (#198), in the yard only from its beat on.
    const squad = new Group()
    squad.visible = false
    SQUAD.forEach((_, i) => { const r = buildGuard(); s.extra[`sq${i}`] = r; squad.add(r.root) })
    const sqMech = buildEnforcer()
    const sqDrone = buildDrone()
    s.extra.sqMech = sqMech
    s.extra.sqDrone = sqDrone
    const drum = new Group()
    const dg = buildFuelBarrel()
    drum.add(new Mesh(dg.lit, toonVC()), new Mesh(dg.glow, glowVC()))
    drum.position.set(DRUM[0], DRUM[1], DRUM[2])
    s.extra.drum = drum
    squad.add(sqMech.root, sqDrone.root, drum)
    s.extra.squad = squad
    root.add(squad)
  },
  frame: (s) => {
    // The barrel's beat (#198): the intro's own clock holds at its start while
    // the beat plays, and runs that much behind the scene's after it.
    const real = s.t
    const beat = real >= BARREL_BEAT_AT && real < BARREL_BEAT_AT + BARREL_BEAT_S ? real - BARREL_BEAT_AT : -1
    s.t = real < BARREL_BEAT_AT ? real : beat >= 0 ? BARREL_BEAT_AT - 1e-3 : real - BARREL_BEAT_S
    const { t, mp, dp } = s
    // Every shot asked for this frame goes through the director (`direct`).
    const dir = directors.get(s) ?? { want: newCam(), prev: null, shown: newCam(), from: null, k: 0 }
    directors.set(s, dir)
    const look = s.look
    s.look = (pos, at, fov = 50) => { camOf(dir.want, pos, at, fov) }
    const g = (i: number): Rig => s.extra[`g${i}`] as Rig
    const drone = s.extra.drone as Rig
    const tank = s.extra.tank as Rig
    const enforcer = s.extra.enforcer as Rig
    const hound = s.extra.hound as Rig
    const roomba = s.extra.roomba as Rig
    const lamp = s.extra.lamp as Rig
    Object.assign(mp, restPose(), { time: t })
    dp.time = t
    s.mech.root.rotation.x = 0
    /** What has to happen to the mech after the frame's pose (a blade kill's arm and pin). */
    let finish: (() => void) | null = null
    /** A round from (fx, fy, fz) to (tx, ty, tz) with the game's own flash, tracer and bite. */
    const shoot = (fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, w: WeaponId): void => {
      if (!s.cfx) return
      const d = tmpC.set(tx - fx, ty - fy, tz - fz).normalize()
      s.cfx.muzzle(fx, fy, fz, d.x, d.y, d.z, w)
      s.cfx.tracer(fx, fy, fz, tx, ty, tz, w)
      s.cfx.impact(tx, ty, tz, -d.x, -d.y, -d.z, false, w)
    }
    /** Where a rig's weapon muzzle is, as posed this frame (`models/garrison.ts`'s table). */
    const nose = (rig: Rig, m: readonly [string, number, number, number]): Vector3 => {
      rig.root.updateMatrixWorld(true)
      const b = rig.bones[m[0]]
      return b ? b.localToWorld(tmpD.set(m[1], m[2], m[3])) : tmpD.copy(rig.root.position).setY(rig.root.position.y + 1.4)
    }
    /** A round from a muzzle (the defenders' rounds leave their own barrels, #138 follow-up). */
    const shootFrom = (n: Vector3, tx: number, ty: number, tz: number, w: WeaponId): void => shoot(n.x, n.y, n.z, tx, ty, tz, w)
    /** True once every `every` seconds (on the frame that crosses it). */
    const tick = (every: number, from: number, to: number): boolean => between(t, from, to) && Math.floor(t / every) !== Math.floor((t - s.dt) / every)
    // The base hears the mini-gun (#131): from then on it is after the mech, as in the game.
    const ALARM = 24.2
    const alarmed = t >= ALARM
    s.once('alarm', ALARM + 0.3, () => sfx('shout'))

    // ── The board, the hook, the walk to the edge ──
    // The board's underside never meets the ground: it flies its line, or this
    // far over whatever is under it, whichever is higher.
    const clearOf = (p: Vector3, gap: number): Vector3 => {
      let hi = -Infinity
      for (const [ox, oz] of [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]] as const) hi = Math.max(hi, s.floor(p.x + ox, p.z + oz))
      if (hi > -Infinity) p.y = Math.max(p.y, hi + gap)
      return p
    }
    if (t < 5) {
      const p = clearOf(track([[0, -70, 5, 6], [3.5, -14, 2.5, 14], [5, 12, 0, 24]], t, tmpA), 0.45)
      dp.fold = 1
      dp.thrust = 1
      s.place(s.dog.root, tmpB.set(p.x, p.y + BOARD_HOVER, p.z), Math.PI / 2)
      s.place(s.mech.root, tmpC.set(p.x, p.y + BOARD_HOVER, p.z), Math.PI / 2)
      mp.crouch = 1
      s.look(tmpB.set(p.x - 6, p.y + 2.4, p.z - 7), tmpC.set(p.x + 3, p.y + 1.2, p.z))
      s.once('board', 0.2, () => sfx('dropIn'))
    } else {
      // Its job done, it lifts off the moment the mech is off it and flies
      // away over the sea (#136): it never sets down anywhere in the scene
      // (it comes back for the mech in the finale, #179).
      const d = clearOf(track([[5, 12, 0.45, 24], [6.2, 11, 6, 22], [8.5, 0, 20, 4], [13, -60, 42, -60]], t, tmpA), 0.45)
      dp.fold = 1
      dp.thrust = 1
      s.place(s.dog.root, d.setY(d.y + BOARD_HOVER), Math.atan2(-60 - 12, -60 - 24))
      s.dog.root.visible = t < 13
    }
    const hook = s.extra.hook as GrappleVisual
    hook.setVisible(between(t, 5.2, 7.8))
    if (between(t, 5, 7.7)) {
      const y = 10 * span(t, 5.6, 7.5)
      s.place(s.mech.root, tmpA.set(15.2, y, 24), Math.PI / 2)
      // Thrown with the whole body, then hand over hand up the line, the feet
      // walking up the cliff; over the edge on its hands.
      mp.throwHook = t < 5.6 ? Math.max(0.01, span(t, 4.95, 5.6)) : 0
      mp.reel = between(t, 5.6, 7.5) ? 1 : 0
      mp.reelPhase = y * 2.4
      mp.climb = between(t, 7.5, 7.7) ? 1 : 0
      mp.climbPhase = y
      hook.update(lineHandWorld(s.mech, tmpB) ?? tmpB.set(15.6, y + 2, 24), tmpC.set(16.1, 10.05, 24), Math.PI / 2, { flying: t < 5.5, time: t, progress: span(t, 5.2, 5.5) })
      s.look(tmpB.set(6, 4 + y * 0.5, 36), tmpC.set(15.5, y + 1.5, 24))
      s.once('hook', 5.2, () => sfx('hookThrow'))
      s.once('bite', 5.5, () => sfx('hookBite'))
    }

    // ── The decoy into the yard, the rope across above it ──
    const DECOY: V3 = [50, 4, 27.4]
    if (between(t, 7.7, 11.4)) {
      // Over the edge and away at a run across the top, to the brink over the yard.
      const r = runTo(t, 7.7, 10, [15.2, 10, 24], [34.8, 10, 24], tmpA)
      const p = tmpA
      s.place(s.mech.root, p, t < 10 ? Math.PI / 2 : turnTo(Math.PI / 2, Math.atan2(DECOY[0] - 34.8, DECOY[2] - 24), span(t, 10, 10.25)))
      mp.speed = Math.min(1, r.speed / 5)
      mp.sprint = smooth((r.speed - 5) / 3)
      mp.stride = r.dist * mechGaitRate(mp.sprint, 0)
      mp.aim = between(t, 10.9, 11.4) ? 1 : 0
      // Tracked alongside the run; it pulls up at the brink and the yard opens below.
      if (t < 9.6) s.look(tmpB.set(p.x - 6, 13.2, 17.5), tmpC.set(p.x + 4, 10.8, 25))
      else s.look(tmpB.set(30.5, 14, 19), tmpC.set(48, 5.5, 27))
      s.once('decoy', 10.2, () => sfx('decoy'))
    }
    const ball = s.extra.ball as Mesh
    ball.visible = between(t, 10.2, 10.9)
    if (ball.visible) {
      const k = span(t, 10.2, 10.9)
      s.place(ball, tmpA.set(35.4 + (DECOY[0] - 35.4) * k, 12 + (DECOY[1] - 12) * k + Math.sin(k * Math.PI) * 3.5, 24 + (DECOY[2] - 24) * k))
    }
    // The game's own hologram, waving where it landed, until the guard is down
    // (gone before the camera leaves the kill: it passes where it stood).
    if (between(t, 10.9, 15.4)) {
      const dc = s.decoys[0] ?? (s.decoys[0] = { x: DECOY[0], y: DECOY[1], z: DECOY[2], yaw: Math.PI * 1.2, t: 0, life: 6, pulse: 0 })
      dc.t = t - 10.9
    } else s.decoys.length = 0
    ;(s.extra.rope as Object3D).visible = t >= 11.2 && t < 16
    s.once('rope', 11.2, () => { sfx('hookThrow'); sfx('hookBite') })
    if (between(t, 11.4, 14.2)) {
      const keys: Key[] = [[11.4, 34.8, 10, 24], [11.8, 36, 10, 24], [14.2, 48.6, 10, 24]]
      const p = track(keys, t, tmpA)
      s.place(s.mech.root, p, Math.PI / 2)
      mp.speed = Math.min(1, pace(keys, t) / 5)
      mp.stride = t * 6
      mp.cable = t > 11.8 ? 1 : 0
      s.look(tmpB.set(p.x - 3, 12.5, 40), tmpC.set(p.x + 3, 7, 25))
    }

    // ── The yard's guard: his round, the decoy, the drop from the rope ──
    const G1_STOP: V3 = [50, 4, 25.2]
    // The game's own assassination from above (`sim/airStrike.ts`), onto him
    // as he stands looking at the decoy, a little slower for the camera.
    const plan = planAir(
      { x: 48.6, y: 10, z: 24 }, { x: G1_STOP[0], y: 4, z: G1_STOP[2] }, 4 + 1.72 - 0.12,
      (x, z) => { const h = s.floor(x, z); return h === -Infinity ? null : h },
      Math.atan2(DECOY[0] - G1_STOP[0], DECOY[2] - G1_STOP[2])
    )
    const diveT = (t - DIVE_AT) / INTRO_DIVE_SLOW
    const HIT = DIVE_AT + plan.hitAt * INTRO_DIVE_SLOW
    const LET_GO = DIVE_AT + plan.releaseAt * INTRO_DIVE_SLOW
    /** Off the body (#183): the kneel cut short, the hook fired from it (the game's rise is not played). */
    const OUT_AT = DIVE_AT + (plan.hitAt + AIR_IMPACT_S + AIR_RIDE_S + AIR_KNEEL_S * 0.6) * INTRO_DIVE_SLOW
    {
      const at = round(Math.min(t, 11), [46, 4, 18], [56, 4, 18], 7, tmpA, 1.5)
      let yaw = at.yaw
      let walking = at.walking && t < 11
      if (t >= 11) {
        const k = span(t, 11.3, 13.2)
        const fx = tmpA.x
        const fz = tmpA.z
        tmpA.set(fx + (G1_STOP[0] - fx) * smooth(k), 4, fz + (G1_STOP[2] - fz) * smooth(k))
        yaw = k < 1 ? Math.atan2(G1_STOP[0] - fx, G1_STOP[2] - fz) : Math.atan2(DECOY[0] - G1_STOP[0], DECOY[2] - G1_STOP[2])
        walking = k > 0 && k < 1
      }
      // Taken: the blade in at the blow, the knees giving under the mech, then down.
      const held = between(t, HIT, LET_GO)
      const dead = t >= LET_GO
      s.place(g(1).root, tmpA, yaw)
      poseGuard(g(1), {
        ...restGuardPose(), time: t + 1, speed: walking ? 0.45 : 0, stride: t * 4.2,
        wary: t >= 11 ? 1 : 0, lookYaw: t >= 13.2 && t < HIT ? Math.sin(t * 1.6) * 0.3 : 0,
        gripped: held ? 1 : 0, impaled: held ? 1 : 0, kneel: held ? airAt(plan, diveT).guardKneel : 0,
        deadT: dead ? t - LET_GO : 0, death: 'front'
      })
    }
    // Off the rope: one motion from the push off to the blow to kneeling on
    // the body, filmed with the game's own kill-cam (`airCam`).
    if (between(t, DIVE_AT, OUT_AT)) {
      const b = airAt(plan, diveT)
      s.place(s.mech.root, tmpA.set(b.x, b.y, b.z), plan.yaw)
      mp.air = b.air
      mp.stab = 0
      mp.crouch = b.crouch
      mp.blade = b.blade
      mp.stow = 1
      // After the frame's pose: the lean, the blade arm, the tip held in the
      // mark at the blow, and the kneeling body kept over the floor.
      finish = () => {
        placeKillBody(s.mech, b, plan.yaw, b, airMark(plan, b))
        if (b.phase !== 'crouch' && b.phase !== 'flight') {
          const floor = s.floor(s.mech.root.position.x, s.mech.root.position.z)
          if (floor > -Infinity) s.mech.root.position.y += bodySink(s.mech, floor)
        }
      }
      const cam = airCam(tmpCam, plan, diveT, b, 62)
      s.look(tmpB.set(cam.x, cam.y, cam.z), tmpC.set(cam.tx, cam.ty, cam.tz), cam.fov)
      s.once('draw', DIVE_AT + 0.05, () => sfx('bladeOut'))
      s.once('stab', HIT, () => { sfx('stab'); s.fx.sparks(plan.mark.x, plan.mark.y, plan.mark.z, '#ff5fb7', 10, 3, 0.25) })
      s.once('pull', DIVE_AT + (plan.total - 1.0) * INTRO_DIVE_SLOW, () => sfx('bladePull'))
    }

    // ── Out of the yard: the hook straight up onto the wall (#183) ──
    // No cut to a ladder: still on one knee over the body, it fires the hook
    // at the top of the wall and is pulled across the yard and up it in one
    // motion, the camera easing out of the kill-cam's frame to follow it.
    if (between(t, OUT_AT, 19.3)) {
      const HOOK_AT = OUT_AT + 0.25
      const BITE_AT = HOOK_AT + 0.25
      const TOP_AT = 18.85
      const kneel = airAt(plan, (OUT_AT - DIVE_AT) / INTRO_DIVE_SLOW)
      const from = tmpD.set(kneel.x, kneel.y, kneel.z)
      // The pull: across and up to the wall's face, the last stretch up it.
      const k = span(t, BITE_AT, TOP_AT)
      const e = k * k * (3 - 2 * k)
      const p = t < BITE_AT ? tmpA.copy(from)
        : t < TOP_AT ? tmpA.set(from.x + (59.2 - from.x) * e, from.y + (9.6 - from.y) * Math.pow(e, 0.8), from.z + (23 - from.z) * e)
          : tmpA.set(59.2 + (61 - 59.2) * span(t, TOP_AT, 19.3), 10, 23)
      const face = Math.atan2(60 - from.x, 23 - from.z)
      s.place(s.mech.root, p, t < TOP_AT ? face : Math.PI / 2)
      mp.crouch = t < HOOK_AT ? 1 - span(t, OUT_AT, HOOK_AT) : 0
      // Up off its knee into the throw, then hauled on the line hand over hand.
      mp.throwHook = between(t, OUT_AT, BITE_AT + 0.15) ? Math.max(0.01, span(t, OUT_AT, BITE_AT + 0.15)) : 0
      mp.reel = between(t, BITE_AT + 0.15, TOP_AT - 0.35) ? 1 : 0
      mp.reelPhase = t * 7
      mp.climb = between(t, TOP_AT - 0.35, TOP_AT) ? 1 : 0
      mp.climbPhase = p.y
      if (t >= TOP_AT) { mp.speed = 0.8; mp.stride = p.x * WALK_STRIDE }
      hook.setVisible(between(t, HOOK_AT, TOP_AT + 0.1))
      if (t >= HOOK_AT) {
        hook.update(lineHandWorld(s.mech, tmpB) ?? tmpB.set(p.x + 0.4, p.y + 2, p.z), tmpC.set(60.05, 10.05, 23), face,
          { flying: t < BITE_AT, time: t, progress: span(t, HOOK_AT, BITE_AT) })
      }
      s.once('hook3', HOOK_AT, () => sfx('hookThrow'))
      s.once('bite3', BITE_AT, () => sfx('hookBite'))
      // From where the kill-cam is at the cut into a shot that follows the
      // pull: back in the yard, aimed between the mech and the wall's top.
      const end = airCam(tmpCam, plan, (OUT_AT - DIVE_AT) / INTRO_DIVE_SLOW, kneel, 62)
      const c = smooth(span(t, OUT_AT, OUT_AT + 0.9))
      const ax = p.x + (60 - p.x) * 0.35
      const ay = p.y + 1.4
      s.look(
        tmpB.set(end.x + (45.5 - end.x) * c, end.y + (9.5 + (p.y - 4) * 0.4 - end.y) * c, end.z + (34.5 - end.z) * c),
        tmpC.set(end.tx + (ax - end.tx) * c, end.ty + (ay - end.ty) * c, end.tz + (24.2 - end.tz) * c),
        end.fov + (50 - end.fov) * c
      )
    }

    // ── The sentry on his tower, the rifle ──
    const SENTRY_DOWN = 21.9
    const sentryDead = t >= SENTRY_DOWN
    const sw = t < 19.8 ? round(t, [73, 14, 11], [75.2, 14, 12.8], 8, tmpA, -5.8) : { yaw: -Math.PI * 0.8, walking: false }
    if (t >= 19.8) tmpA.set(73, 14, 11)
    s.place(g(2).root, tmpA, t < 19.8 ? sw.yaw : -Math.PI * 0.8)
    poseGuard(g(2), { ...restGuardPose(), time: t, speed: sw.walking ? 0.4 : 0, stride: t * 4, lookYaw: sentryDead || sw.walking ? 0 : Math.sin(t * 0.7) * 0.6, deadT: sentryDead ? t - SENTRY_DOWN : 0, death: 'back' })
    // The rifle stays up: after the sentry it sinks low and edges to the wall's
    // lip over the yard (HIDE), where the barrel's beat finds it, crouched.
    const toDrum = Math.atan2(DRUM[0] - HIDE[0], DRUM[2] - HIDE[2])
    if (between(t, 19.3, 23)) {
      const keys: Key[] = [[19.3, 61, 10, 23], [19.8, 62.5, 10, 22.5], [22.3, 62.5, 10, 22.5], [23, HIDE[0], HIDE[1], HIDE[2]]]
      const p = track(keys, t, tmpA)
      const scoped = between(t, 19.9, 22.3)
      const toSentry = Math.atan2(73 - 62.5, 11 - 22.5)
      const yaw = t < 22.3 ? turnTo(Math.PI / 2, toSentry, span(t, 19.4, 19.95)) : turnTo(toSentry, toDrum, span(t, 22.3, 22.8))
      s.place(s.mech.root, p, yaw)
      mp.crouch = smooth(span(t, 22.35, 22.9))
      mp.speed = Math.min(1, pace(keys, t) / 4)
      mp.stride = trackDist(keys, t) * mechGaitRate(0, mp.crouch)
      mp.aim = scoped ? 1 : 0
      mp.weapon = 'sniper'
      mp.aimPitch = 0.12
      mp.recoil = between(t, SENTRY_DOWN - 0.1, SENTRY_DOWN + 0.3) ? 1 - span(t, SENTRY_DOWN - 0.1, SENTRY_DOWN + 0.3) : 0
      // Through the scope onto the tower, a beat on the fall, then out wide over
      // the yard (the barrel beat's first shot, eased into by the director).
      if (t < 22.3) s.look(tmpB.set(61.4, 12.6, 24.2), tmpC.set(73, 15.4 - 0.8 * span(t, 21.9, 22.3), 11), 50 - 32 * span(t, 20, 21.5) + 10 * smooth(span(t, 22, 22.3)))
      else s.look(tmpB.set(66.5, 15.6, 16), tmpC.set(DRUM[0] + 1.5, DRUM[1] + 1.2, DRUM[2] + 0.8), 52)
      s.once('shot', SENTRY_DOWN - 0.1, () => {
        sfx('sniper')
        const n = s.muzzle('sniper', tmpB)
        if (s.cfx) shoot(n.x, n.y, n.z, 73, 15.5, 11, 'sniper')
        else s.fx.sparks(73, 15.5, 11, '#ffe9a0', 14, 5, 0.25)
      })
    }

    // ── The drone and the mini-gun; the base hears it ──
    // Drawn by the blast: it rises over the far wall, its eye red, and is shot
    // out of the air from the same lip of wall; it falls burning into the yard.
    const DRONE_DOWN = 25.8
    const dd = t >= DRONE_DOWN
    const droneKeys: Key[] = [[23, 47, 3, 50], [23.7, 47.5, 13, 47.5], [24.4, 54.5, 15, 31]]
    const hover = (at: number, out: Vector3): Vector3 => {
      track(droneKeys, at, out)
      return out.set(out.x + Math.sin(at * 1.3) * 0.3, out.y + Math.sin(at * 1.9) * 0.15, out.z)
    }
    const dpos = hover(Math.min(t, DRONE_DOWN), tmpA)
    const dFloor = s.floor(dpos.x, dpos.z)
    const since = t - DRONE_DOWN
    if (dd) dpos.set(dpos.x - 1.4 * Math.min(1, since), Math.max(dFloor + 0.3, dpos.y - 9 * since * since), dpos.z - 0.9 * Math.min(1, since))
    const dLanded = dd && dpos.y <= dFloor + 0.31
    drone.root.visible = t >= 23
    const DRONE_AT = droneAt.copy(dpos)
    s.place(drone.root, dpos, t < 24.4 ? Math.atan2(54.5 - 47, 31 - 50) : Math.atan2(HIDE[0] - dpos.x, HIDE[2] - dpos.z))
    poseDrone(drone, { time: t, spin: t * 40, pitch: t < 24.4 ? 0.25 : 0.1, roll: dd && !dLanded ? since * 3 : 0, eyeYaw: 0, eyePitch: 0.5, alarm: t >= 23.4 ? 1 : 0, deadT: dd ? since : 0, landed: dLanded })
    if (dd && !dLanded && Math.floor(t * 20) !== Math.floor((t - s.dt) * 20)) {
      s.fx.emit({ x: dpos.x, y: dpos.y, z: dpos.z, vx: 0, vy: 0.6, vz: 0, color: '#3a3050', size: 0.5, sizeEnd: 1.6, life: 1.2, drag: 0.5 })
    }
    if (dLanded) {
      s.once('droneCrash', 0, () => {
        sfx('explode', 0.2, 0.6)
        s.fx.sparks(DRONE_AT.x, DRONE_AT.y, DRONE_AT.z, '#ffd27a', 16, 5, 0.3)
      })
    }
    // The stand on the wall's lip: the drone, the tank's shell, the rocket.
    const SHELL_AT = 27.55
    const TANK_DOWN = 30
    const NEAR_MISS: V3 = [63.4, 10.2, 25.2]
    const toTank = Math.atan2(tankAt(t) - 1.5 - HIDE[0], 43 - HIDE[2])
    if (between(t, 23, 31.2)) {
      const toDrone = Math.atan2(DRONE_AT.x - HIDE[0], DRONE_AT.z - HIDE[2])
      const yaw = t < 26.1 ? turnTo(toDrum, toDrone, span(t, 23, 23.55)) : turnTo(toDrone, toTank, span(t, 26.1, 26.8))
      s.place(s.mech.root, tmpA.set(HIDE[0], HIDE[1], HIDE[2]), yaw)
      // Up off its knee as the drone shows; ducked a moment under the shell.
      const flinch = between(t, SHELL_AT, SHELL_AT + 0.6) ? Math.sin(Math.PI * span(t, SHELL_AT, SHELL_AT + 0.6)) * 0.45 : 0
      mp.crouch = Math.max(1 - smooth(span(t, 23, 23.45)), flinch)
      const gun = t < 26.5
      mp.weapon = gun ? 'minigun' : 'rocket'
      mp.spin = t * 30
      mp.aim = gun ? (t >= 23.35 ? 1 : 0) : between(t, 27.9, 30.5) && !flinch ? 1 : 0
      const dh = Math.hypot(DRONE_AT.x - HIDE[0], DRONE_AT.z - HIDE[2])
      mp.aimPitch = gun ? Math.atan2(DRONE_AT.y - (HIDE[1] + 2.2), dh) : -0.02
      mp.recoil = between(t, 29.2, 29.6) ? 1 - span(t, 29.2, 29.6) : 0
      if (tick(0.05, 23.8, DRONE_DOWN)) {
        const n = s.muzzle('minigun', tmpB)
        shoot(n.x, n.y, n.z, DRONE_AT.x + (Math.random() - 0.5) * 0.8, DRONE_AT.y + (Math.random() - 0.5) * 0.5, DRONE_AT.z + (Math.random() - 0.5) * 0.8, 'minigun')
      }
      // Over its shoulder onto the drone; swung round with it onto the tank as
      // the base answers; pushed in on the rocket; held on the wreck.
      const fall = smooth(span(t, DRONE_DOWN, DRONE_DOWN + 0.9))
      const droneCam = camOf(camA, tmpB.set(67, 14.1, 14.4), tmpC.set(
        57.5 + (DRONE_AT.x - 57.5) * 0.6, 11.6 + (DRONE_AT.y - 12.5) * 0.6 - 1.5 * fall, 27 + (DRONE_AT.z - 27) * 0.6
      ), 42 + 6 * fall)
      const tankCam = camOf(camB, tmpB.set(58.6, 13.4, 15.8), tmpC.set(70, 10.8, 41), 48 - 8 * smooth(span(t, 28.3, 29.4)) + 6 * smooth(span(t, TANK_DOWN, TANK_DOWN + 1)))
      const cam = camLerp(camC, droneCam, tankCam, smooth(span(t, 26, 27.1)))
      s.look(tmpB.set(cam.x, cam.y, cam.z), tmpC.set(cam.tx, cam.ty, cam.tz), cam.fov)
      // The gun's own sound (#183): the motor spooling up and the roar while it fires.
      s.once('spin', 23.6, () => sfx('minigun', 0, 0.6))
      s.once('drone', DRONE_DOWN, () => { sfx('explode'); s.fx.orbBurst(DRONE_AT.x, DRONE_AT.y, DRONE_AT.z, '#ffb061', 0.7) })
      s.once('swap', 26.5, () => sfx('weapon'))
    }

    // On the alarm the defenders aim at the mech where it IS (#136): they see
    // it, and their fire follows it when it moves on, never a spot it has left.
    const tgt = s.mech.root.position
    // ── The guard on the walls: his round; on the alarm, at the mech ──
    {
      const at = round(Math.min(t, ALARM), [64, 10, 8], [77, 10, 8], 9, tmpA, 3)
      let yaw = at.yaw
      let walking = at.walking && !alarmed
      if (alarmed) {
        const k = span(t, ALARM + 0.6, ALARM + 2.4)
        const fx = tmpA.x
        tmpA.set(fx + (68 - fx) * smooth(k), 10, 8 + 6 * smooth(k))
        yaw = Math.atan2(tgt.x - tmpA.x, tgt.z - tmpA.z)
        walking = k > 0 && k < 1
      }
      s.place(g(0).root, tmpA, yaw)
      poseGuard(g(0), { ...restGuardPose(), time: t, speed: walking ? (alarmed ? 0.9 : 0.45) : 0, stride: t * (alarmed ? 6 : 4.2), aim: alarmed && t > ALARM + 2.4 ? 1 : 0, startle: between(t, ALARM, ALARM + 0.4) ? 1 : 0, recoil: tick(0.6, ALARM + 2.6, 34) ? 1 : 0, lookYaw: !alarmed && !walking ? Math.sin(t * 1.1) * 0.5 : 0 })
      if (tick(0.6, ALARM + 2.6, 34)) shootFrom(nose(g(0), MUZZLE.rifle), tgt.x + (Math.random() - 0.5) * 0.7, tgt.y + 1.25 + (Math.random() - 0.5) * 0.5, tgt.z + (Math.random() - 0.5) * 0.7, 'sniper')
    }
    // ── The Peashooter: its patrol; on the alarm, rolling in, firing ──
    {
      const at = round(Math.min(t, ALARM), [63, 10, 3.5], [75.5, 10, 3.5], 10, tmpA, 0)
      let yaw = at.yaw
      let speed = at.walking && !alarmed ? 0.6 : 0
      if (alarmed) {
        // Round the sentry's tower (x 72 … 76, z 10 … 14), never through it.
        const fx = tmpA.x
        const keys: Key[] = [[ALARM + 0.5, fx, 10, 3.5], [ALARM + 1.6, 70.4, 10, 6.5], [ALARM + 3.2, 70.4, 10, 16]]
        track(keys, t, tmpA)
        const moving = between(t, ALARM + 0.5, ALARM + 3.2)
        const ahead = track(keys, Math.min(ALARM + 3.2, t + 0.1), tmpB)
        yaw = moving && ahead.distanceTo(tmpA) > 0.01 ? Math.atan2(ahead.x - tmpA.x, ahead.z - tmpA.z) : Math.atan2(tgt.x - tmpA.x, tgt.z - tmpA.z)
        speed = moving ? 1 : 0
      }
      s.place(roomba.root, tmpA, yaw)
      poseRoomba(roomba, { time: t, alarm: alarmed ? 1 : 0, recoil: tick(0.35, ALARM + 3, 34) ? 1 : 0, aimYaw: 0, speed })
      if (tick(0.35, ALARM + 3, 34)) shootFrom(nose(roomba, MUZZLE.roomba), tgt.x + (Math.random() - 0.5) * 0.7, tgt.y + 1.25 + (Math.random() - 0.5) * 0.5, tgt.z + (Math.random() - 0.5) * 0.7, 'minigun')
    }
    // ── The Enforcer: marching the far wall; on the alarm, its twin guns ──
    {
      const at = round(Math.min(t, ALARM), [64, 10, 38], [78, 10, 38], 12, tmpA, 4)
      const walking = at.walking && !alarmed
      const turn = alarmed ? angleDelta(at.yaw, Math.atan2(tgt.x - tmpA.x, tgt.z - tmpA.z)) * smooth(span(t, ALARM + 0.4, ALARM + 1.6)) : 0
      s.place(enforcer.root, tmpA, at.yaw)
      const firing = between(t, ALARM + 1.8, 34)
      const side = Math.floor(t * 8) % 2
      poseEnforcer(enforcer, { time: t, stride: t * 2.4, speed: walking ? 0.5 : 0, power: 1, aimYaw: turn, aimPitch: -0.12, recoilL: firing && side === 0 ? 1 : 0, recoilR: firing && side === 1 ? 1 : 0, deadT: 0 })
      if (firing && tick(0.125, ALARM + 1.8, 34)) {
        const y = at.yaw + turn
        const ox = side === 0 ? Math.cos(y) * 0.9 : -Math.cos(y) * 0.9
        const oz = side === 0 ? -Math.sin(y) * 0.9 : Math.sin(y) * 0.9
        shootFrom(nose(enforcer, side === 0 ? MUZZLE.enforcerL : MUZZLE.enforcerR), tgt.x + (Math.random() - 0.5) * 0.7, tgt.y + 1.25 + (Math.random() - 0.5) * 0.5, tgt.z + (Math.random() - 0.5) * 0.7, 'minigun')
      }
      s.once('enforcer', ALARM + 1.8, () => sfx('minigun'))
    }
    // ── The searchlight on the walls' corner, sweeping the yard ──
    {
      s.place(lamp.root, tmpA.set(79, 10, 4), Math.PI * 1.25 + (alarmed ? angleDelta(Math.PI * 1.25, Math.atan2(tgt.x - 79, tgt.z - 4)) : Math.sin(t * 0.5) * 0.6))
      poseSearchlight(lamp, { time: t, yaw: 0, pitch: 0.35, alarm: alarmed ? 1 : 0 })
    }
    // ── The Goliath: creeping on its round, turret sweeping; on the alarm, its cannon ──
    const roll = smooth(span(t, 18, 25))
    const tankX = tankAt(t)
    s.place(tank.root, tmpA.set(tankX, 10, 44), -Math.PI / 2)
    const toMech = angleDelta(-Math.PI / 2, Math.atan2(tgt.x - tankX, tgt.z - 44))
    const turret = t < ALARM ? Math.sin(t * 0.45) * 0.5 : toMech * smooth(span(t, ALARM, ALARM + 2.2))
    const cannon = between(t, 27.2, 27.7) ? 1 - span(t, 27.2, 27.7) : 0
    poseGoliath(tank, { time: t, turretYaw: turret, barrelPitch: 0.05, recoil: cannon, rumble: t >= TANK_DOWN ? 0 : roll > 0 && roll < 1 ? 1 : 0.5, dead: t >= TANK_DOWN ? Math.min(1, (t - TANK_DOWN) * 2) : 0 })
    s.once('cannon', 27.2, () => {
      sfx('rocket')
      if (s.cfx) {
        // The shell misses, just: it bursts on the wall top a stride short of the mech.
        s.cfx.muzzle(tankX - 2.6, 12.4, 41.8, -0.2, 0, -1, 'rocket')
        s.cfx.tracer(tankX - 2.6, 12.4, 41.8, NEAR_MISS[0], NEAR_MISS[1], NEAR_MISS[2], 'rocket')
      }
    })
    s.once('shell', SHELL_AT, () => {
      sfx('explode')
      if (s.cfx) s.cfx.explosion(NEAR_MISS[0], NEAR_MISS[1], NEAR_MISS[2], 10)
      s.fx.sparks(NEAR_MISS[0], NEAR_MISS[1] + 0.3, NEAR_MISS[2], '#ffd27a', 18, 6, 0.3)
    })
    // ── The Warden, beside his tank, pointing his men at the mech ──
    {
      s.place(g(3).root, tmpA.set(77.5, 10, 41), alarmed ? Math.atan2(tgt.x - 77.5, tgt.z - 41) : -Math.PI / 2)
      poseGuard(g(3), { ...restGuardPose(), time: t + 2, aim: alarmed ? 1 : 0, lookYaw: alarmed ? 0 : Math.sin(t * 0.6) * 0.5 })
    }
    // ── The hound running the yard, stopping to sniff ──
    {
      const at = round(t, [46, 4, 33], [58, 4, 33], 5, tmpA, 0)
      s.place(hound.root, tmpA, at.yaw)
      // The paws keep pace with the ground (a hound's rig is drawn at HOUND_SCALE).
      poseRobodog(hound, { time: t, stride: roundDist(t, [46, 4, 33], [58, 4, 33], 5) * STRIDE_PER_UNIT / HOUND_SCALE, run: at.walking ? 1 : 0, fold: 0, thrust: 0 })
    }

    // ── The rocket into the Goliath ──
    const rocket = s.extra.rocket as Mesh
    rocket.visible = !s.cfx && between(t, 29.2, 30)
    if (rocket.visible) s.place(rocket, tmpA.lerpVectors(tmpB.set(64.5, 12, 29), tmpC.set(tankX - 1.5, 11.5, 43), span(t, 29.2, 30)))
    if (s.cfx) {
      const from = s.extra.rocketFrom as Vector3 | undefined
      if (between(t, 29.2, TANK_DOWN) && from) {
        const r = s.rockets[0] ?? (s.rockets[0] = { x: from.x, y: from.y, z: from.z, px: from.x, py: from.y, pz: from.z, dx: 0, dy: 0, dz: 1, t: 0 })
        const tx = tankX - 1.5
        r.px = r.x; r.py = r.y; r.pz = r.z
        const k = span(t, 29.2, TANK_DOWN)
        r.x = from.x + (tx - from.x) * k
        r.y = from.y + (11.5 - from.y) * k
        r.z = from.z + (43 - from.z) * k
        const len = Math.hypot(tx - from.x, 11.5 - from.y, 43 - from.z) || 1
        r.dx = (tx - from.x) / len; r.dy = (11.5 - from.y) / len; r.dz = (43 - from.z) / len
      } else s.rockets.length = 0
    }
    // The rocket goes from the wall's lip (the stand above); then on along the
    // wall to the perch at a run, the burning tank behind it.
    if (between(t, 28, 34.3)) {
      if (t >= 31.2) {
        const r = runTo(t, 31.2, 34.3, HIDE, [75.2, 10, 23.4], tmpA)
        const p = tmpA
        const head = Math.atan2(75.2 - HIDE[0], 23.4 - HIDE[2])
        s.place(s.mech.root, p, t < 34.1 ? turnTo(toTank, head, span(t, 31.2, 31.6)) : turnTo(head, Math.PI / 2, span(t, 34.1, 34.3)))
        mp.speed = Math.min(1, r.speed / 5)
        mp.sprint = smooth((r.speed - 5) / 3)
        mp.weapon = 'rocket'
        mp.stride = r.dist * mechGaitRate(mp.sprint, 0)
        // Beside it as it runs, the wreck burning over its shoulder.
        s.look(tmpB.set(p.x - 4.5, 13.4, p.z + 7.5), tmpC.set(p.x + 3, 11.2, p.z - 0.5))
      }
      s.once('rocket', 29.2, () => {
        sfx('rocket')
        const n = s.muzzle('rocket', new Vector3())
        s.extra.rocketFrom = n
        if (s.cfx) {
          const d = tmpC.set(tankX - 1.5 - n.x, 11.5 - n.y, 43 - n.z).normalize()
          s.cfx.muzzle(n.x, n.y, n.z, d.x, d.y, d.z, 'rocket')
        }
      })
      s.once('boom', TANK_DOWN, () => {
        sfx('explode')
        if (s.cfx) s.cfx.explosion(tankX - 1.5, 11.5, 43, 10)
        else { s.fx.orbBurst(tankX - 1.5, 11.5, 43, '#ff9a3d', 1.4); s.fx.sparks(tankX - 1.5, 11.5, 43, '#ffd27a', 30, 8, 0.3) }
      })
    }
    // The wreck burns on for the rest of the scene.
    if (between(t, TANK_DOWN, STILL_AT) && Math.floor(t * 8) !== Math.floor((t - s.dt) * 8)) {
      s.fx.emit({ x: tankX, y: 13, z: 44, vx: 0.3, vy: 1.8, vz: 0, color: '#3a3050', size: 1.4, sizeEnd: 3, life: 2.4, drag: 0.4 })
    }

    // ── Up the perch: the hook again (it used to appear up there) ──
    if (between(t, 34.3, 35.5)) {
      const y = 10 + 4 * span(t, 34.6, 35.25)
      const x = t < 35.25 ? 75.2 : 75.2 + (PERCH[0] - 75.2) * span(t, 35.25, 35.5)
      s.place(s.mech.root, tmpA.set(x, t < 35.25 ? y : 14, PERCH[2]), Math.PI / 2)
      mp.throwHook = t < 34.65 ? Math.max(0.01, span(t, 34.15, 34.65)) : 0
      mp.reel = between(t, 34.65, 35.1) ? 1 : 0
      mp.reelPhase = y * 2.4
      mp.climb = between(t, 35.1, 35.25) ? 1 : 0
      mp.climbPhase = y
      if (t >= 35.25) { mp.speed = 0.7; mp.stride = x * WALK_STRIDE }
      hook.setVisible(t < 35.3)
      hook.update(lineHandWorld(s.mech, tmpB) ?? tmpB.set(x + 0.4, y + 2, PERCH[2]), tmpC.set(76.1, 14.05, PERCH[2]), Math.PI / 2, { flying: t < 34.6, time: t, progress: span(t, 34.3, 34.6) })
      s.look(tmpB.set(68.5, 12.5 + (y - 10) * 0.5, 31), tmpC.set(76, y + 1.2, PERCH[2]))
      s.once('hook2', 34.3, () => sfx('hookThrow'))
      s.once('bite2', 34.6, () => sfx('hookBite'))
    }

    // ── The finale (#179): the Airship, the cover, away on the dog ──
    const ship = s.extra.ship as Rig
    ship.root.visible = between(t, SHIP_UP, STILL_AT)
    /** Where the board is at `at` on its way in, its hover by the perch, and its way out. */
    const boardAt = (at: number, out: Vector3): Vector3 => at < LEAP
      ? clearOf(track([[DOG_IN, 30, 34, 70], [LEAP - 0.2, PICKUP[0], PICKUP[1], PICKUP[2]]], at, out), 0.45)
      : clearOf(track([[AWAY, PICKUP[0], PICKUP[1], PICKUP[2]], [44.6, 62, 20, 9], [STILL_AT, 4, 44, -56]], at, out), 0.45)
    if (ship.root.visible) {
      const sp = track([[SHIP_UP, 122, -10, 30], [38.4, 107, 21, 25], [AWAY, 104, 23, 24], [STILL_AT, 99, 26, 17]], t, tmpA)
      ship.root.position.copy(sp)
      // Facing the perch (it faces +z), and turning after the board once it has gone.
      ship.root.rotation.set(0.05 * Math.sin(t * 0.7), -Math.PI / 2 - 0.45 * span(t, AWAY, STILL_AT), 0.03 * Math.sin(t * 0.5))
      for (let i = 0; i < 4; i++) ship.bones[`fan${i}`]!.rotation.z = t * 20 + i
      // The turrets on the perch, then a beat behind the board: every round there misses.
      const aim = t < AWAY ? tmpB.set(PERCH[0] + 1.5, 15.2, PERCH[2]) : boardAt(Math.max(AWAY, t - 0.55), tmpB)
      aimShip(ship, aim.x, aim.y, aim.z)
      s.once('shipUp', SHIP_UP + 0.2, () => sfx('wake'))
      if (tick(0.11, FIRE, STILL_AT - 0.5)) {
        const n = Math.floor(t / 0.11)
        const turret = n % 2 === 0 ? 'turretF' : 'turretB'
        const from = shipSocket(ship, turret, n, tmpC)
        // A round's spread about the aim point, the same every time it plays.
        const jx = Math.sin(n * 12.9898) * 0.9
        const jy = Math.sin(n * 78.233) * 0.7
        const jz = Math.sin(n * 39.425) * 1.6
        const tx = aim.x + jx
        const ty = Math.max(aim.y + jy, t < AWAY ? 14.1 : -Infinity)
        const tz = aim.z + jz
        shoot(from.x, from.y, from.z, tx, ty, tz, 'minigun')
        if (n % 2 === 0) sfx('enemyShot', 0.3, 0.55)
        if (t < AWAY && n % 3 === 0) s.fx.sparks(tx, ty, tz, '#ffd27a', 6, 4, 0.2)
      }
      // The pods: four rockets onto the perch, one after another.
      if (s.cfx) {
        for (const [i, r] of SHIP_ROCKETS.entries()) {
          if (!between(t, r.at, r.at + ROCKET_FLIGHT)) continue
          const from = shipSocket(ship, r.pod, i, tmpC)
          const k = span(t, r.at, r.at + ROCKET_FLIGHT)
          const x = from.x + (r.to[0] - from.x) * k
          const y = from.y + (r.to[1] - from.y) * k
          const z = from.z + (r.to[2] - from.z) * k
          const len = Math.hypot(r.to[0] - from.x, r.to[1] - from.y, r.to[2] - from.z) || 1
          s.rockets.push({ x, y, z, px: x, py: y, pz: z, dx: (r.to[0] - from.x) / len, dy: (r.to[1] - from.y) / len, dz: (r.to[2] - from.z) / len, t: k * ROCKET_FLIGHT })
        }
      }
      for (const [i, r] of SHIP_ROCKETS.entries()) {
        s.once(`pod${i}`, r.at, () => sfx('rocket', 0.3, 0.8))
        s.once(`podBoom${i}`, r.at + ROCKET_FLIGHT, () => {
          sfx('explode')
          if (s.cfx) s.cfx.explosion(r.to[0], r.to[1], r.to[2], 14)
          else s.fx.orbBurst(r.to[0], r.to[1], r.to[2], '#ff9a3d', 1.2)
        })
      }
    }
    /** A blast just went off on the perch: the camera takes the jolt. */
    const jolt = SHIP_ROCKETS.reduce((j, r) => {
      const since = t - (r.at + ROCKET_FLIGHT)
      return since >= 0 && since < 0.35 ? Math.max(j, 1 - since / 0.35) : j
    }, 0)
    const shake = (v: Vector3, k: number): Vector3 => v.set(v.x + Math.sin(t * 91) * 0.12 * k, v.y + Math.sin(t * 73) * 0.1 * k, v.z + Math.sin(t * 67) * 0.12 * k)
    if (between(t, 35.5, LEAP)) {
      // On the perch, then down behind its parapet the moment the Airship is up.
      s.place(s.mech.root, tmpA.set(PERCH[0], PERCH[1], PERCH[2]), Math.PI / 2)
      mp.crouch = smooth(span(t, DUCK, DUCK + 0.25))
      mp.aimPitch = t < DUCK ? 0.25 * span(t, SHIP_UP, DUCK) : 0
      if (t < DUCK) s.look(track([[35.5, 70, 16.5, 21], [DUCK, 71.5, 16.2, 19.5]], t, tmpB), tmpC.set(100, 17 + 3 * span(t, SHIP_UP, DUCK), 25))
      else if (t < 40.3) s.look(shake(tmpB.set(73.9, 16.5, 20.2), jolt), tmpC.set(86, 15.6, 24.8), 50)
      else s.look(shake(tmpB.set(64, 23, 2), jolt * 0.5), tmpC.set(88, 15, 25))
    }
    // The dog: back as the board, low over the perch, and away with the mech on it.
    s.dog.root.visible = t < 13 || between(t, DOG_IN, STILL_AT)
    if (between(t, DOG_IN, STILL_AT)) {
      const p = boardAt(t, tmpA)
      const q = boardAt(Math.min(STILL_AT, t + 0.1), tmpC)
      const yaw = t < LEAP - 0.25 ? Math.atan2(q.x - p.x, q.z - p.z) : between(t, LEAP - 0.25, AWAY) ? Math.atan2(62 - PICKUP[0], 9 - PICKUP[2]) : Math.atan2(q.x - p.x, q.z - p.z)
      dp.fold = 1
      dp.thrust = 1
      s.place(s.dog.root, tmpB.set(p.x, p.y + BOARD_HOVER, p.z), yaw)
      s.once('dogIn', DOG_IN + 0.3, () => sfx('dropIn'))
      if (between(t, LEAP, AWAY)) {
        // The leap from behind the parapet onto it.
        const k = span(t, LEAP, AWAY)
        const e = smooth(k)
        s.place(s.mech.root, tmpC.set(PERCH[0] + (p.x - PERCH[0]) * e, PERCH[1] + (p.y + BOARD_HOVER - PERCH[1]) * e + 1.6 * Math.sin(Math.PI * k), PERCH[2]), yaw)
        mp.air = 1 - Math.abs(2 * k - 1)
        mp.crouch = 1 - mp.air
        s.once('leap', LEAP, () => sfx('boardJump'))
        s.look(tmpB.set(66, 18, 31), tmpD.set(76, 15, 23.4))
      } else if (t >= AWAY) {
        s.place(s.mech.root, tmpC.set(p.x, p.y + BOARD_HOVER, p.z), yaw)
        mp.crouch = 1
        // Alongside it as it goes, then from behind the Airship as it gets away.
        if (t < FAR_CUT) s.look(tmpB.set(p.x + 6, p.y + 2.2, p.z + 5), tmpD.set(p.x, p.y + 1, p.z))
        else s.look(tmpB.set(138, 38, 42), tmpD.copy(p))
      } else s.look(shake(tmpB.set(64, 23, 2), jolt * 0.5), tmpD.set(84, 15, 25))
    }
    // The minigun's motor and roar (#183): spooled from 23.4, firing to the drone's fall, winding down after.
    if (s.cfx) {
      const spool = t < 23.4 || t > DRONE_DOWN + 1.2 ? 0 : t < DRONE_DOWN ? smooth(span(t, 23.4, 23.8)) : 1 - span(t, DRONE_DOWN, DRONE_DOWN + 1.2)
      emit('cineGun', { spool, firing: between(t, 23.8, DRONE_DOWN) })
    }
    s.t = real
    squadFrame(s, real, beat, shoot)
    // The shot, as the director films it: the blasts on the scene's own clock shake it.
    s.look = look
    const blasts: ReadonlyArray<readonly [number, number]> = [
      [BARREL_BEAT_AT + BEAT_SHOT + 0.08, 1], [DRONE_DOWN + BARREL_BEAT_S, 0.35], [SHELL_AT + BARREL_BEAT_S, 0.8], [TANK_DOWN + BARREL_BEAT_S, 1]
    ]
    const blast = blasts.reduce((j, [at, k]) => {
      const since = real - at
      return since >= 0 && since < 0.5 ? Math.max(j, k * (1 - since / 0.5)) : j
    }, 0)
    const c = direct(dir, s.dt, real, t >= FAR_CUT && t - s.dt < FAR_CUT, blast, shotCam)
    look(tmpB.set(c.x, c.y, c.z), tmpC.set(c.tx, c.ty, c.tz), c.fov)
    poseMech(s.mech, mp)
    finish?.()
    poseRobodog(s.dog, dp)
  }
}

// ─── Salvage: the haul after a first clear of threat I or II (10 s, #103) ───

/** The salvage scene's two piles (metres): by the walker, by the tank. */
const SALVAGE_PILES: ReadonlyArray<{ x: number; z: number }> = [{ x: 16.9, z: 21.1 }, { x: 21.4, z: 29.2 }]
/** Bars and plates thrown onto the board, half from each pile. */
const SALVAGE_BITS = 12

const SALVAGE: Script = {
  theme: 'dusk',
  music: 'hero',
  stage: (b) => {
    b.ground(0, 0, 23, 23, 0)
    b.deck(6, 6, 17, 17)
    b.heap(5, 16, 0.4).heap(18, 7, 1.2).heap(17, 18, 2)
  },
  cast: (s, root) => {
    const e1 = buildEnforcer(false)
    const e2 = buildEnforcer(true)
    const tank = buildGoliath()
    s.extra.e1 = e1
    s.extra.e2 = e2
    s.extra.tank = tank
    root.add(e1.root, e2.root, tank.root)
    // The game's own salvage piles (jam build: the scene shows the salvaging):
    // one by the walker, one by the tank, stripped as the mech works them.
    const piles = new SalvageView(SALVAGE_PILES.map((p, id) => ({ ...p, id, y: 0, amount: 30, big: false, taken: false })))
    s.extra.piles = piles.group
    s.extra.pileView = piles as unknown as Object3D
    root.add(piles.group)
    // What comes off them: alloy bars and plates, arcing onto the dog's board.
    for (let i = 0; i < SALVAGE_BITS; i++) {
      const glow = i % 3 !== 2
      const c = new Mesh(new BoxGeometry(glow ? 0.38 : 0.5, glow ? 0.13 : 0.08, glow ? 0.18 : 0.42), new MeshBasicMaterial({ color: glow ? '#ffb14a' : '#b8b0e0', toneMapped: !glow }))
      c.visible = false
      s.extra[`c${i}`] = c
      root.add(c)
    }
  },
  frame: (s) => {
    const { t, mp, dp } = s
    Object.assign(mp, restPose(), { time: t })
    s.place((s.extra.e1 as Rig).root, tmpA.set(16, 0, 20), 0.6)
    s.place((s.extra.e2 as Rig).root, tmpA.set(27, 0, 15), -1.2)
    poseEnforcer(s.extra.e1 as Rig, { time: t, stride: 0, speed: 0, power: 0, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 5 })
    poseEnforcer(s.extra.e2 as Rig, { time: t, stride: 0, speed: 0, power: 0, aimYaw: 0, aimPitch: 0, recoilL: 0, recoilR: 0, deadT: 5 })
    s.place((s.extra.tank as Rig).root, tmpA.set(22, 0, 31), 2.4)
    poseGoliath(s.extra.tank as Rig, { time: t, turretYaw: 0.6, barrelPitch: 0, recoil: 0, rumble: 0, dead: 1 })
    // The mech strips the walker's pile, then the tank's: down on a knee,
    // both hands in the scrap, the pile shrinking, the bars flying out.
    const p = track([[0, 18, 0, 22], [2.6, 18, 0, 22], [4, 21, 0, 27.5], [10, 21, 0, 27.5]], t, tmpA)
    const target = t < 3 ? SALVAGE_PILES[0]! : SALVAGE_PILES[1]!
    s.place(s.mech.root, p, Math.atan2(target.x - p.x, target.z - p.z))
    mp.loot = between(t, 0.4, 2.6) || between(t, 4.2, 6.4) ? 1 : 0
    mp.crouch = mp.loot
    mp.speed = between(t, 2.6, 4) ? 0.6 : 0
    mp.stride = t * 6
    const view = s.extra.pileView as unknown as SalvageView
    view.strip(0, span(t, 0.4, 2.6))
    view.strip(1, span(t, 4.2, 6.4))
    view.update(s.dt, t)
    if (Math.floor(t * 6) !== Math.floor((t - s.dt) * 6) && mp.loot > 0) {
      s.fx.sparks(target.x, 0.7, target.z, '#ffb14a', 7, 3.4, 0.22)
      s.fx.sparks(target.x, 0.5, target.z, '#5fe9ff', 3, 2.4, 0.16)
    }
    s.once('loot1', 0.5, () => sfx('loot'))
    s.once('loot2', 4.3, () => sfx('loot'))
    // The dog's board hovers by, takes the haul, and lifts off home.
    const d = track([[0, 13, 1.2, 26], [7.8, 13, 1.2, 26], [10, 4, 22, 60]], t, tmpB)
    dp.time = t
    dp.fold = 1
    dp.thrust = t > 7.8 ? 1 : 0.4
    s.place(s.dog.root, d, Math.PI)
    // Each bar off the pile being worked, over in an arc onto the board.
    for (let i = 0; i < SALVAGE_BITS; i++) {
      const c = s.extra[`c${i}`] as Mesh
      const first = i < SALVAGE_BITS / 2
      const from = SALVAGE_PILES[first ? 0 : 1]!
      const a = (first ? 0.6 : 4.4) + (i % (SALVAGE_BITS / 2)) * 0.36
      c.visible = t >= a && t < a + 0.75
      if (!c.visible) continue
      const k = span(t, a, a + 0.75)
      c.position.set(from.x + (13 - from.x) * k, 0.6 + Math.sin(k * Math.PI) * 3 + 0.6 * k, from.z + (26 - from.z) * k)
      c.rotation.set(k * 7, k * 5, 0)
      if (k > 0.97 && !s.fired.has(`bit${i}`)) { s.fired.add(`bit${i}`); sfx('shard') }
    }
    s.once('lift', 7.9, () => sfx('dropIn'))
    // Close on the pile being worked, square to the line from its wreck to the
    // mech (so neither wreck stands in the way), turning a little; wide once
    // the board lifts off with the haul.
    const focus = t < 3.3 ? SALVAGE_PILES[0]! : SALVAGE_PILES[1]!
    const wide = smooth(span(t, 7.2, 8.6))
    const ang = (t < 3.3 ? 2.36 + (t - 1.5) * 0.08 : -2.5 + (t - 5.3) * 0.08)
    const r = 6.2 + wide * 10
    tmpB.set(focus.x + (16 - focus.x) * wide, 0.8 + wide * 2, focus.z + (26 - focus.z) * wide)
    s.look(tmpA.set(tmpB.x + Math.sin(ang) * r, 3 + wide * 5, tmpB.z + Math.cos(ang) * r), tmpB, 46)
    poseMech(s.mech, mp)
    poseRobodog(s.dog, dp)
  }
}

// ─── A fortress falls: the Bastion (the Warden flees) and the Foundry ────────

const FALL_BASTION: Script = {
  theme: 'dusk',
  music: 'tension',
  stage: (b) => { b.fill(4, 4, 23, 19, 8) },
  cast: (s, root) => {
    const warden = buildGuard(true, false)
    const ship = buildDropship()
    s.extra.warden = warden
    s.extra.ship = ship
    root.add(warden.root, ship.group)
  },
  frame: (s) => {
    const { t, mp, dp } = s
    Object.assign(mp, restPose(), { time: t })
    const warden = s.extra.warden as Rig
    const ship = s.extra.ship as Dropship
    // The Warden runs for the airship moored off the roof's edge, and is gone.
    const w = track([[0, 22, 8, 22], [4.6, 44, 8, 22]], t, tmpA)
    warden.root.visible = t < 5
    s.place(warden.root, w, Math.PI / 2)
    poseGuard(warden, { ...restGuardPose(), time: t, speed: 1, stride: t * 12, proud: true })
    const sh = track([[0, 51, 7.4, 22], [5.6, 51, 7.4, 22], [8, 60, 14, 18], [16, 320, 70, -120]], t, tmpB)
    s.place(ship.group, sh, Math.PI / 2 + (t > 6 ? -0.5 * span(t, 6, 9) : 0))
    s.once('lift', 5.6, () => sfx('dropIn'))
    // The mech and the dog watch from the roof.
    s.place(s.mech.root, tmpC.set(16, 8, 26), Math.PI / 2 - 0.3 * span(t, 6, 14))
    dp.time = t
    dp.fold = 0
    s.place(s.dog.root, tmpC.set(14.6, 8, 27.4), Math.PI / 2)
    // Far off: the Foundry's furnace smoke on the horizon.
    if (Math.floor(t * 3) !== Math.floor((t - s.dt) * 3)) {
      s.fx.emit({ x: 420 + Math.random() * 10, y: 40, z: -260, vx: 1, vy: 6, vz: 0, color: '#4a3a5e', size: 30, sizeEnd: 70, life: 6, drag: 0.1 })
    }
    if (t < 7) s.look(tmpA.set(30, 14, 44), tmpB.set(40, 8.5, 22))
    else s.look(track([[7, 8, 11.5, 31], [16, 6, 10.8, 32]], t, tmpA), tmpB.set(sh.x, sh.y + 1, sh.z), 52 - 14 * span(t, 9, 16))
    poseMech(s.mech, mp)
    poseRobodog(s.dog, dp)
  }
}

const FALL_FOUNDRY: Script = {
  theme: 'foundry',
  music: 'tension',
  stage: (b) => {
    b.ground(0, 0, 31, 23, 0)
    b.fill(0, 0, 31, 1, 12).fill(0, 0, 1, 23, 12)
    b.deck(4, 6, 27, 18)
  },
  cast: (s, root) => {
    const hull = buildGoliath()
    const ship = buildDropship()
    ship.group.scale.setScalar(1.9)
    s.extra.hull = hull
    s.extra.ship = ship
    root.add(hull.root, ship.group)
    const mat = makeFlameMaterial({ core: '#fff1b0', mid: '#ff8a3d', edge: '#b2203a' })
    for (let i = 0; i < 3; i++) {
      const f = new Mesh(new CylinderGeometry(0.4, 1.6, 6, 14, 1, true), i === 0 ? mat : mat.clone())
      f.position.set(12 + i * 12, 3, 6)
      s.extra[`f${i}`] = f
      root.add(f)
    }
    const cable = new Mesh(new CylinderGeometry(0.06, 0.06, 1, 6), new MeshBasicMaterial({ color: '#ffd166', toneMapped: false }))
    s.extra.cable = cable
    root.add(cable)
  },
  frame: (s) => {
    const { t, mp, dp } = s
    Object.assign(mp, restPose(), { time: t })
    // The furnaces go cold, one by one.
    for (let i = 0; i < 3; i++) {
      const f = s.extra[`f${i}`] as Mesh
      const power = 1 - span(t, 1.5 + i * 2, 3 + i * 2)
      setFlame(f.material as never, power, t)
      f.visible = power > 0.02
      if (Math.abs(t - (3 + i * 2)) < s.dt) s.fx.sparks(f.position.x, 1, f.position.z, '#ff9a3d', 18, 4, 0.3)
    }
    // The last hull, half cast, is craned onto the cargo ship, which leaves.
    const hull = s.extra.hull as Rig
    const sh = track([[0, 48, 6, 26], [12, 48, 6, 26], [16, 160, 2, 60]], t, tmpB)
    const h = track([[0, 22, 0, 20], [6, 22, 0, 20], [9, 22, 9, 20], [11, 48, 9, 26], [12, 48, 7.6, 26], [16, sh.x, sh.y + 1.6, sh.z]], t, tmpA)
    s.place(hull.root, h, -Math.PI / 2)
    poseGoliath(hull, { time: t, turretYaw: 0, barrelPitch: 0, recoil: 0, rumble: 0, dead: 0.35 })
    const cable = s.extra.cable as Mesh
    cable.visible = between(t, 6, 12)
    s.line(cable, tmpC.set(h.x, 20, h.z), new Vector3(h.x, h.y + 3, h.z))
    s.place((s.extra.ship as Dropship).group, sh, -Math.PI / 2)
    s.once('crane', 6, () => sfx('hookThrow'))
    s.place(s.mech.root, tmpC.set(10, 0, 30), Math.PI * 0.6)
    dp.time = t
    s.place(s.dog.root, tmpC.set(8.6, 0, 31), Math.PI * 0.6)
    if (t < 7) s.look(tmpA.set(24, 7, 40), tmpB.set(24, 3, 8))
    else s.look(tmpA.set(28, 11, 44), tmpB.set(h.x, h.y + 2, h.z))
    poseMech(s.mech, mp)
    poseRobodog(s.dog, dp)
  }
}

// ─── Outro: the flagship goes down, the mech flies home (about 40 s) ────────

const OUTRO: Script = {
  theme: 'harbour',
  music: 'finale',
  stage: (b) => {
    b.ground(0, 8, 29, 23, 0)
    b.deck(0, 8, 29, 9, true)
  },
  cast: (s, root) => {
    const ship = buildDropship()
    ship.group.scale.setScalar(3.2)
    const warden = buildGuard(true, true)
    const pad = new Mesh(new CylinderGeometry(4.2, 4.6, 0.5, 6), new MeshBasicMaterial({ color: '#7a6fc4' }))
    const rim = new Mesh(new CylinderGeometry(4.3, 4.3, 0.1, 6, 1, true), new MeshBasicMaterial({ color: '#5fe9ff', toneMapped: false }))
    pad.add(rim)
    s.extra.ship = ship
    s.extra.warden = warden
    s.extra.pad = pad
    s.extra.rim = rim
    root.add(ship.group, warden.root, pad)
  },
  frame: (s) => {
    const { t, mp, dp } = s
    Object.assign(mp, restPose(), { time: t })
    const ship = s.extra.ship as Dropship
    const warden = s.extra.warden as Rig
    // The flagship breaks loose and sinks into the cloud, its Warden aboard.
    const sp = track([[0, 32, 4, 6], [5, 32, 3.5, 6], [14, 38, -40, -6]], t, tmpA)
    s.place(ship.group, sp, Math.PI / 2)
    ship.group.rotation.z = 0.5 * span(t, 5, 14)
    warden.root.visible = t < 13
    s.place(warden.root, tmpB.set(sp.x, sp.y + 6.6, sp.z), Math.PI)
    poseGuard(warden, { ...restGuardPose(), time: t, startle: t > 3 ? 1 - span(t, 3, 4) : 0, proud: true })
    s.once('creak', 3, () => sfx('explode'))
    // Scrap rains on the quay.
    if (between(t, 2, 14) && Math.floor(t * 10) !== Math.floor((t - s.dt) * 10)) {
      s.fx.emit({ x: 10 + Math.random() * 40, y: 22, z: 20 + Math.random() * 20, vx: 0, vy: -6, vz: 0, color: '#c9c1ee', size: 0.4, sizeEnd: 0.3, life: 3, drag: 0, gravity: 4 } as never)
    }
    // The dog unfolds its board; the mech steps on; home.
    const flight = track([[0, 22, 0, 34], [20, 22, 0, 34], [24, 10, 18, 10], [30, -40, 30, -70], [34, -96, 12.6, -100], [40, -96, 12.6, -100]], t, tmpC)
    const onBoard = t >= 20
    dp.time = t
    dp.fold = t < 14 ? 0 : span(t, 14, 16)
    dp.thrust = onBoard ? 1 : dp.fold * 0.5
    s.place(s.dog.root, onBoard ? tmpB.set(flight.x, flight.y + BOARD_HOVER, flight.z) : tmpB.set(20.6, t < 16 ? 0 : BOARD_HOVER, 34), onBoard ? Math.PI * 1.2 : Math.PI / 2)
    s.place(s.mech.root, onBoard ? tmpA.set(flight.x, flight.y + BOARD_HOVER, flight.z) : tmpA.set(22, 0, 34), onBoard ? Math.PI * 1.2 : -Math.PI / 2)
    mp.crouch = onBoard && t < 34 ? 1 : 0
    mp.air = between(t, 19.6, 20.2) ? 1 : 0
    // The Command Base, lit as they land.
    const pad = s.extra.pad as Mesh
    pad.position.set(-96, 12, -100)
    ;(s.extra.rim as Mesh).visible = t > 34.6
    s.once('home', 34.6, () => sfx('medal'))
    if (t < 14) s.look(tmpB.set(12, 6, 44), tmpA.set(sp.x, sp.y + 4, sp.z))
    else if (t < 20) s.look(tmpB.set(14, 3, 42), tmpA.set(21, 1, 34))
    else if (t < 36) s.look(tmpB.set(flight.x + 8, flight.y + 4, flight.z + 9), tmpA.set(flight.x, flight.y + 1, flight.z))
    else s.look(tmpB.set(-84, 18 + (t - 36) * 2, -84), tmpA.set(-130, 26, -150))
    poseMech(s.mech, mp)
    poseRobodog(s.dog, dp)
  }
}

const SCRIPTS: Readonly<Record<CinemaId, Script>> = {
  intro: INTRO, salvage: SALVAGE, fallBastion: FALL_BASTION, fallFoundry: FALL_FOUNDRY, outro: OUTRO
}

/** A story scene as a mode: build it, push it over the scene that is up, await `done`. */
export class Cinema implements GameMode {
  readonly scene = newScene()
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 1400)
  /** Resolves when the scene ends, or is skipped. */
  readonly done: Promise<void>
  private finish!: () => void
  private over = false
  private stage!: Stage
  private cfx: CombatFx | null = null
  /** The stage's cells (for the tests: nothing flies through them). */
  grid!: Fortress['grid']
  /** Where the robo dog is (for the tests). */
  get dogAt(): Vector3 { return this.stage.dog.root.position }
  private script: Script
  private sky!: Sky
  private mesh!: FortressMesh
  private root = new Group()
  readonly length: number
  /**
   * The picture the scene ends on (#179): drawn over the whole screen for the
   * scene's last INTRO_STILL_S, faded up from black and pushed in a little.
   * Null for a scene without one (and in the tests: they have no canvas).
   */
  private still: { scene: Scene; camera: OrthographicCamera; quad: Mesh; material: MeshBasicMaterial; aspect: number } | null = null
  /** When the still takes over (s into the scene), or never. */
  get stillFrom(): number { return this.script.still ? this.length - INTRO_STILL_S : Infinity }

  private constructor(readonly id: CinemaId) {
    this.script = SCRIPTS[id]
    this.length = CINEMA_LENGTH[id]
    this.done = new Promise((r) => { this.finish = r })
  }

  /** `particleMap`: the sparks' sprite (the tests pass a plain texture: there is no canvas there). */
  static async create(id: CinemaId, slice: Slice = noSlice, particleMap?: Texture): Promise<Cinema> {
    const c = new Cinema(id)
    const s = c.script
    const look = themeOf(s.theme)
    const b = new FortressBuilder(`cinema-${id}`, 40, 24)
    s.stage(b)
    // The builder wants a way in and out; a scene has neither.
    let ix = 0
    let iz = 0
    for (let z = 0; z < 24 && !ix; z++) for (let x = 0; x < 40; x++) if (b.heightOf(x, z) > -999) { ix = x; iz = z; break }
    b.insert(ix, iz, 0).extract(ix, iz)
    const fort: Fortress = b.build()
    c.grid = fort.grid
    c.sky = buildSky(c.scene, new Vector3(40, 0, 24), look.sky, { w: 40 * CELL, d: 24 * CELL })
    c.mesh = await buildFortressMesh(fort, look.mesh, slice)
    c.scene.add(c.mesh.group, c.root)
    // The story's mech is CM-07, in his own colours, whatever the player wears (#M3).
    const mech = buildMech(FREE_PAINT)
    const dog = buildRobodog()
    const fx = particleMap ? new Particles(600, particleMap) : new Particles(600)
    c.root.add(mech.root, dog.root, fx.points)
    // The game's combat effects need a canvas for their sprites: none in the tests.
    const cfx = particleMap ? null : new CombatFx(FREE_PAINT)
    if (cfx) c.root.add(cfx.group)
    c.cfx = cfx
    const fired = new Set<string>()
    const st: Stage = {
      t: 0, dt: 0, cam: c.camera, mech, mp: restPose(), dog, dp: restDogPose(), fx, cfx, rockets: [], decoys: [], extra: {}, fired,
      floor: (x, z) => { const h = heightAt(fort.grid, x, z); return h === VOID ? -Infinity : h },
      // The hole in the barrel as the mech stands this frame (#167): its pose is put on first.
      muzzle: (w, out) => {
        poseMech(mech, st.mp)
        return muzzleWorld(mech, w, out) ?? out.copy(mech.root.position).setY(mech.root.position.y + 1.4)
      },
      once: (key, at, f) => { if (st.t >= at && !fired.has(key)) { fired.add(key); f() } },
      line: (m, a, bb) => {
        const len = Math.max(0.01, a.distanceTo(bb))
        m.position.copy(a).add(bb).multiplyScalar(0.5)
        m.scale.set(1, len, 1)
        m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, tmpA.subVectors(bb, a).normalize()))
      },
      look: (pos, at, fov = 50) => {
        c.camera.position.copy(pos)
        c.camera.lookAt(at)
        if (Math.abs(c.camera.fov - fov) > 0.01) { c.camera.fov = fov; c.camera.updateProjectionMatrix() }
      },
      place: (o, p, yaw) => { o.position.copy(p); if (yaw !== undefined) o.rotation.y = yaw }
    }
    c.stage = st
    s.cast(st, c.root)
    s.frame(st)
    if (s.still && !particleMap) c.loadStill(s.still.src)
    return c
  }

  /** Load the closing picture; until (unless) it arrives the scene's last frame holds. */
  private loadStill(src: string): void {
    new TextureLoader().load(prependBaseUrl(src), (tex) => {
      tex.colorSpace = SRGBColorSpace
      const material = new MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false, depthWrite: false })
      material.color.setScalar(0)
      const quad = new Mesh(new PlaneGeometry(2, 2), material)
      const scene = new Scene()
      scene.add(quad)
      const img = tex.image as { width?: number; height?: number }
      this.still = { scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1), quad, material, aspect: (img.width ?? 16) / (img.height ?? 9) }
    })
  }

  get music(): TrackId { return this.script.music }
  get time(): number { return this.stage.t }

  enter(): void { this.frame(0) }

  /** The scene runs on the frame's clock (`render`): nothing to step here. */
  update(): void {}

  private frame(dt: number): void {
    const st = this.stage
    st.dt = dt
    st.t = Math.min(this.length, st.t + dt)
    this.script.frame(st)
    st.fx.update(dt)
    st.cfx?.update(dt, 1, st.rockets, st.decoys, getRenderer().domElement.height || 720, this.camera.fov)
    this.sky.update(this.camera.position, st.t)
    if (st.t >= this.length) this.end()
  }

  /** For the tests: run the scene to a moment. */
  seek(t: number): void {
    const step = 1 / 30
    while (this.stage.t < t - 1e-6 && !this.over) this.frame(Math.min(step, t - this.stage.t))
  }

  /** Jump to the end (the skip button, or Space held). */
  skip(): void { this.end() }

  private end(): void {
    if (this.over) return
    this.over = true
    hud.cineStill = ''
    // A scene skipped mid-burst leaves no gun running.
    emit('cineGun', { spool: 0, firing: false })
    this.finish()
  }

  render(_alpha: number, dt: number): void {
    if (!this.over) this.frame(Math.min(0.1, dt))
    const r = getRenderer()
    r.info.reset()
    const still = this.still
    const k = this.stage.t - this.stillFrom
    // The HUD frames the still as what is coming: the fortress's name, locked (#184).
    const showing = !!still && k >= 0 && !this.over
    const want = showing ? this.script.still!.fortress : ''
    if (hud.cineStill !== want) hud.cineStill = want
    if (still && k >= 0) {
      // Fill the screen with it (cover, never stretched), up from black, pushed in slowly.
      const el = r.domElement
      const screen = (el.clientWidth || el.width) / Math.max(1, el.clientHeight || el.height)
      // A slow push in over the fortress, as through a long lens: it reads as a place to go.
      const push = 1 + 0.1 * smooth(k / INTRO_STILL_S)
      const sx = screen > still.aspect ? 1 : still.aspect / screen
      const sy = screen > still.aspect ? screen / still.aspect : 1
      still.quad.scale.set(sx * push, sy * push, 1)
      still.material.color.setScalar(smooth(k / 0.4))
      r.render(still.scene, still.camera)
      return
    }
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    if (this.still) {
      this.still.material.map?.dispose()
      this.still.material.dispose()
      this.still.quad.geometry.dispose()
    }
    this.mesh.dispose()
    this.sky.dispose()
    this.cfx?.dispose()
    this.root.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}
