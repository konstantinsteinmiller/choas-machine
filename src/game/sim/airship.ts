import { CELL, VOID, type Grid } from '../world/grid'

/**
 * ─── The Airship (#142), what it does ────────────────────────────────────────
 *
 * It circles the fortress high over the walls, slow. At peace its searchlight
 * sweeps the ground ahead of it: the mech held in the pool for UPLINK_S and the
 * base is told (as a drone tells it). On full alert its two turrets fire bursts
 * at the mech and its pods send rockets that fly (24 m/s, a ring on the ground
 * where they will land) and can be dodged.
 *
 * Its hull and its engines are armoured: rounds glance off them. Only a blast
 * hurts an engine; each one lost slows it, and with all four gone it lists,
 * falls and breaks apart outside the walls. A turret is not armoured: rounds
 * knock it out, and a dead turret is quiet.
 *
 * Pure: positions in metres, no meshes. `airshipView.ts` draws it, and every
 * round and rocket leaves from the barrel or tube the view says (`AIRSHIP_SOCKETS`).
 */

export const ENGINE_HP = 500
export const TURRET_HP = 140
/** Cruising speed along its loop, m/s, with all four engines; it keeps a share with none. */
export const AIRSHIP_SPEED = 6.5
const SLOWEST = 0.35
/** Height over the fortress's highest point it flies at. */
const CLEARANCE = 15
/** Its searchlight's pool, and how long the mech held in it before the base is told. */
export const LAMP_R = 5.5
export const UPLINK_S = 2
/** A turret's burst: rounds, gap, the pause after; its reach; a round's chance to hit and its damage. */
export const BURST = 4
export const BURST_GAP = 0.12
export const BURST_PAUSE = 2.2
export const TURRET_RANGE = 75
export const ROUND_HIT = 0.32
export const ROUND_DAMAGE = 6
/** A rocket from a pod: every this many seconds, flying this fast; its blast. */
export const ROCKET_EVERY = 4.5
export const SHIP_ROCKET_SPEED = 24
export const SHIP_BLAST_R = 4.5
export const SHIP_BLAST_DAMAGE = 34
/** What it is worth brought down: added to the haul. */
export const AIRSHIP_SCRAP = 120

export type TurretId = 'F' | 'B'

export interface Airship {
  /** Where it is along its loop (radians), and the loop. */
  t: number
  cx: number
  cz: number
  r: number
  alt: number
  x: number
  y: number
  z: number
  yaw: number
  /** Lists as it goes down: roll and pitch, radians. */
  roll: number
  pitch: number
  engines: number[]
  turrets: Record<TurretId, number>
  /** Seconds since it started down, or −1 while it flies; gone once it has fallen. */
  crashT: number
  gone: boolean
  /** The searchlight's spot on the ground, and how long it has held the mech. */
  lampX: number
  lampZ: number
  seenT: number
  time: number
  fire: Record<TurretId, { cool: number; burst: number; gap: number; barrel: 0 | 1 }>
  rocketCool: number
  tube: number
}

/** An enemy rocket in flight. */
export interface ShipRocket {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Where it will land, as told by the ring on the ground. */
  tx: number
  ty: number
  tz: number
  t: number
  life: number
}

export const makeAirship = (g: Grid): Airship => {
  let top = 0
  for (let i = 0; i < g.h.length; i++) if (g.h[i]! !== VOID && g.h[i]! > top) top = g.h[i]!
  const cx = (g.w * CELL) / 2
  const cz = (g.d * CELL) / 2
  const r = Math.max(18, Math.min(g.w, g.d) * CELL * 0.36)
  const a: Airship = {
    t: 0, cx, cz, r, alt: top + CLEARANCE, x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0,
    engines: [ENGINE_HP, ENGINE_HP, ENGINE_HP, ENGINE_HP], turrets: { F: TURRET_HP, B: TURRET_HP },
    crashT: -1, gone: false, lampX: cx, lampZ: cz, seenT: 0, time: 0,
    fire: { F: { cool: 1, burst: 0, gap: 0, barrel: 0 }, B: { cool: 1.6, burst: 0, gap: 0, barrel: 0 } },
    rocketCool: ROCKET_EVERY, tube: 0
  }
  place(a)
  return a
}

export const enginesUp = (a: Airship): number => a.engines.filter(h => h > 0).length
export const flying = (a: Airship): boolean => a.crashT < 0 && !a.gone

const place = (a: Airship): void => {
  a.x = a.cx + Math.cos(a.t) * a.r
  a.z = a.cz + Math.sin(a.t) * a.r
  if (a.crashT < 0) a.y = a.alt + Math.sin(a.time * 0.4) * 0.6
  // Along the loop: its heading is the loop's tangent.
  a.yaw = Math.atan2(-Math.sin(a.t), Math.cos(a.t))
}

