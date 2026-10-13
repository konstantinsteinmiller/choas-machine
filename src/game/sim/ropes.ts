import { CellKind, VOID, cableSpan, cellHeight, cellKind, hasLineOfSight, inGrid, toCell, type Cable, type Grid } from '../world/grid'

/**
 * ─── The rope gun (#94) ──────────────────────────────────────────────────────
 *
 * From somewhere high (a wall top, a tower, a roof's edge), the mech shoots a
 * line to a spot it looks at, no higher than where it stands and within
 * ROPE_RANGE, and walks it at once like any of the fortress's cables. The
 * line must run clear the whole way. A few to a raid. Pure.
 */

export const ROPE_RANGE = 40
/** The mech must stand this high above the ground beside it: a rope is shot from a height. */
export const ROPE_PERCH = 2
/** The far end may be at most this much higher than where the mech stands, for a long rope. */
const ROPE_RISE = 0.5
/**
 * Up to another platform (jam build): from the edge of a raised area, a rope
 * to the edge of another raised area at most ROPE_UP_RANGE away, its top up
 * to ROPE_UP_RISE higher; the mech walks it uphill.
 */
export const ROPE_UP_RANGE = 10
export const ROPE_UP_RISE = 6
/** The steepest a strung line may be, rise over run from end to end. */
const ROPE_STEEPEST = 2.5

export interface RopeShot {
  cable: Cable
  /** The two ends in the world: where the mech stands, and where it lands. */
  ax: number; ay: number; az: number
  bx: number; by: number; bz: number
}

/**
 * Where a rope from (x, y, z) to the spot the camera's line met would go, or
 * null if it cannot: the hit must be the top of somewhere to stand, low
 * enough, far enough, near enough, with a clear line to it, and the mech
 * must stand at a height.
 */
export const findRopeShot = (g: Grid, x: number, y: number, z: number, hitX: number, hitY: number, hitZ: number, upY: number, faceX = 0, faceZ = 0): RopeShot | null => {
  if (upY < 0.5) {
    // A wall's face just under its lip (jam build: aiming at a platform's edge
    // usually lands there): the top behind that face counts.
    if (Math.abs(faceX) + Math.abs(faceZ) < 0.5) return null
    const tx = hitX - faceX * 0.3
    const tz = hitZ - faceZ * 0.3
    const top = cellHeight(g, toCell(tx), toCell(tz))
    if (top === VOID || top - hitY > 0.8 || top < hitY) return null
    return findRopeShot(g, x, y, z, tx, top, tz, 1)
  }
  const acx = toCell(x)
  const acz = toCell(z)
  const bcx = toCell(hitX)
  const bcz = toCell(hitZ)
  if (!inGrid(g, bcx, bcz) || Math.max(Math.abs(bcx - acx), Math.abs(bcz - acz)) < 2) return null
  const ah = cellHeight(g, acx, acz)
  const bh = cellHeight(g, bcx, bcz)
  if (ah === VOID || bh === VOID || Math.abs(ah - y) > 0.3) return null
  if (Math.abs(bh - hitY) > 0.3) return null
  if (cellKind(g, bcx, bcz) === CellKind.Cover) return null
  const far = Math.hypot(hitX - x, hitZ - z)
  if (bh > y + ROPE_RISE) {
    // Upward: a short rope onto another platform, whose edge it is.
    if (bh > y + ROPE_UP_RISE || far > ROPE_UP_RANGE) return null
    let lowB = Infinity
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const h = cellHeight(g, bcx + dx, bcz + dz)
      if (h !== VOID) lowB = Math.min(lowB, h)
    }
    if (bh - lowB < ROPE_PERCH) return null
  } else if (far > ROPE_RANGE) return null
  // Shot from a height: the ground beside the mech is well below it.
  let low = Infinity
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const h = cellHeight(g, acx + dx, acz + dz)
      if (h !== VOID) low = Math.min(low, h)
    }
  }
  if (ah - low < ROPE_PERCH) return null
  const ax = (acx + 0.5) * 2
  const az = (acz + 0.5) * 2
  const bx = (bcx + 0.5) * 2
  const bz = (bcz + 0.5) * 2
  // Clear the whole way, a body's height over the line.
  if (!hasLineOfSight(g, ax, ah + 1.0, az, bx, bh + 1.0, bz)) return null
  const cable = { ax: acx, az: acz, bx: bcx, bz: bcz }
  // Never a line that drops (or climbs) like a wall (#201): one the mech could not walk.
  const s = cableSpan(g, cable)
  if (Math.abs(bh - ah) > ROPE_STEEPEST * Math.hypot(bx - ax, bz - az) * (s.tb - s.ta)) return null
  return { cable, ax, ay: ah, az, bx, by: bh, bz }
}
