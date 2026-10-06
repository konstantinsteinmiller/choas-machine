import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, SphereGeometry, Vector3, type Object3D, type Texture
} from 'three'
void (null as unknown as Object3D)
import { newScene, type GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { noSlice, type Slice } from '../engine/slicer'
import { FortressBuilder, type Fortress } from '../world/fortress'
import { CELL, VOID, heightAt } from '../world/grid'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildSky, type Sky } from '../world/sky'
import { themeOf, type ThemeId } from '../data/themes'
import { muzzleWorld, buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { BOARD_HOVER, HOUND_SCALE, STRIDE_PER_UNIT, buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import { CombatFx } from '../fx/combatFx'
import { SalvageView } from '../world/salvageView'
import type { Rocket } from '../sim/rockets'
import type { Decoy } from '../sim/melee'
import { angleDelta } from '../sim/player'
import { airAt, airCam, airMark, planAir } from '../sim/airStrike'
import { bodySink, placeKillBody } from '../sim/killPose'
import type { WeaponId } from '../data/ids'
import {
  MUZZLE, buildDrone, buildEnforcer, buildGoliath, buildGuard, buildRoomba, buildSearchlight, poseDrone, poseEnforcer, poseGoliath, poseGuard, poseRoomba, poseSearchlight, restGuardPose
} from '../models/garrison'
import { buildDropship, type Dropship } from '../models/dropship'
import type { Rig } from '../models/kit'
import { Particles } from '../fx/particles'
import { makeFlameMaterial, setFlame } from '../fx/flameCone'
import { sfx } from '../audio/sfx'
import type { TrackId } from '../audio/songs'
import { CINEMA_LENGTH, type CinemaId } from './cinemaIds'

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
  extra: Record<string, Rig | Object3D | Dropship | Mesh | Vector3>
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

// ─── Intro: the ability showcase (about 35 s) ───────────────────────────────

const INTRO: Script = {
  theme: 'dusk',
  music: 'hero',
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
    const glow = new MeshBasicMaterial({ color: '#5fe9ff', toneMapped: false })
    for (const k of ['hookLine', 'rope', 'postA', 'postB']) {
      const m = new Mesh(new CylinderGeometry(k.startsWith('post') ? 0.08 : 0.04, k.startsWith('post') ? 0.08 : 0.04, 1, 6), glow)
      m.visible = false
      s.extra[k] = m
      root.add(m)
    }
    // The decoy in flight: the game's emitter orb (it stands up as the game's hologram).
    const ball = new Mesh(new SphereGeometry(0.18, 10, 8), new MeshBasicMaterial({ color: '#5fe9ff', toneMapped: false }))
    const rocket = new Mesh(new SphereGeometry(0.2, 8, 6), new MeshBasicMaterial({ color: '#ffd166', toneMapped: false }))
    ball.visible = rocket.visible = false
    s.extra.ball = ball
    s.extra.rocket = rocket
    root.add(ball, rocket)
  },
  frame: (s) => {
    const { t, mp, dp } = s
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
      // away over the sea (#136): it never sets down anywhere in the scene.
      const d = clearOf(track([[5, 12, 0.45, 24], [6.2, 11, 6, 22], [8.5, 0, 20, 4], [13, -60, 42, -60]], t, tmpA), 0.45)
      dp.fold = 1
      dp.thrust = 1
      s.place(s.dog.root, d.setY(d.y + BOARD_HOVER), Math.atan2(-60 - 12, -60 - 24))
      s.dog.root.visible = t < 13
    }
    const hook = s.extra.hookLine as Mesh
    hook.visible = between(t, 5.2, 8.4)
    if (between(t, 5, 9)) {
      const y = 10 * span(t, 5.6, 8.2)
      const x = t < 8.4 ? 15.2 : 15.2 + 2.3 * span(t, 8.4, 9)
      s.place(s.mech.root, tmpA.set(x, t < 8.4 ? y : 10, 24), Math.PI / 2)
      mp.climb = t < 8.4 ? 1 : 0
      mp.climbPhase = y
      s.line(hook, tmpB.set(x + 0.4, y + 2, 24), tmpC.set(16.1, 10.05, 24))
      s.look(tmpB.set(6, 4 + y * 0.5, 36), tmpC.set(15.5, y + 1.5, 24))
      s.once('hook', 5.2, () => sfx('hookThrow'))
      s.once('bite', 5.5, () => sfx('hookBite'))
    }

    // ── The decoy into the yard, the rope across above it ──
    const DECOY: V3 = [50, 4, 27.4]
    if (between(t, 9, 11.4)) {
      const keys: Key[] = [[9, 17.5, 10, 24], [10, 34.8, 10, 24]]
      const p = track(keys, t, tmpA)
      s.place(s.mech.root, p, t < 10 ? Math.PI / 2 : Math.atan2(DECOY[0] - 34.8, DECOY[2] - 24))
      mp.speed = Math.min(1, pace(keys, t) / 5)
      mp.stride = t * 7
      mp.aim = between(t, 10.9, 11.4) ? 1 : 0
      s.look(tmpB.set(30.5, 14, 19), tmpC.set(48, 5.5, 27))
      s.once('decoy', 10.2, () => sfx('decoy'))
    }
    const ball = s.extra.ball as Mesh
    ball.visible = between(t, 10.2, 10.9)
    if (ball.visible) {
      const k = span(t, 10.2, 10.9)
      s.place(ball, tmpA.set(35.4 + (DECOY[0] - 35.4) * k, 12 + (DECOY[1] - 12) * k + Math.sin(k * Math.PI) * 3.5, 24 + (DECOY[2] - 24) * k))
    }
    // The game's own hologram, waving where it landed, until the guard is down.
    if (between(t, 10.9, 16)) {
      const dc = s.decoys[0] ?? (s.decoys[0] = { x: DECOY[0], y: DECOY[1], z: DECOY[2], yaw: Math.PI * 1.2, t: 0, life: 6, pulse: 0 })
      dc.t = t - 10.9
    } else s.decoys.length = 0
    const rope = s.extra.rope as Mesh
    rope.visible = t >= 11.2 && t < 16
    s.line(rope, tmpA.set(36, 10.06, 24), tmpB.set(60, 10.06, 24))
    for (const [k, x] of [['postA', 36], ['postB', 60]] as const) {
      const post = s.extra[k] as Mesh
      post.visible = rope.visible
      s.line(post, tmpA.set(x, 10, 24), tmpB.set(x, 10.5, 24))
    }
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
    if (between(t, DIVE_AT, DIVE_AT + plan.total * INTRO_DIVE_SLOW)) {
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

    // ── Out of the yard: to the ladder, up onto the wall ──
    if (between(t, 15.6, 19.3)) {
      const keys: Key[] = [[15.6, 51.6, 4, 26.6], [17.4, 58.6, 4, 23], [17.6, 58.6, 4, 23], [19.1, 58.6, 10, 23], [19.3, 61, 10, 23]]
      const p = track(keys, t, tmpA)
      const climbing = between(t, 17.6, 19.1)
      s.place(s.mech.root, p, climbing || t > 19.1 ? Math.PI / 2 : Math.atan2(58.6 - 51.6, 23 - 26.6))
      mp.climb = climbing ? 1 : 0
      mp.climbPhase = p.y
      mp.speed = climbing ? 0 : Math.min(1, pace(keys, t) / 4)
      mp.stride = t * 6
      s.look(tmpB.set(51, 9, 33), tmpC.set(57.5, 6.5, 23))
    }

    // ── The sentry on his tower, the rifle ──
    const SENTRY_DOWN = 21.9
    const sentryDead = t >= SENTRY_DOWN
    const sw = t < 19.8 ? round(t, [73, 14, 11], [75.2, 14, 12.8], 8, tmpA, -5.8) : { yaw: -Math.PI * 0.8, walking: false }
    if (t >= 19.8) tmpA.set(73, 14, 11)
    s.place(g(2).root, tmpA, t < 19.8 ? sw.yaw : -Math.PI * 0.8)
    poseGuard(g(2), { ...restGuardPose(), time: t, speed: sw.walking ? 0.4 : 0, stride: t * 4, lookYaw: sentryDead || sw.walking ? 0 : Math.sin(t * 0.7) * 0.6, deadT: sentryDead ? t - SENTRY_DOWN : 0, death: 'back' })
    if (between(t, 19.3, 23)) {
      const keys: Key[] = [[19.3, 61, 10, 23], [19.8, 62.5, 10, 22.5], [22.4, 62.5, 10, 22.5], [23, 64, 10, 26]]
      const p = track(keys, t, tmpA)
      const scoped = between(t, 19.9, 22.4)
      s.place(s.mech.root, p, scoped ? Math.atan2(73 - 62.5, 11 - 22.5) : Math.atan2(1.5, 3.5))
      mp.speed = Math.min(1, pace(keys, t) / 4)
      mp.stride = t * 6
      mp.aim = scoped ? 1 : 0
      mp.weapon = 'sniper'
      mp.aimPitch = 0.12
      mp.recoil = between(t, SENTRY_DOWN - 0.1, SENTRY_DOWN + 0.3) ? 1 - span(t, SENTRY_DOWN - 0.1, SENTRY_DOWN + 0.3) : 0
      if (t < 22.4) s.look(tmpB.set(61.4, 12.6, 24.2), tmpC.set(73, 15.4, 11), 50 - 32 * span(t, 20, 21.5))
      else s.look(tmpB.set(57, 13, 19), tmpC.set(67, 13, 33))
      s.once('shot', SENTRY_DOWN - 0.1, () => {
        sfx('sniper')
        const n = s.muzzle('sniper', tmpB)
        if (s.cfx) shoot(n.x, n.y, n.z, 73, 15.5, 11, 'sniper')
        else s.fx.sparks(73, 15.5, 11, '#ffe9a0', 14, 5, 0.25)
      })
    }

    // ── The drone and the mini-gun; the base hears it ──
    const DRONE_DOWN = 25.8
    const dd = t >= DRONE_DOWN
    const da = Math.min(0, t - 23.4) * 0.55
    const dx0 = 66 + Math.sin(da) * 5
    const dz0 = 34 + (1 - Math.cos(da)) * 3
    const dy = dd ? Math.max(10.3, 16 - 18 * (t - DRONE_DOWN) ** 2) : 16 + Math.sin(t * 1.9) * 0.15
    s.place(drone.root, tmpA.set(dx0, dy, dz0), t < 23.4 ? Math.PI + da * 0.8 : Math.PI)
    poseDrone(drone, { time: t, spin: t * 40, pitch: t < 23.4 ? 0.18 : 0.1, roll: t < 23.4 ? 0.12 : 0, eyeYaw: 0, eyePitch: 0.5, alarm: t >= 23.4 ? 1 : 0, deadT: dd ? t - DRONE_DOWN : 0, landed: dy <= 10.31 })
    const MECH_GUN: V3 = [64, 10, 26]
    if (between(t, 23, 28)) {
      s.place(s.mech.root, tmpA.set(MECH_GUN[0], 10, MECH_GUN[2]), t < 26.2 ? Math.atan2(66 - 64, 34 - 26) : Math.atan2(6, 12))
      mp.aim = 1
      mp.weapon = 'minigun'
      mp.spin = t * 30
      mp.aimPitch = 0.4
      if (tick(0.05, 23.8, DRONE_DOWN)) {
        const hx = 66 + (Math.random() - 0.5) * 0.8
        const hy = 16 + (Math.random() - 0.5) * 0.5
        const hz = 34 + (Math.random() - 0.5) * 0.8
        const n = s.muzzle('minigun', tmpB)
        shoot(n.x, n.y, n.z, hx, hy, hz, 'minigun')
      }
      // Once the base is after it, the camera turns round to what is coming.
      if (t < 26.2) s.look(tmpB.set(57, 13, 19), tmpC.set(67, 13, 33))
      else s.look(tmpB.set(58, 13.5, 17), tmpC.set(70, 10.5, 37))
      s.once('spin', 23.6, () => sfx('minigun'))
      s.once('drone', DRONE_DOWN, () => { sfx('explode'); s.fx.orbBurst(66, 16, 34, '#ffb061', 0.7) })
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
      const at = round(Math.min(t, ALARM), [64, 10, 3.5], [78, 10, 3.5], 10, tmpA, 0)
      let yaw = at.yaw
      let speed = at.walking && !alarmed ? 0.6 : 0
      if (alarmed) {
        const k = span(t, ALARM + 0.5, ALARM + 3)
        const fx = tmpA.x
        tmpA.set(fx + (72 - fx) * k, 10, 3.5 + 10 * k)
        yaw = Math.atan2(tgt.x - tmpA.x, tgt.z - tmpA.z)
        speed = k > 0 && k < 1 ? 1 : 0
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
    const TANK_DOWN = 30
    const roll = smooth(span(t, 18, 25))
    const tankX = 74 - 4 * roll
    s.place(tank.root, tmpA.set(tankX, 10, 44), -Math.PI / 2)
    const toMech = angleDelta(-Math.PI / 2, Math.atan2(tgt.x - tankX, tgt.z - 44))
    const turret = t < ALARM ? Math.sin(t * 0.45) * 0.5 : toMech * smooth(span(t, ALARM, ALARM + 2.2))
    const cannon = between(t, 27.2, 27.7) ? 1 - span(t, 27.2, 27.7) : 0
    poseGoliath(tank, { time: t, turretYaw: turret, barrelPitch: 0.05, recoil: cannon, rumble: t >= TANK_DOWN ? 0 : roll > 0 && roll < 1 ? 1 : 0.5, dead: t >= TANK_DOWN ? Math.min(1, (t - TANK_DOWN) * 2) : 0 })
    s.once('cannon', 27.2, () => {
      sfx('rocket')
      if (s.cfx) {
        // The shell misses: it lands behind the mech.
        s.cfx.muzzle(tankX - 2.6, 12.4, 41.8, -0.2, 0, -1, 'rocket')
        s.cfx.tracer(tankX - 2.6, 12.4, 41.8, 61.5, 10.4, 22.5, 'rocket')
      }
    })
    s.once('shell', 27.55, () => { sfx('explode'); if (s.cfx) s.cfx.explosion(61.5, 10.4, 22.5, 10) })
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
    if (between(t, 28, 35.5)) {
      const keys: Key[] = [[28, 64, 10, 26], [28.6, 64, 10, 29], [31.2, 64, 10, 29], [35.5, 75, 10, 20]]
      const p = track(keys, t, tmpA)
      const aiming = between(t, 28.6, 30.2)
      s.place(s.mech.root, p, aiming ? Math.atan2(tankX - 64, 44 - 29) : t < 28.6 ? 0 : Math.atan2(11, -9))
      mp.speed = Math.min(1, pace(keys, t) / 5)
      mp.stride = t * 8
      mp.aim = aiming ? 1 : 0
      mp.weapon = 'rocket'
      mp.recoil = between(t, 29.2, 29.6) ? 1 : 0
      if (t < 31.2) s.look(tmpB.set(57.5, 15, 24), tmpC.set(70, 11, 43))
      else s.look(tmpB.set(p.x - 7, 14, p.z + 8), tmpC.set(p.x + 2, 11, p.z))
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
      if (t > TANK_DOWN && Math.floor(t * 8) !== Math.floor((t - s.dt) * 8)) {
        s.fx.emit({ x: tankX, y: 13, z: 44, vx: 0.3, vy: 1.8, vz: 0, color: '#3a3050', size: 1.4, sizeEnd: 3, life: 2.4, drag: 0.4 })
      }
    }

    // ── The perch: facing the Bastion, the board folding into a dog at its feet ──
    if (t >= 35.5) {
      s.place(s.mech.root, tmpA.set(77.6, 14, 23.4), Math.PI / 2)
      const back = track([[35.5, 70, 16.5, 21], [40.5, 66, 20, 30]], t, tmpB)
      s.look(back, tmpC.set(92, 14, 24))
    }
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
    const mech = buildMech()
    const dog = buildRobodog()
    const fx = particleMap ? new Particles(600, particleMap) : new Particles(600)
    c.root.add(mech.root, dog.root, fx.points)
    // The game's combat effects need a canvas for their sprites: none in the tests.
    const cfx = particleMap ? null : new CombatFx()
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
    return c
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
    this.finish()
  }

  render(_alpha: number, dt: number): void {
    if (!this.over) this.frame(Math.min(0.1, dt))
    const r = getRenderer()
    r.info.reset()
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    this.mesh.dispose()
    this.sky.dispose()
    this.cfx?.dispose()
    this.root.traverse((o) => {
      const m = o as Mesh
      if (m.geometry) m.geometry.dispose()
    })
  }
}
