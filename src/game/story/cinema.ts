import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, SphereGeometry, Vector3, type Object3D, type Texture
} from 'three'
void (null as unknown as Object3D)
import { newScene, type GameMode } from '../engine/app'
import { getRenderer } from '../engine/renderer'
import { noSlice, type Slice } from '../engine/slicer'
import { FortressBuilder, type Fortress } from '../world/fortress'
import { CELL } from '../world/grid'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildSky, type Sky } from '../world/sky'
import { themeOf, type ThemeId } from '../data/themes'
import { MUZZLE_TIP, buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { BOARD_HOVER, DOG_STAND, buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import { CombatFx } from '../fx/combatFx'
import { SalvageView } from '../world/salvageView'
import type { Rocket } from '../sim/rockets'
import type { WeaponId } from '../data/ids'
import {
  buildDrone, buildEnforcer, buildGoliath, buildGuard, poseDrone, poseEnforcer, poseGoliath, poseGuard, restGuardPose
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

/** 0 … 1 across [a, b]. */
const span = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)))
const between = (t: number, a: number, b: number): boolean => t >= a && t < b

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
  /** The nose of the mech's weapon, as posed last frame (where its rounds leave from). */
  muzzle: (w: WeaponId, out: Vector3) => Vector3
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
const UP = new Vector3(0, 1, 0)

// ─── Intro: the ability showcase (about 35 s) ───────────────────────────────

