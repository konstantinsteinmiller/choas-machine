/**
 * ─── The robo dog's flights ──────────────────────────────────────────────────
 *
 * Where the dog (or the board it folds into) is, and where the mech is
 * relative to it, at each moment of the drop-in and of the way out. Pure:
 * progress in, positions out.
 *
 * The drop-in: the board comes in low over the sea of clouds with the mech
 * standing on it, brakes over the perch, the mech jumps off, and the board
 * peels away and climbs out of sight.
 *
 * The way out: the dog comes galloping in on its jets, skids up beside the
 * mech, lies down into a board, the mech steps on, and the board climbs away
 * with it.
 */
import { BOARD_HOVER, DOG_STAND } from '../models/robodog'
import { DROP_LANDED } from './cine'
import { hasLineOfSight, type Grid } from '../world/grid'

export interface DogFrame {
  x: number
  y: number
  z: number
  yaw: number
  /** 0 dog … 1 board. */
  fold: number
  /** Gallop speed, 0 … 1, and the cycle angle. */
  run: number
  stride: number
  /** 0 … 1 jet glow. */
  thrust: number
  /** Drawn at all. */
  visible: boolean
}

/** Where the mech is: its own place plus this, and whether it is in the air. */
export interface RiderFrame {
  dx: number
  dy: number
  dz: number
  air: boolean
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v: number): number => { const k = clamp01(v); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k

// ─── The drop-in ─────────────────────────────────────────────────────────────

/** Progress at which the board is over the perch, the mech is off, it lands. */
export const BOARD_ARRIVE = 0.34
export const RIDER_JUMP = 0.38
/** On the establishing shot's landing beat, so the camera looks past it then. */
export const RIDER_LAND = DROP_LANDED

/**
 * The drop-in at progress `k`. `(px, py, pz)` is where the mech lands,
 * `facing` the way it will look. The board arrives from behind it.
 */
export const introFrame = (
  dog: DogFrame, rider: RiderFrame, k: number, px: number, py: number, pz: number, facing: number,
  approach: number = facing, high = INTRO_HIGH, reach = 1
): void => {
  // The board comes in along `approach` (behind the perch, unless a wall is in the way: `findApproach`).
  const fx = Math.sin(approach)
  const fz = Math.cos(approach)
  // In from 60 m behind and `high` up, braking hard at the end.
  const e = clamp01(k / BOARD_ARRIVE)
  const arrive = smooth(e)
  // Still a long way out when the shot opens; it brakes over the last metres.
  // (`reach` < 1: a steeper way down, into a walled yard.)
  const out = 0.6 + 59.4 * reach * (1 - e) * (1 - e)
  const hover = py + 1.6
  let bx = px - fx * out
  let by = lerp(py + high, hover, arrive) + Math.sin(k * 30) * 0.05
  let bz = pz - fz * out
  // After the jump: on along its line, banking up and away.
  const leave = clamp01((k - RIDER_JUMP) / (1 - RIDER_JUMP))
  bx += fx * leave * leave * 70 * reach
  by += leave * leave * 36
  bz += fz * leave * leave * 70 * reach
  dog.x = bx
  dog.y = by
  dog.z = bz
  dog.yaw = approach
  dog.fold = 1
  dog.run = 0
  dog.stride = 0
  dog.thrust = k < BOARD_ARRIVE ? 0.8 : 0.5 + leave * 0.5
  dog.visible = leave < 0.98
  // The mech rides the deck, then jumps: a hop forward and down to the perch.
  if (k < RIDER_JUMP) {
    rider.dx = bx - px
    rider.dy = by - py
    rider.dz = bz - pz
    rider.air = false
  } else {
    const j = clamp01((k - RIDER_JUMP) / (RIDER_LAND - RIDER_JUMP))
    const sx = px - fx * 0.6 - px
    const sz = pz - fz * 0.6 - pz
    rider.dx = sx * (1 - j)
    rider.dz = sz * (1 - j)
    rider.dy = lerp(hover - py, 0, j) + Math.sin(j * Math.PI) * 1.4
    rider.air = j < 1
  }
}

/** The board's arrival height over the perch, by default. */
export const INTRO_HIGH = 14

/**
 * A way in for the board that flies through nothing solid (#105): from
 * behind the perch if that is clear, else turned a little further each try
 * and coming in higher; checked along the whole arrival and climb-out, for
 * the board and for the mech standing on it. Pure.
 */
export const findApproach = (g: Grid, px: number, py: number, pz: number, facing: number): { approach: number; high: number; reach: number } => {
  const dog: DogFrame = { x: 0, y: 0, z: 0, yaw: 0, fold: 1, run: 0, stride: 0, thrust: 0, visible: true }
  const rider: RiderFrame = { dx: 0, dy: 0, dz: 0, air: false }
  const clear = (approach: number, high: number, reach: number): boolean => {
    let lx = 0
    let ly = 0
    let lz = 0
    for (let i = 0; i <= 60; i++) {
      const k = i / 60
      introFrame(dog, rider, k, px, py, pz, facing, approach, high, reach)
      if (i > 0 && dog.visible) {
        for (const up of [0.2, 2.4]) {
          // The last stretch onto the perch is the rider's hop, onto the floor itself.
          if (k > RIDER_JUMP - 0.02 && k < RIDER_LAND + 0.04) continue
          if (!hasLineOfSight(g, lx, ly + up, lz, dog.x, dog.y + up, dog.z)) return false
        }
      }
      lx = dog.x
      ly = dog.y
      lz = dog.z
    }
    return true
  }
  // Long and low first (the shot the drop-in was made for), then higher, then
  // steeper and steeper: into a walled yard the board comes down from above.
  for (const [high, reach] of [[INTRO_HIGH, 1], [22, 1], [32, 1], [32, 0.4], [40, 0.15], [48, 0.04]] as const) {
    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
      if (clear(facing + turn, high, reach)) return { approach: facing + turn, high, reach }
    }
  }
  return { approach: facing, high: 48, reach: 0.02 }
}