/** Fly one step: along the loop (or down, once its engines are gone); the searchlight's spot. */
export const stepAirship = (a: Airship, dt: number): void => {
  if (a.gone) return
  a.time += dt
  if (a.crashT >= 0) {
    a.crashT += dt
    // Listing, nose down, drifting out of the loop as it falls.
    a.t += (AIRSHIP_SPEED * SLOWEST / a.r) * dt
    a.r += 4 * dt
    a.roll = Math.min(0.7, a.roll + dt * 0.35)
    a.pitch = Math.min(0.5, a.pitch + dt * 0.22)
    a.y -= (3 + a.crashT * 7) * dt
    place(a)
    if (a.y < -30) a.gone = true
    return
  }
  const speed = AIRSHIP_SPEED * (SLOWEST + (1 - SLOWEST) * enginesUp(a) / 4)
  a.t += (speed / a.r) * dt
  // A lost engine on one side: it lists toward it.
  const left = (a.engines[0]! > 0 ? 1 : 0) + (a.engines[2]! > 0 ? 1 : 0)
  const right = (a.engines[1]! > 0 ? 1 : 0) + (a.engines[3]! > 0 ? 1 : 0)
  a.roll += ((right - left) * 0.06 - a.roll) * Math.min(1, dt * 0.8)
  place(a)
  // The searchlight sweeps the ground ahead of it, side to side.
  const ahead = 8
  const side = Math.sin(a.time * 0.55) * 9
  a.lampX = a.x + Math.sin(a.yaw) * ahead + Math.cos(a.yaw) * side
  a.lampZ = a.z + Math.cos(a.yaw) * ahead - Math.sin(a.yaw) * side
}

/** A blast at a point (its radius, its full damage): what it does to each engine. Returns the engines it took out. */
export const blastAirship = (a: Airship, engineAt: ReadonlyArray<{ x: number; y: number; z: number }>, x: number, y: number, z: number, radius: number, damage: number): number[] => {
  const out: number[] = []
  if (!flying(a)) return out
  engineAt.forEach((e, i) => {
    if (a.engines[i]! <= 0) return
    const d = Math.max(0, Math.hypot(e.x - x, e.y - y, e.z - z) - 1.2)
    if (d > radius) return
    a.engines[i] = Math.max(0, a.engines[i]! - damage * (1 - 0.75 * (d / radius)))
    if (a.engines[i] === 0) out.push(i)
  })
  if (enginesUp(a) === 0) a.crashT = 0
  return out
}

/** A round into a turret: true if that knocked it out. */
export const hitTurret = (a: Airship, id: TurretId, damage: number): boolean => {
  if (a.turrets[id] <= 0) return false
  a.turrets[id] = Math.max(0, a.turrets[id] - damage)
  return a.turrets[id] === 0
}

/**
 * The guns, one step, on full alert: which turret fires a round now (with
 * which barrel), and whether a pod sends a rocket. The caller checks the line
 * from the socket and does the rest.
 */
export const stepGuns = (a: Airship, loud: boolean, inRange: Record<TurretId, boolean>, rocketRange: boolean, dt: number): { rounds: Array<{ id: TurretId; barrel: 0 | 1 }>; rocket: number } => {
  const res: { rounds: Array<{ id: TurretId; barrel: 0 | 1 }>; rocket: number } = { rounds: [], rocket: -1 }
  if (!flying(a) || !loud) return res
  for (const id of ['F', 'B'] as const) {
    const f = a.fire[id]
    if (a.turrets[id] <= 0 || !inRange[id]) { f.burst = 0; f.cool = Math.max(f.cool, 0.6); continue }
    if (f.burst > 0) {
      f.gap -= dt
      if (f.gap > 0) continue
      f.burst--
      f.gap = BURST_GAP
      res.rounds.push({ id, barrel: f.barrel })
      f.barrel = f.barrel === 0 ? 1 : 0
      if (f.burst === 0) f.cool = BURST_PAUSE
      continue
    }
    f.cool -= dt
    if (f.cool <= 0) { f.burst = BURST; f.gap = 0 }
  }
  a.rocketCool -= dt
  if (a.rocketCool <= 0 && rocketRange) {
    a.rocketCool = ROCKET_EVERY
    res.rocket = a.tube
    a.tube = (a.tube + 1) % 8
  }
  return res
}

/** A rocket from `x, y, z` at the mech, aimed where it will be. */
export const launchRocket = (list: ShipRocket[], x: number, y: number, z: number, tx: number, ty: number, tz: number): ShipRocket => {
  const d = Math.hypot(tx - x, ty - y, tz - z) || 1
  const r: ShipRocket = {
    x, y, z, vx: ((tx - x) / d) * SHIP_ROCKET_SPEED, vy: ((ty - y) / d) * SHIP_ROCKET_SPEED, vz: ((tz - z) / d) * SHIP_ROCKET_SPEED,
    tx, ty, tz, t: 0, life: d / SHIP_ROCKET_SPEED
  }
  list.push(r)
  return r
}

/** Fly the rockets; returns those that arrived (removed from the list). */
export const stepShipRockets = (list: ShipRocket[], dt: number): ShipRocket[] => {
  const out: ShipRocket[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]!
    r.t += dt
    r.x += r.vx * dt
    r.y += r.vy * dt
    r.z += r.vz * dt
    if (r.t >= r.life) { list.splice(i, 1); out.push(r) }
  }
  return out
}

/** What a rocket's blast does to the mech `dist` metres from it. */
export const shipBlastDamage = (dist: number): number => (dist >= SHIP_BLAST_R ? 0 : SHIP_BLAST_DAMAGE * (1 - dist / SHIP_BLAST_R))
