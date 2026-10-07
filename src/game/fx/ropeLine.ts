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
const TURNS_PER_M = 3.5
/** Around the line, and rows per turn of the braid: one column's step per row keeps the helix clean (#164 had 10 × 6 at 7 turns a metre: a level's ropes cost more than its walls). */
const ROPE_SIDES = 6
const ROWS_PER_TURN = 6

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

/** One strung line: from A to B (its ends at the platforms' edges, at foot height). */
export interface RopeEnds { ax: number; ay: number; az: number; bx: number; by: number; bz: number }

/**
 * A line's parts in the world, each its own geometry: the braid edge to edge,
 * a run from each edge to its piton's eye, the two pitons set back onto the
 * platforms and leaning away from the line, a clamp where the line bends
 * over each edge (the tests read them one by one; the builders merge them).
 */
export const ropeLineParts = (e: RopeEnds): BufferGeometry[] => {
  const { ax, ay, az, bx, by, bz } = e
  const out: BufferGeometry[] = []
  /** A stretch of the braid from one point to another. */
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    const len = Math.max(0.05, Math.hypot(x1 - x0, y1 - y0, z1 - z0))
    // Painted on a unit length (whole turns), then stretched: the braid's pitch is the same on any length.
    const twists = Math.max(1, Math.round(len * TURNS_PER_M))
    const geo = cableGeometry(twists, ROPE_SIDES, twists * ROWS_PER_TURN, ROPE_R)
    geo.scale(1, len, 1)
    _q.setFromUnitVectors(UP, new Vector3(x1 - x0, y1 - y0, z1 - z0).normalize())
    geo.applyQuaternion(_q)
    geo.translate(x0, y0, z0)
    out.push(geo)
  }
  // The line the mech walks, edge to edge.
  span(ax, ay, az, bx, by, bz)
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
    const piton = pitonGeometry()
    piton.rotateY(s < 0 ? yaw : yaw + Math.PI)
    piton.translate(px, deck, pz)
    out.push(piton)
    // Its eye: up the leaning shaft, away from the line.
    span(x, y, z, px + ux * s * EYE_BACK, deck + EYE_UP, pz + uz * s * EYE_BACK)
    // The clamp, laid along the line: on its side, then turned to the line's heading.
    const clamp = paint(rcyl(ROPE_R * 1.6, ROPE_R * 3.2, ROPE_R * 0.5, 10, 1), PAL.steel)
    clamp.rotateX(Math.PI / 2)
    clamp.rotateY(yaw)
    clamp.translate(x, y, z)
    out.push(clamp)
  }
  return out
}

/**
 * Lines the rope gun has strung, or that a fortress was built with, all in
 * one toon mesh and its outline (two draw calls however many there are):
 * every rope in the world is this one design (#164, and the level's own,
 * which had kept the old pale tube and posts).
 */
export const buildRopeLines = (lines: readonly RopeEnds[]): RopeLine => {
  const group = new Group()
  group.name = 'ropeLines'
  const parts = lines.flatMap(ropeLineParts)
  if (!parts.length) return { group, dispose: () => {} }
  const geo = merge(parts)
  for (const p of parts) p.dispose()
  const lit = new Mesh(geo, toonVC() as Material)
  const ink = new Mesh(geo, outlineMat(0.008) as Material)
  ink.renderOrder = -1
  for (const m of [lit, ink]) { m.matrixAutoUpdate = false; group.add(m) }
  return {
    group,
    // The materials are the world's shared ones: only the geometry is this rope's own.
    dispose: () => { geo.dispose(); group.clear() }
  }
}

/** One line from A to B, with a piton at each end. */
export const buildRopeLine = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): RopeLine =>
  buildRopeLines([{ ax, ay, az, bx, by, bz }])
