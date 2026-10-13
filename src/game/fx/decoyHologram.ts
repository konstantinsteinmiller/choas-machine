import { Bone, Group, Mesh, Skeleton, SkinnedMesh, SphereGeometry, Vector3, type ShaderMaterial } from 'three'
import { FREE_PAINT, type PaintId } from '../models/paintIds'
import { MECH_SCALE, buildMech, poseMech, reachHand, restPose, type MechPose } from '../models/mech'
import { pose, type Rig } from '../models/kit'
import { makeHologramMaterial, setHologram } from './hologram'

/**
 * ─── The decoy: CM-07 in light, juggling ─────────────────────────────────────
 *
 * The decoy the mech throws stands up as a hologram of the mech itself
 * (`buildMech`, life-size, in the training demos' hologram light) and juggles
 * three glowing balls in a cascade, bobbing like a showman in the ring: the
 * thing a guard has to walk over and look at. Looks only: where it stands and
 * what it lures are the simulation's (`sim/melee.ts`).
 *
 * Every place a decoy is drawn builds it here: the mission's and the story's
 * (`CombatFx`), the training ground's demo (`TrainingDirector`).
 *
 * Cheap enough for a phone and for several a raid: the mech's geometry is
 * built once per paint scheme and shared by every decoy (each has only its
 * own skeleton and its own light), the balls share one sphere. Disposing a
 * decoy frees what is its own and never what is shared.
 */

/** One beat of the cascade (s): a throw every beat, the hands in turn. */
export const JUGGLE_BEAT = 0.42
/** Beats a ball rests in the hand that caught it, carried in to be thrown again. */
export const JUGGLE_DWELL = 0.75
/** Beats a ball is in the air, from one hand to the other (a ball is thrown every third beat). */
export const JUGGLE_FLIGHT = 3 - JUGGLE_DWELL
/** A ball's whole round: thrown by one hand, then by the other, back to where it began (s). */
export const JUGGLE_PERIOD = 6 * JUGGLE_BEAT
/** The balls' radius (m). */
export const JUGGLE_BALL_R = 0.1
/**
 * Where the hands work, in the decoy's own frame (m: it faces +z, its right
 * hand is on −x): in front of the chest, throwing from near the middle,
 * catching out to the side. The balls peak over its helmet (2 m).
 */
export const JUGGLE_HAND_Y = 1.2
const HAND_Z = 0.42
const HAND_IN = 0.1
const HAND_OUT = 0.4
/** How deep a hand scoops carrying a ball in, and how high an empty hand rises going out to the next catch (m). */
const SCOOP = 0.12
const LIFT = 0.05
/** How high over the hands the arc peaks (m), and how far forward it bows. */
const APEX = 1.4
const BOW = 0.1
/** The balls' hues: bright, and still light (the hologram's program, tinted). */
const BALL_HUES = ['#ff6ad5', '#ffe15a', '#7dffa0'] as const
/**
 * Light across the whole figure and the balls (`makeHologramMaterial`): the
 * lessons' ghost is mostly silhouette, which washes out in a sunlit yard; a
 * decoy has to be seen from across it, and its balls glow all through.
 */
const BODY_FILL = 0.22
const BALL_FILL = 0.7

export interface P3 { x: number; y: number; z: number }
/** The cascade at one moment, in the decoy's frame: each ball's middle, and where each palm is. */
export interface JugglePlan { balls: [P3, P3, P3]; hands: { L: P3; R: P3 } }

export const makeJugglePlan = (): JugglePlan => ({
  balls: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
  hands: { L: { x: 0, y: 0, z: 0 }, R: { x: 0, y: 0, z: 0 } }
})

/** The side a hand is on: the right hand on −x (the mech faces +z). */
const sideX = (hand: 'L' | 'R'): number => (hand === 'R' ? -1 : 1)
/** The hand that throws on beat `n`: the right on even beats, the left on odd. */
const thrower = (n: number): 'L' | 'R' => ((((n % 2) + 2) % 2) === 0 ? 'R' : 'L')
const other = (h: 'L' | 'R'): 'L' | 'R' => (h === 'R' ? 'L' : 'R')
const mod = (a: number, n: number): number => ((a % n) + n) % n