// ─── The way out ─────────────────────────────────────────────────────────────

export const DOG_ARRIVE = 0.3
export const DOG_FOLDED = 0.42
export const RIDER_ON = 0.52

/**
 * The way out at progress `k`. `(px, py, pz)` is where the mech stands,
 * `yaw` the way it faces. The dog comes in from the side the mech's left is on.
 */
export const outroFrame = (
  dog: DogFrame, rider: RiderFrame, k: number, px: number, py: number, pz: number, yaw: number
): void => {
  // The mech's left is +x when it faces +z.
  const lx = Math.cos(yaw)
  const lz = -Math.sin(yaw)
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const run = clamp01(k / DOG_ARRIVE)
  // Galloping in along an arc that ends beside the mech, 1.7 m to its left.
  const far = 1 - smooth(run)
  const ax = px + lx * (1.7 + far * 16) - fx * far * 6
  const az = pz + lz * (1.7 + far * 16) - fz * far * 6
  // Folding: it lies down into a board and slides under the mech.
  const fold = smooth((k - DOG_ARRIVE) / (DOG_FOLDED - DOG_ARRIVE))
  const slide = smooth((k - DOG_FOLDED) / (RIDER_ON - DOG_FOLDED))
  const climb = clamp01((k - RIDER_ON) / (1 - RIDER_ON))
  const deck = lerp(py + DOG_STAND, py + BOARD_HOVER, fold)
  dog.x = lerp(ax, px, slide) + fx * climb * climb * 40
  dog.z = lerp(az, pz, slide) + fz * climb * climb * 40
  dog.y = deck + climb * climb * 30
  // It faces where it is running, then turns to face the way the mech looks.
  dog.yaw = run < 1 ? Math.atan2(px + lx * 1.7 - ax + 1e-6, pz + lz * 1.7 - az + 1e-6) : yaw
  dog.fold = fold
  dog.run = k < DOG_ARRIVE ? 1 - smooth((k - DOG_ARRIVE * 0.75) / (DOG_ARRIVE * 0.25)) : 0
  dog.stride = k * 46
  dog.thrust = k < DOG_ARRIVE ? 0.7 : k < RIDER_ON ? 0.35 : 1
  dog.visible = climb < 0.995
  // The mech waits, hops onto the deck as it slides under, and rides it out.
  if (k < DOG_FOLDED) {
    rider.dx = rider.dy = rider.dz = 0
    rider.air = false
  } else if (k < RIDER_ON) {
    const j = clamp01((k - DOG_FOLDED) / (RIDER_ON - DOG_FOLDED))
    rider.dx = 0
    rider.dz = 0
    rider.dy = BOARD_HOVER * smooth(j) + Math.sin(j * Math.PI) * 0.7
    rider.air = true
  } else {
    rider.dx = dog.x - px
    rider.dy = dog.y - py
    rider.dz = dog.z - pz
    rider.air = false
  }
}

export const makeDogFrame = (): DogFrame => ({ x: 0, y: 0, z: 0, yaw: 0, fold: 1, run: 0, stride: 0, thrust: 0, visible: false })
export const makeRiderFrame = (): RiderFrame => ({ dx: 0, dy: 0, dz: 0, air: false })
