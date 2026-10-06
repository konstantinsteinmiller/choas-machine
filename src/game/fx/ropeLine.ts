import { BufferGeometry, Group, Mesh, Quaternion, Vector3, type Material } from 'three'
import { merge, paint, rcyl, sph, torus, xform } from '../models/kit'
import { outlineMat, toonVC } from '../models/toon'
import { PAL } from '../models/palette'
import { cableGeometry } from './grappleHook'

/**
 * ─── A line the rope gun has strung (#164) ───────────────────────────────────
 *
 * The same braided steel line as the grappling hook's cable (two dark
 * strands and a cyan tracer wound round them), a little thicker, taut from
 * one platform's edge to the other's, where the mech walks it; at each end a
 * steel piton driven into the deck, leaning back against the pull, the line
 * through its eye. Toon-lit and outlined like everything else in the world,
 * not a flat glowing tube.
 */

/** The line's radius (m), and how many turns its braid makes per metre. */
export const ROPE_R = 0.032
const TURNS_PER_M = 7

/** How far back from the platform's edge a piton is driven, and where its eye is above the deck and behind the shaft's foot. */
const PITON_BACK = 0.35
const EYE_UP = 0.42
const EYE_BACK = 0.14

const UP = new Vector3(0, 1, 0)
const _q = new Quaternion()

/** One piton, standing on its base at the origin, leaning back toward −z: shaft, collar, eye. */
const pitonGeometry = (): BufferGeometry => {
  const lean: [number, number, number] = [-0.35, 0, 0]
  const parts = [
    // The shaft: half of it is down in the deck.
    paint(xform(rcyl(0.035, 0.62, 0.01, 10, 1), [0, 0.06, 0], lean), PAL.steelDark),
    // A collar where it meets the deck, and the eye at the top.
    paint(xform(rcyl(0.06, 0.05, 0.015, 12, 1), [0, 0.02, 0]), PAL.steel),
    paint(xform(torus(0.06, 0.016, 6, 14), [0, 0.42, -0.14], [0, Math.PI / 2, 0]), PAL.mechCore),
    paint(xform(sph(0.03, 8, 6), [0, 0.37, -0.12]), PAL.steel)
  ]
  const g = merge(parts)
  for (const p of parts) p.dispose()
  return g
}

export interface RopeLine {
  group: Group
  dispose(): void
}

/** The line from A to B (its ends at the platforms' edges, at foot height), with a piton at each. */
export const buildRopeLine = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): RopeLine => {
  const group = new Group()
  group.name = 'ropeLine'
  const toon = toonVC()
  const line = outlineMat(0.008)
  const geos: BufferGeometry[] = []
  /** A stretch of the braid from one point to another, outlined. */
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    const len = Math.max(0.05, Math.hypot(x1 - x0, y1 - y0, z1 - z0))
    // Painted on a unit length (whole turns), then stretched: the braid's pitch is the same on any length.
    const twists = Math.max(1, Math.round(len * TURNS_PER_M))
    const geo = cableGeometry(twists, 10, twists * 6, ROPE_R)
    geo.scale(1, len, 1)
    geos.push(geo)
    _q.setFromUnitVectors(UP, new Vector3(x1 - x0, y1 - y0, z1 - z0).normalize())
    for (const mat of [toon, line] as Material[]) {
      const m = new Mesh(geo, mat)
      if (mat === line) m.renderOrder = -1
      m.position.set(x0, y0, z0)
      m.quaternion.copy(_q)
      group.add(m)
    }
  }
  // The line the mech walks, edge to edge.
  span(ax, ay, az, bx, by, bz)
  // The pitons, set back onto each platform and leaning away from the line;
  // the line runs on from the edge to its eye.
  const pgeo = pitonGeometry()
  geos.push(pgeo)
  // A clamp where the line bends over each edge (the braid's ends meet there).
  const clamp = paint(rcyl(ROPE_R * 1.6, ROPE_R * 3.2, ROPE_R * 0.5, 10, 1), PAL.steel)
  geos.push(clamp)
  const hx = bx - ax
  const hz = bz - az
  const hl = Math.hypot(hx, hz) || 1
  const ux = hx / hl
  const uz = hz / hl
  const yaw = Math.atan2(ux, uz)
  for (const [x, y, z, s] of [[ax, ay, az, -1], [bx, by, bz, 1]] as const) {
    const px = x + ux * s * PITON_BACK
    const pz = z + uz * s * PITON_BACK
    const deck = y - 0.06
    for (const mat of [toon, line] as Material[]) {
      const m = new Mesh(pgeo, mat)
      if (mat === line) m.renderOrder = -1
      m.position.set(px, deck, pz)
      m.rotation.y = s < 0 ? yaw : yaw + Math.PI
      group.add(m)
    }
    // Its eye: up the leaning shaft, away from the line.
    const ex = px + ux * s * EYE_BACK
    const ez = pz + uz * s * EYE_BACK
    span(x, y, z, ex, deck + EYE_UP, ez)
    for (const mat of [toon, line] as Material[]) {
      const m = new Mesh(clamp, mat)
      if (mat === line) m.renderOrder = -1
      m.position.set(x, y, z)
      // Laid along the line: on its side, then turned to the line's heading.
      m.rotation.set(Math.PI / 2, yaw, 0, 'YXZ')
      group.add(m)
    }
  }
  return {
    group,
    dispose: () => {
      for (const g of geos) g.dispose()
      toon.dispose()
      line.dispose()
    }
  }
}
