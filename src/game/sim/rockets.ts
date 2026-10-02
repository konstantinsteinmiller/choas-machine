import type { Grid } from '../world/grid'
import type { Unit } from './garrison'
import { castShot, makeShotHit } from './hitscan'

/**
 * Rockets in flight. Each flies straight until it meets the world or a
 * defender, or runs out of fuel; then it is an explosion for the mission to
 * resolve (`damage.blast`). Pure.
 */

export const ROCKET_SPEED = 42
const ROCKET_LIFE_S = 3

export interface Rocket {
  x: number
  y: number
  z: number
  px: number
  py: number
  pz: number
  dx: number
  dy: number
  dz: number
  t: number
}

export interface Burst {
  x: number
  y: number
  z: number
  /** The unit it hit head-on, or −1. */
  direct: number
}

export const fireRocket = (list: Rocket[], x: number, y: number, z: number, dx: number, dy: number, dz: number): void => {
  list.push({ x, y, z, px: x, py: y, pz: z, dx, dy, dz, t: 0 })
}

const _hit = makeShotHit()

/** Fly every rocket one step. Returns the ones that went off (removed from the list). */
export const stepRockets = (list: Rocket[], g: Grid, units: readonly Unit[], dt: number): Burst[] => {
  const bursts: Burst[] = []
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i]!
    r.px = r.x
    r.py = r.y
    r.pz = r.z
    r.t += dt
    const step = ROCKET_SPEED * dt
    const hit = castShot(g, units, r.x, r.y, r.z, r.dx, r.dy, r.dz, step, _hit)
    if (hit.kind !== 'none' || r.t >= ROCKET_LIFE_S) {
      // Go off a hand's width short of the surface, so the blast is not
      // inside the wall it hit.
      const back = hit.kind === 'none' ? 0 : 0.15
      bursts.push({ x: hit.x - r.dx * back, y: hit.y - r.dy * back, z: hit.z - r.dz * back, direct: hit.unit })
      list.splice(i, 1)
      continue
    }
    r.x += r.dx * step
    r.y += r.dy * step
    r.z += r.dz * step
  }
  return bursts
}