/** A hand carrying a ball in, 0 caught out at the side … 1 thrown near the middle: a scoop down and up. */
const carry = (hand: 'L' | 'R', v: number, out: P3): P3 => {
  const s = sideX(hand)
  out.x = s * (HAND_OUT + (HAND_IN - HAND_OUT) * v)
  out.y = JUGGLE_HAND_Y - SCOOP * Math.sin(Math.PI * v)
  out.z = HAND_Z
  return out
}

/** An empty hand going back out, 0 just thrown … 1 at the next catch: a little rise. */
const reachOut = (hand: 'L' | 'R', v: number, out: P3): P3 => {
  const s = sideX(hand)
  out.x = s * (HAND_IN + (HAND_OUT - HAND_IN) * v)
  out.y = JUGGLE_HAND_Y + LIFT * Math.sin(Math.PI * v)
  out.z = HAND_Z
  return out
}

/**
 * The three-ball cascade at `t` seconds (pure, periodic in JUGGLE_PERIOD):
 * a throw every beat, the hands in turn; each ball flies from near the
 * middle on one side, over the head, to the far side's outside, where that
 * hand catches it, carries it in with a scoop and throws it back across. A
 * ball in a hand sits on its palm.
 */
export const juggleAt = (t: number, out: JugglePlan): JugglePlan => {
  const b = t / JUGGLE_BEAT
  for (let j = 0; j < 3; j++) {
    // Ball j is thrown on beats j, j + 3, j + 6 …: alternately by each hand.
    const since = mod(b - j, 3)
    const n = Math.round(b - j - since) + j
    const from = thrower(n)
    const to = other(from)
    const o = out.balls[j]!
    if (since < JUGGLE_FLIGHT) {
      const u = since / JUGGLE_FLIGHT
      const s0 = sideX(from) * HAND_IN
      const s1 = sideX(to) * HAND_OUT
      o.x = s0 + (s1 - s0) * u
      o.y = JUGGLE_HAND_Y + JUGGLE_BALL_R + 4 * APEX * u * (1 - u)
      o.z = HAND_Z + BOW * Math.sin(Math.PI * u)
    } else {
      carry(to, (since - JUGGLE_FLIGHT) / JUGGLE_DWELL, o)
      o.y += JUGGLE_BALL_R
    }
  }
  for (const hand of ['L', 'R'] as const) {
    // Each hand throws every second beat (the right on even beats) and
    // catches JUGGLE_FLIGHT after the other hand's throw.
    const h = mod(b - (hand === 'R' ? 0 : 1), 2)
    const empty = 2 - JUGGLE_DWELL
    if (h < empty) reachOut(hand, h / empty, out.hands[hand])
    else carry(hand, (h - empty) / JUGGLE_DWELL, out.hands[hand])
  }
  return out
}

// ─── Shared: the mech's geometry per scheme, the balls' sphere ──────────────

const templates = new Map<PaintId, Rig>()
let ballGeo: SphereGeometry | null = null

const templateFor = (paint: PaintId): Rig => {
  let t = templates.get(paint)
  if (!t) {
    t = buildMech(paint)
    templates.set(paint, t)
  }
  return t
}

/** The shared sphere every decoy's balls are drawn with. */
export const decoyBallGeometry = (): SphereGeometry => (ballGeo ??= new SphereGeometry(JUGGLE_BALL_R, 12, 8))

/** The shared mech every decoy of `paint` is drawn from (its geometry; tests look at it). */
export const decoyTemplate = (paint: PaintId = FREE_PAINT): Rig => templateFor(paint)

/**
 * A rig of the template's geometry with a skeleton of its own: the same
 * bones, at rest, posed independently, one draw in `material`.
 */
