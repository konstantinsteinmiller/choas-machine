import { CylinderGeometry, Mesh, type Object3D, type ShaderMaterial } from 'three'
import { buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import type { Rig, V3 } from '../models/kit'
import { makeFlameMaterial, setFlame } from '../fx/flameCone'

/**
 * ─── The robo dog flies by ───────────────────────────────────────────────────
 *
 * Every 10 to 20 seconds, at random, the player's robo dog crosses the sky
 * behind the Command Base: folded into its board, both jets lit, on an arc
 * of its own each time (higher or lower, left or right, bowed toward the
 * base or away from it, climbing or diving), banking into the curve. It is
 * slow through the middle of the picture and quick at the ends, which are
 * well off screen.
 *
 * In the deck's frame (the camera looks from +z). Every point of every arc
 * is at least `FLYBY_NEAR` behind the mech, so it never crosses in front of
 * the mech, the stations or the dropship. The planning is pure and seeded,
 * for the tests.
 */

/** The gap between one flight's start and the next. */
export const FLYBY_GAP_MIN = 10
export const FLYBY_GAP_MAX = 20
/** The nearest any flight comes (deck frame z: behind the mech is −z). */
export const FLYBY_NEAR = -26
/** Lowest and highest it flies over the deck: above the stations' tops from the camera, under the picture's top edge. */
export const FLYBY_LOW = 6
export const FLYBY_HIGH = 16
/** Drawn this much larger than life: 40–60 m out, nobody can judge its size, and at true size it is a speck. */
export const FLYBY_SCALE = 2.2

export interface Flight {
  /** A quadratic arc: from, bow, to. */
  p0: V3
  p1: V3
  p2: V3
  /** Seconds it takes. */
  dur: number
}

export interface FlightPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  bank: number
}

export type Rand = () => number

const NOSE_DOWN = 0.16

export const nextGap = (rand: Rand): number => FLYBY_GAP_MIN + rand() * (FLYBY_GAP_MAX - FLYBY_GAP_MIN)

/** A new arc: in from one side, out at the other, bowed and pitched its own way. */
export const planFlight = (rand: Rand): Flight => {
  const s = rand() < 0.5 ? -1 : 1
  const p0: V3 = [s * 90, FLYBY_LOW + 1 + rand() * 6, -(32 + rand() * 28)]
  const p2: V3 = [-s * 90, FLYBY_LOW + 1 + rand() * 6, -(32 + rand() * 28)]
  const p1: V3 = [(rand() - 0.5) * 50, FLYBY_LOW + rand() * (FLYBY_HIGH - FLYBY_LOW), -(30 + rand() * 32)]
  return { p0, p1, p2, dur: 6 + rand() * 1.8 }
}

const bez = (a: number, b: number, c: number, u: number): number => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c
const dbez = (a: number, b: number, c: number, u: number): number => 2 * (1 - u) * (b - a) + 2 * u * (c - b)

/** How far along the arc at time share `k`: half speed through the middle, quick at the ends. */
export const arcAt = (k: number): number => k + (0.5 * Math.sin(2 * Math.PI * k)) / (2 * Math.PI)

/** Where the dog is `k` (0 … 1) of the way through a flight, and how it is turned. */
export const flightAt = (f: Flight, k: number, out: FlightPose): FlightPose => {
  const u = arcAt(Math.min(1, Math.max(0, k)))
  const { p0: a, p1: b, p2: c } = f
  out.x = bez(a[0], b[0], c[0], u)
  out.y = bez(a[1], b[1], c[1], u)
  out.z = bez(a[2], b[2], c[2], u)
  const tx = dbez(a[0], b[0], c[0], u)
  const ty = dbez(a[1], b[1], c[1], u)
  const tz = dbez(a[2], b[2], c[2], u)
  const h = Math.hypot(tx, tz)
  out.yaw = Math.atan2(tx, tz)
  out.pitch = -Math.atan2(ty, h)
  // The turn: the heading's rate of change (curvature times speed), banked
  // into the way it goes as a flyer's is (tan bank = v·ω / g).
  const du = 1e-3
  const yaw2 = Math.atan2(dbez(a[0], b[0], c[0], u + du), dbez(a[2], b[2], c[2], u + du))
  let dYaw = yaw2 - out.yaw
  if (dYaw > Math.PI) dYaw -= Math.PI * 2
  if (dYaw < -Math.PI) dYaw += Math.PI * 2
  const speed = h / f.dur
  const omega = dYaw / du / f.dur
  out.bank = -Math.max(-0.9, Math.min(0.9, Math.atan((speed * omega) / 9.8)))
  return out
}