const INTRO: Script = {
  theme: 'dusk',
  music: 'hero',
  stage: (b) => {
    // West shelf at 0, a cliff up to a plateau (outcrop A), a gap, outcrop B, a perch tower at its east end.
    b.ground(0, 0, 7, 23, 0)
    b.fill(8, 0, 17, 23, 10)
    b.fill(22, 0, 39, 23, 10)
    b.fill(36, 5, 37, 6, 14).fill(38, 11, 39, 12, 14)
  },
  cast: (s, root) => {
    const guards = [buildGuard(), buildGuard(), buildGuard()]
    guards.forEach((g, i) => { s.extra[`g${i}`] = g; root.add(g.root) })
    const drone = buildDrone()
    const tank = buildGoliath()
    s.extra.drone = drone
    s.extra.tank = tank
    root.add(drone.root, tank.root)
    const glow = new MeshBasicMaterial({ color: '#5fe9ff', toneMapped: false })
    for (const k of ['hookLine', 'rope', 'postA', 'postB']) {
      const m = new Mesh(new CylinderGeometry(k.startsWith('post') ? 0.08 : 0.04, k.startsWith('post') ? 0.08 : 0.04, 1, 6), glow)
      m.visible = false
      s.extra[k] = m
      root.add(m)
    }
    const ball = new Mesh(new SphereGeometry(0.22, 10, 8), new MeshBasicMaterial({ color: '#ff5fb7', toneMapped: false }))
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
    Object.assign(mp, restPose(), { time: t })
    dp.time = t
    // The board over the cloud sea, the mech crouched on it.
    if (t < 5) {
      const p = track([[0, -70, 5, 6], [3.5, -14, 2.5, 14], [5, 12, 0, 24]], t, tmpA)
      dp.fold = 1
      dp.thrust = 1
      s.place(s.dog.root, tmpB.set(p.x, p.y + BOARD_HOVER, p.z), Math.PI / 2)
      // The rider stands on the deck: the board's own height (as the drop-in has it).
      s.place(s.mech.root, tmpC.set(p.x, p.y + BOARD_HOVER, p.z), Math.PI / 2)
      mp.crouch = 1
      s.look(tmpB.set(p.x - 6, p.y + 2.4, p.z - 7), tmpC.set(p.x + 3, p.y + 1.2, p.z))
      s.once('board', 0.2, () => sfx('dropIn'))
    } else {
      // The board waits up out of the way, then comes to the perch.
      // Straight up past the cliff's top first, then across (#125: it flew through the cliff).
      const d = track([[5, 12, 3, 24], [6.4, 12, 15, 24], [8, 30, 22, 14], [30, 72, 22, 24], [32, 77.6, 14 + BOARD_HOVER, 25.4]], t, tmpA)
      dp.fold = t < 31 ? 1 : 1 - span(t, 31.2, 32.6)
      dp.thrust = dp.fold
      // Unfolding on the perch, it rises onto its legs: feet on the deck, not in it (#117).
      d.y += (DOG_STAND - BOARD_HOVER) * (1 - dp.fold)
      s.place(s.dog.root, d, t < 31 ? Math.PI / 2 : Math.PI)
    }
    // The hook up the cliff.
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
    // The rope across the gap.
    // From the edge of the cliff top (x 36) to the edge of the outcrop (x 44),
    // at foot height, a post at each end (#125: it floated, past both edges).
    const rope = s.extra.rope as Mesh
    rope.visible = t >= 9.8 && t < 13.5
    s.line(rope, tmpA.set(36, 10.06, 24), tmpB.set(44, 10.06, 24))
    for (const [k, x] of [['postA', 36], ['postB', 44]] as const) {
      const post = s.extra[k] as Mesh
      post.visible = rope.visible
      s.line(post, tmpA.set(x, 10, 24), tmpB.set(x, 10.5, 24))
    }
    if (between(t, 9, 13)) {
      const keys: Key[] = [[9, 17.5, 10, 24], [9.6, 35.2, 10, 24], [10.2, 35.6, 10, 24], [12.4, 44.4, 10, 24], [13, 46, 10, 24]]
      const p = track(keys, t, tmpA)
      s.place(s.mech.root, p, Math.PI / 2)
      mp.speed = Math.min(1, pace(keys, t) / 5)
      mp.stride = t * 7
      mp.cable = between(t, 10.3, 12.4) ? 1 : 0
      mp.aim = between(t, 9.7, 10.1) ? 1 : 0
      s.look(tmpB.set(p.x + 2, 14, 40), tmpC.set(p.x + 3, 10.5, 24))
      s.once('rope', 9.8, () => { sfx('hookThrow'); sfx('hookBite') })
    }
    // The decoy, the two guards, and the sentry on its tower.
    // Each on its round (#129), until the decoy lands: they turn, walk over
    // and stand looking at it, puzzled.
    const LURE: V3 = [60, 10, 30]
    for (const [i, a, b, period, stop] of [[0, [55, 10, 16], [55, 10, 22.5], 7, [58.6, 10, 28.3]], [1, [57, 10, 27.5], [61.5, 10, 25.5], 6, [61.6, 10, 31.2]]] as const) {
      const at = round(Math.min(t, 14.4), a, b, period, tmpA, i * 2.2)
      let yaw = at.yaw
      let walking = at.walking && t < 14.4
      if (t >= 14.4) {
        const k = span(t, 14.8, 16.8)
        const from = tmpB.copy(tmpA)
        tmpA.set(from.x + (stop[0] - from.x) * smooth(k), 10, from.z + (stop[2] - from.z) * smooth(k))
        yaw = Math.atan2(LURE[0] - tmpA.x, LURE[2] - tmpA.z)
        walking = k > 0 && k < 1
      }
      s.place(g(i).root, tmpA, yaw)
      poseGuard(g(i), { ...restGuardPose(), time: t + i, speed: walking ? 0.45 : 0, stride: t * 4.2 + i, wary: t >= 14.4 ? 1 : 0, lookYaw: t < 14.4 && !walking ? Math.sin(t * 1.3 + i) * 0.5 : t >= 16.8 ? Math.sin(t * 1.7 + i) * 0.3 : 0 })
    }
    const ball = s.extra.ball as Mesh
    ball.visible = t >= 13.4 && t < 17
    if (ball.visible) {
      const k = span(t, 13.4, 14.2)
      s.place(ball, tmpA.set(46 + 14 * k, 11.5 + Math.sin(k * Math.PI) * 4 - 1.3 * k, 24 + 6 * k))
    }
    if (between(t, 13, 17)) {
      const p = track([[13, 46, 10, 24], [15, 46, 10, 24], [17, 50, 10, 24]], t, tmpA)
      s.place(s.mech.root, p, Math.PI / 2)
      mp.crouch = 1
      mp.speed = t > 15 ? 0.5 : 0
      mp.stride = t * 5
      s.look(tmpB.set(p.x - 6, 13.5, p.z - 2), tmpC.set(p.x + 8, 11, 24))
      s.once('decoy', 14.2, () => sfx('decoy'))
    }
    // The rifle: a slow zoom, one headshot.
    const sentryDead = t >= 19.3
    // Pacing his tower top (#129), back at its corner by the time the rifle is on him.
    const sw = t < 16.6 ? round(t, [73, 14, 11], [75.2, 14, 12.8], 8, tmpA, -9.4) : { yaw: -Math.PI * 0.8, walking: false }
    if (t >= 16.6) tmpA.set(73, 14, 11)
    s.place(g(2).root, tmpA, t < 16.6 ? sw.yaw : -Math.PI * 0.8)
    poseGuard(g(2), { ...restGuardPose(), time: t, speed: sw.walking ? 0.4 : 0, stride: t * 4, lookYaw: sentryDead || sw.walking ? 0 : Math.sin(t * 0.7) * 0.6, deadT: sentryDead ? t - 19.3 : 0, death: 'back' })
    if (between(t, 17, 21)) {
      const keys: Key[] = [[17, 50, 10, 24], [19.9, 50, 10, 24], [21, 52, 10, 26]]
      const p = track(keys, t, tmpA)
      s.place(s.mech.root, p, t < 19.9 ? Math.atan2(73 - 50, 11 - 24) : Math.atan2(2, 2))
      mp.speed = Math.min(1, pace(keys, t) / 4)
      mp.stride = t * 6
      mp.aim = t < 19.9 ? 1 : 0
      mp.weapon = 'sniper'
      mp.aimPitch = 0.08
      mp.recoil = between(t, 19.2, 19.6) ? 1 - span(t, 19.2, 19.6) : 0
      const zoom = 50 - 32 * span(t, 17.4, 19)
      // Over the shoulder while scoped; once it walks on, the next shot's view (it walks into it, not through the lens).
      if (t < 19.9) s.look(tmpB.set(49.2, 12.4, 25.6), tmpC.set(73, 15.4, 11), zoom)
      else s.look(tmpB.set(46, 12, 22), tmpC.set(60, 14.5, 34))
      // The round leaves the barrel with the game's own flash and trail (#117).
      s.once('shot', 19.2, () => {
        sfx('sniper')
        const n = s.muzzle('sniper', tmpB)
        if (s.cfx) {
          const d = tmpC.set(73 - n.x, 15.5 - n.y, 11 - n.z).normalize()
          s.cfx.muzzle(n.x, n.y, n.z, d.x, d.y, d.z, 'sniper')
          s.cfx.tracer(n.x, n.y, n.z, 73, 15.5, 11, 'sniper')
          s.cfx.impact(73, 15.5, 11, -d.x, -d.y, -d.z, true, 'sniper')
        } else s.fx.sparks(73, 15.5, 11, '#ffe9a0', 14, 5, 0.25)
      })
    }
    // The mini-gun takes a drone out of the air.
    // On its patrol loop until the mini-gun comes up (#129), then holding where the stream finds it.
    const dd = t >= 23.8
    const da = Math.min(0, t - 21) * 0.55
    const dx0 = 62 + Math.sin(da) * 5
    const dz0 = 36 + (1 - Math.cos(da)) * 4
    const dy = dd ? Math.max(10.3, 16 - 18 * (t - 23.8) ** 2) : 16 + Math.sin(t * 1.9) * 0.15
    s.place(drone.root, tmpA.set(dx0, dy, dz0), t < 21 ? Math.PI + da * 0.8 : Math.PI)
    poseDrone(drone, { time: t, spin: t * 40, pitch: t < 21 ? 0.18 : 0.1, roll: t < 21 ? 0.12 : 0, eyeYaw: 0, eyePitch: 0.5, alarm: t >= 21.5 ? 1 : 0, deadT: dd ? t - 23.8 : 0, landed: dy <= 10.31 })
    if (between(t, 21, 25)) {
      const keys: Key[] = [[21, 52, 10, 26], [24.2, 52, 10, 26], [25, 52, 10, 29]]
      const p = track(keys, t, tmpA)
      s.place(s.mech.root, p, t < 24.2 ? Math.atan2(62 - 52, 36 - 26) : 0)
      mp.speed = Math.min(1, pace(keys, t) / 4)
      mp.stride = t * 6
      mp.aim = t < 24.1 ? 1 : 0
      mp.weapon = 'minigun'
      mp.spin = t * 30
      mp.aimPitch = 0.28
      // Each round: the flash at the spinning barrels, its tracer, and where it bites (#117).
      if (between(t, 22, 23.8) && Math.floor(t * 20) !== Math.floor((t - s.dt) * 20)) {
        const hx = 62 + (Math.random() - 0.5) * 0.8
        const hy = 16 + (Math.random() - 0.5) * 0.5
        const hz = 36 + (Math.random() - 0.5) * 0.8
        if (s.cfx) {
          const n = s.muzzle('minigun', tmpB)
          const d = tmpC.set(hx - n.x, hy - n.y, hz - n.z).normalize()
          s.cfx.muzzle(n.x, n.y, n.z, d.x, d.y, d.z, 'minigun')
          s.cfx.tracer(n.x, n.y, n.z, hx, hy, hz, 'minigun')
          // From the intro's distance a single hot dot is lost: each round also
          // draws a short streak flying the line, so the stream reads.
          const len = Math.hypot(hx - n.x, hy - n.y, hz - n.z)
          for (let q = 0; q < 6; q++) {
            s.cfx.particles.emit({
              x: n.x + d.x * (1 + q * 0.5), y: n.y + d.y * (1 + q * 0.5), z: n.z + d.z * (1 + q * 0.5),
              vx: d.x * 90, vy: d.y * 90, vz: d.z * 90, color: q === 0 ? '#ffffff' : '#ffd27a', size: 0.22 - q * 0.025, sizeEnd: 0.08, life: Math.max(0.05, (len - 1 - q * 0.5) / 90)
            })
          }
          s.cfx.impact(hx, hy, hz, -d.x, -d.y, -d.z, false, 'minigun')
        } else s.fx.sparks(hx, hy, hz, '#ffd27a', 4, 4, 0.18)
      }
      s.look(tmpB.set(46, 12, 22), tmpC.set(60, 14.5, 34))
      s.once('spin', 21.6, () => sfx('minigun'))
      s.once('drone', 23.8, () => { sfx('explode'); s.fx.orbBurst(62, 16, 36, '#ffb061', 0.7) })
    }
    // A rocket into the Goliath's flank.
    // Rolling up on its patrol (#129), its turret sweeping, until the rocket.
    const roll = smooth(span(t, 18, 25))
    s.place(tank.root, tmpA.set(70 - 4 * roll, 10, 44), -Math.PI / 2)
    const rolling = roll > 0 && roll < 1
    poseGoliath(tank, { time: t, turretYaw: t < 26 ? -0.4 + Math.sin(t * 0.45) * 0.35 : -0.4, barrelPitch: 0.05, recoil: 0, rumble: t > 27 ? 1 - span(t, 27, 30) : rolling ? 1 : 0.5, dead: 0 })
    // The game's own rocket (#117): out of the tube, a hot core and a trail
    // that swells into smoke, and the game's blast where it lands.
    const rocket = s.extra.rocket as Mesh
    rocket.visible = !s.cfx && between(t, 26.2, 27)
    if (rocket.visible) s.place(rocket, tmpA.lerpVectors(tmpB.set(53, 12, 30), tmpC.set(64.5, 11.5, 42), span(t, 26.2, 27)))
    if (s.cfx) {
      const from = s.extra.rocketFrom as Vector3 | undefined
      if (between(t, 26.2, 27) && from) {
        const r = s.rockets[0] ?? (s.rockets[0] = { x: from.x, y: from.y, z: from.z, px: from.x, py: from.y, pz: from.z, dx: 0, dy: 0, dz: 1, t: 0 })
        r.px = r.x; r.py = r.y; r.pz = r.z
        const k = span(t, 26.2, 27)
        r.x = from.x + (64.5 - from.x) * k
        r.y = from.y + (11.5 - from.y) * k
        r.z = from.z + (42 - from.z) * k
        const len = Math.hypot(64.5 - from.x, 11.5 - from.y, 42 - from.z) || 1
        r.dx = (64.5 - from.x) / len; r.dy = (11.5 - from.y) / len; r.dz = (42 - from.z) / len
      } else s.rockets.length = 0
    }
    if (between(t, 25, 30)) {
      // The rocket away, it runs on east toward the perch (#129).
      const keys: Key[] = [[25, 52, 10, 29], [27.6, 52, 10, 29], [30, 63, 10, 26]]
      const p = track(keys, t, tmpA)
      s.place(s.mech.root, p, t < 27.6 ? Math.atan2(66 - 52, 44 - 29) : Math.atan2(11, -3))
      mp.speed = Math.min(1, pace(keys, t) / 5)
      mp.stride = t * 8
      mp.aim = t < 27 ? 1 : 0
      mp.weapon = 'rocket'
      mp.recoil = between(t, 26.2, 26.6) ? 1 : 0
      s.look(tmpB.set(56, 15, 26), tmpC.set(65, 11, 43))
      s.once('rocket', 26.2, () => {
        sfx('rocket')
        const n = s.muzzle('rocket', new Vector3())
        s.extra.rocketFrom = n
        if (s.cfx) {
          const d = tmpC.set(64.5 - n.x, 11.5 - n.y, 42 - n.z).normalize()
          s.cfx.muzzle(n.x, n.y, n.z, d.x, d.y, d.z, 'rocket')
        }
      })
      s.once('boom', 27, () => {
        sfx('explode')
        if (s.cfx) s.cfx.explosion(64.5, 11.5, 42, 10)
        else { s.fx.orbBurst(64.5, 11.5, 42, '#ff9a3d', 1.4); s.fx.sparks(64.5, 11.5, 42, '#ffd27a', 30, 8, 0.3) }
      })
      if (t > 27 && Math.floor(t * 8) !== Math.floor((t - s.dt) * 8)) {
        s.fx.emit({ x: 66, y: 13, z: 44, vx: 0.3, vy: 1.8, vz: 0, color: '#3a3050', size: 1.4, sizeEnd: 3, life: 2.4, drag: 0.4 })
      }
    }
    // The perch: facing the Bastion, the board folding into a dog at its feet.
    if (t >= 30) {
      s.place(s.mech.root, tmpA.set(77.6, 14, 23.4), Math.PI / 2)
      const back = track([[30, 70, 16.5, 21], [35, 66, 20, 30]], t, tmpB)
      s.look(back, tmpC.set(92, 14, 24))
    }
    poseMech(s.mech, mp)
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
      t: 0, dt: 0, cam: c.camera, mech, mp: restPose(), dog, dp: restDogPose(), fx, cfx, rockets: [], extra: {}, fired,
      muzzle: (w, out) => {
        const [bone, x, y, z] = MUZZLE_TIP[w]
        const b = mech.bones[bone]
        if (!b) return out.copy(mech.root.position).setY(mech.root.position.y + 1.4)
        mech.root.updateMatrixWorld(true)
        return b.localToWorld(out.set(x, y, z))
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
    st.cfx?.update(dt, 1, st.rockets, [], getRenderer().domElement.height || 720, this.camera.fov)
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