const instanceRig = (tpl: Rig, material: ShaderMaterial): Rig => {
  const src = tpl.mesh.skeleton.bones
  const rootBone = src[0]!.clone(true) as Bone
  const byName: Record<string, Bone> = {}
  rootBone.traverse(o => { if ((o as Bone).isBone) byName[o.name] = o as Bone })
  const bones = src.map(b => byName[b.name]!)
  const mesh = new SkinnedMesh(tpl.mesh.geometry, material)
  mesh.add(rootBone)
  mesh.bind(new Skeleton(bones, tpl.mesh.skeleton.boneInverses), tpl.mesh.bindMatrix)
  mesh.frustumCulled = false
  const root = new Group()
  root.add(mesh)
  root.scale.setScalar(MECH_SCALE)
  return { ...tpl, root, mesh, outline: null, bones: byName }
}

const _w = new Vector3()

/** One decoy on screen: CM-07 in light, and its three balls. */
export class DecoyHologram {
  /** Placed at the decoy's feet and turned to its heading by the owner. */
  readonly root = new Group()
  readonly rig: Rig
  readonly balls: Mesh[] = []
  /** Its own light (the body's, each ball's): faded and flickered with this decoy alone. */
  readonly materials: ShaderMaterial[] = []
  private pose: MechPose = restPose()
  private plan = makeJugglePlan()

  constructor(paint: PaintId = FREE_PAINT) {
    const body = makeHologramMaterial(undefined, BODY_FILL)
    this.materials.push(body)
    this.rig = instanceRig(templateFor(paint), body)
    this.root.add(this.rig.root)
    const geo = decoyBallGeometry()
    for (const hue of BALL_HUES) {
      const m = makeHologramMaterial(hue, BALL_FILL)
      this.materials.push(m)
      const ball = new Mesh(geo, m)
      ball.frustumCulled = false
      this.balls.push(ball)
      this.root.add(ball)
    }
    // Its weapons are put away: the hands are for the balls.
    this.pose.stow = 1
  }

  /**
   * Pose it for this frame: `time` the clock (the light's scanlines, the
   * idle), `t` seconds since it stood up (the cascade), `fade` 1 shown … 0
   * gone (the hologram's dissolve). Place and turn `root` first.
   */
  update(time: number, t: number, fade: number): void {
    const rig = this.rig
    this.pose.time = time
    poseMech(rig, this.pose)
    // The showman: knees giving on every throw, the body swaying toward the
    // hand that throws, the head up after the balls.
    const beat = t / JUGGLE_BEAT
    const bend = 0.07 + 0.05 * (0.5 + 0.5 * Math.cos(beat * Math.PI * 2))
    const splay = 0.07
    for (const [tag, s] of [['L', 1], ['R', -1]] as const) {
      pose(rig, `thigh${tag}`, -bend, 0, s * splay)
      pose(rig, `shin${tag}`, 2 * bend, 0, 0)
      pose(rig, `foot${tag}`, -bend, 0, -s * splay)
    }
    // As much lower as the bent, splayed legs are shorter: the feet stay on the floor.
    rig.bones.hips!.position.y -= 0.88 * (1 - Math.cos(bend) * Math.cos(splay))
    const sway = Math.sin(beat * Math.PI)
    pose(rig, 'hips', 0, 0.06 * sway, 0.03 * sway)
    pose(rig, 'chest', -0.04, 0.05 * sway, -0.06 * sway)
    pose(rig, 'head', -0.38 + 0.05 * Math.sin(beat * Math.PI * 2), -0.12 * sway, 0)
    // The hands where the cascade has them; the balls on their arcs.
    const plan = juggleAt(t, this.plan)
    this.root.updateMatrixWorld(true)
    for (const hand of ['L', 'R'] as const) {
      const p = plan.hands[hand]
      reachHand(rig, hand, this.root.localToWorld(_w.set(p.x, p.y, p.z)))
    }
    for (let i = 0; i < 3; i++) {
      const p = plan.balls[i]!
      this.balls[i]!.position.set(p.x, p.y, p.z)
    }
    for (const m of this.materials) setHologram(m, time, fade)
  }

  /** Free this decoy's own light and skeleton; the shared geometry stays for the next. */
  dispose(): void {
    this.root.removeFromParent()
    for (const m of this.materials) m.dispose()
    this.rig.mesh.skeleton.dispose()
  }
}