/** The flyby itself: the dog (built the first time it flies), its jet flames, the schedule. */
export class Flyby {
  private rig: Rig | null = null
  private flames: Mesh[] = []
  private flameMat: ShaderMaterial | null = null
  private flameGeo: CylinderGeometry | null = null
  private flight: Flight | null = null
  private start = 0
  private next: number
  private readonly pose: DogPose = restDogPose()
  private readonly at: FlightPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 }

  constructor(private readonly parent: Object3D, private readonly rand: Rand = Math.random, now = 0) {
    this.next = now + nextGap(rand)
  }

  /** Is it in the air now. */
  get flying(): boolean { return this.flight !== null }

  /** Send it over now (and the next one a gap after). */
  launch(time: number): void {
    if (!this.rig) this.build()
    this.flight = planFlight(this.rand)
    this.start = time
    this.next = time + nextGap(this.rand)
    this.rig!.root.visible = true
  }

  update(time: number): void {
    if (!this.flight) {
      if (time >= this.next) this.launch(time)
      else return
    }
    const f = this.flight!
    const k = (time - this.start) / f.dur
    const rig = this.rig!
    if (k >= 1) {
      this.flight = null
      rig.root.visible = false
      return
    }
    const p = flightAt(f, k, this.at)
    rig.root.position.set(p.x, p.y, p.z)
    // A little nose down, as a board driven forward on its jets is.
    rig.root.rotation.set(p.pitch + NOSE_DOWN, p.yaw, p.bank, 'YXZ')
    const s = this.pose
    s.time = time
    s.fold = 1
    s.thrust = 1
    poseRobodog(rig, s)
    setFlame(this.flameMat!, 1, time)
    const flick = 0.85 + 0.15 * Math.sin(time * 47) * Math.sin(time * 23)
    for (const m of this.flames) m.scale.set(1, 1, flick)
  }

  private build(): void {
    const rig = buildRobodog()
    rig.root.name = 'flyby-dog'
    rig.root.visible = false
    rig.root.scale.setScalar(FLYBY_SCALE)
    // A flame out of each jet's nozzle, back along the jet (its −z): mouth at the nozzle.
    const geo = new CylinderGeometry(0.03, 0.13, 1.1, 12, 1, true)
    geo.translate(0, 0.55, 0)
    geo.rotateX(-Math.PI / 2)
    const mat = makeFlameMaterial({ core: '#f2ffff', mid: '#7ff4ff', edge: '#3a62ff' })
    for (const tag of ['jetL', 'jetR']) {
      const m = new Mesh(geo, mat)
      m.position.set(0, 0, -0.38)
      m.renderOrder = 4
      m.frustumCulled = false
      rig.bones[tag]!.add(m)
      this.flames.push(m)
    }
    this.rig = rig
    this.flameGeo = geo
    this.flameMat = mat
    this.parent.add(rig.root)
  }

  dispose(): void {
    const rig = this.rig
    if (rig) {
      this.parent.remove(rig.root)
      rig.mesh.geometry.dispose()
      if (rig.outline && rig.outline.geometry !== rig.mesh.geometry) rig.outline.geometry.dispose()
      rig.material.dispose()
      rig.glowMaterial.dispose()
    }
    this.flameGeo?.dispose()
    this.flameMat?.dispose()
  }
}
