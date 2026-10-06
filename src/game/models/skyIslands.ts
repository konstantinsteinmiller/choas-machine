import { Color, Vector3, type BufferGeometry } from 'three'
import { paintBy, rbox, rcone, rcyl, rock, sph, torus, weldKey, xform, type V3 } from './kit'
import { PAL } from './palette'
import { at, newParts, rod, type Parts } from './propKit'

/**
 * ─── The sky round the Command Base ──────────────────────────────────────────
 *
 * A middle distance between the base and the sky's far ring of islands
 * (`world/sky.ts`): floating islands of rock with their undersides tapering
 * away, a hover ring glowing under each, and on top what the war has built
 * there: a hangar, spires, a relay mast, a watchtower, a citadel. Beacons
 * blink on the masts and towers (`islandLampParts`, their own mesh). The
 * haze takes them more the farther they are, so they stand in layers.
 *
 * In the deck's frame (the camera looks from +z): every island is behind
 * the base or off to its sides, 70 m and more away.
 */

type Kind = 'hangar' | 'spires' | 'mast' | 'tower' | 'citadel'
interface Island { at: V3; size: number; kind: Kind; seed: number }

const ISLANDS: readonly Island[] = [
  { at: [-52, 4, -88], size: 15, kind: 'hangar', seed: 3 },
  { at: [46, 12, -112], size: 18, kind: 'spires', seed: 5 },
  { at: [-112, -6, -58], size: 13, kind: 'mast', seed: 8 },
  { at: [102, -10, -62], size: 12, kind: 'tower', seed: 13 },
  { at: [-14, 20, -165], size: 26, kind: 'citadel', seed: 21 },
  { at: [128, 8, -150], size: 17, kind: 'mast', seed: 34 },
  { at: [-150, 14, -138], size: 21, kind: 'spires', seed: 55 }
]

const ROCK_TOP = '#9b8ae0'
const ROCK_FOOT = '#3b2c78'
const BUILT = '#6a5fb4'
const BUILT_DARK = '#40377e'

/**
 * A floating rock: flat on top, a long taper below, painted by height, its
 * normals welded across the sphere's seam (or the outline splits along it).
 */
const islandRock = (seed: number): BufferGeometry => {
  const g = rock(1, seed, 12, 9)
  const pos = g.attributes.position!
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    pos.setY(i, y > 0.1 ? 0.1 : y * 2.4)
  }
  g.computeVertexNormals()
  const nor = g.attributes.normal!
  const sum = new Map<string, Vector3>()
  const keys: string[] = []
  for (let i = 0; i < pos.count; i++) {
    const k = weldKey(pos.getX(i), pos.getY(i), pos.getZ(i))
    keys.push(k)
    const v = sum.get(k) ?? new Vector3()
    v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i)
    sum.set(k, v)
  }
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(keys[i]!)!.clone().normalize()
    nor.setXYZ(i, v.x, v.y, v.z)
  }
  const top = new Color(ROCK_TOP)
  const foot = new Color(ROCK_FOOT)
  return paintBy(g, (_x, y) => (y > 0.05 ? top : foot.clone().lerp(top, Math.max(0, 1 + y / 1.6))))
}

/** One island at the origin, `s` across: its rock, a deck on it, what stands there. */
const island = (p: Parts, lamps: Parts, { size: s, kind, seed }: Island): void => {
  const { lit, glow } = p
  const top = 0.1 * s * 0.55
  lit.push(xform(islandRock(seed), [0, 0, 0], [0, seed, 0], [s, s * 0.55, s * 0.85]))
  // A paved deck on the rock's flat top, and the hover ring under it.
  lit.push(at(rcyl(s * 0.42, 0.6, 0.15, 6, 2), BUILT_DARK, [0, top + 0.2, 0], [0, seed * 0.3, 0]))
  glow.push(at(torus(s * 0.22, s * 0.012, 5, 28), PAL.glowCyan, [0, -s * 0.62, 0], [Math.PI / 2, 0, 0]))
  // Rock hanging from the underside.
  for (let i = 0; i < 3; i++) {
    const a = seed + i * 2.1
    lit.push(at(rcone(s * 0.12, s * 0.02, s * 0.45, 0.05, 7), ROCK_FOOT, [Math.cos(a) * s * 0.35, -s * 0.5, Math.sin(a) * s * 0.3], [Math.PI, 0, 0]))
  }
  // What stands on the deck stands 10 cm into it.
  const deck = top + 0.4
  const lamp = (x: number, y: number, z: number, r: number): void => { lamps.glow.push(at(sph(r, 8, 6), PAL.glowRed, [x, y, z])) }
  if (kind === 'hangar') {
    lit.push(at(rbox(s * 0.5, s * 0.16, s * 0.34, 0.3, 10, 8), BUILT, [0, deck + s * 0.08, 0]))
    lit.push(at(rcyl(s * 0.17, s * 0.46, 0.3, 16, 2), BUILT_DARK, [0, deck + s * 0.16, 0], [0, 0, Math.PI / 2], [1, 1, 0.9]))
    glow.push(at(rbox(s * 0.3, s * 0.1, 0.3, 0.3, 6, 4), PAL.glowYellow, [0, deck + s * 0.07, s * 0.17 + 0.1]))
    lit.push(at(rcyl(0.25, s * 0.5, 0.05, 6, 1), BUILT_DARK, [s * 0.3, deck + s * 0.25, -s * 0.1]))
    lamp(s * 0.3, deck + s * 0.5 + 0.4, -s * 0.1, 0.55)
  } else if (kind === 'spires') {
    for (const [x, z, h] of [[0, 0, 0.75], [s * 0.18, s * 0.1, 0.5], [-s * 0.16, s * 0.06, 0.42]] as const) {
      lit.push(at(rcone(s * 0.09, s * 0.02, s * h, 0.1, 8), BUILT, [x, deck + (s * h) / 2, z]))
      glow.push(at(sph(s * 0.025, 6, 5), PAL.glowPink, [x, deck + s * h + s * 0.01, z]))
    }
  } else if (kind === 'mast') {
    lit.push(at(rcyl(s * 0.04, s * 0.95, 0.05, 8, 1), BUILT_DARK, [0, deck + s * 0.475, 0]))
    for (const y of [0.35, 0.6, 0.82]) lit.push(rod([-s * 0.14, deck + s * y, 0], [s * 0.14, deck + s * y, 0], s * 0.012, BUILT, 6))
    lit.push(at(rcone(s * 0.05, s * 0.16, s * 0.06, 0.05, 12), BUILT, [s * 0.04, deck + s * 0.7, 0], [0, 0, -0.9]))
    lit.push(at(rbox(s * 0.2, s * 0.12, s * 0.16, 0.3, 6, 6), BUILT, [s * 0.2, deck + s * 0.06, s * 0.1]))
    lamp(0, deck + s * 0.97, 0, s * 0.03)
  } else if (kind === 'tower') {
    lit.push(at(rcyl(s * 0.11, s * 0.6, 0.2, 10, 2), BUILT, [0, deck + s * 0.3, 0]))
    for (const y of [0.25, 0.5]) lit.push(at(torus(s * 0.13, s * 0.02, 5, 16), BUILT_DARK, [0, deck + s * y, 0], [Math.PI / 2, 0, 0]))
    lit.push(at(rcone(s * 0.15, s * 0.04, s * 0.18, 0.1, 10), BUILT_DARK, [0, deck + s * 0.69, 0]))
    glow.push(at(rcyl(s * 0.12, s * 0.05, 0.01, 10, 1), PAL.glowCyan, [0, deck + s * 0.4, 0]))
    lamp(0, deck + s * 0.8, 0, s * 0.035)
  } else {
    // (Each block's foot a little lower than the last: no two in one plane.)
    const blocks = [[0, 0, 0.3, 0.32], [s * 0.2, s * 0.06, 0.18, 0.2], [-s * 0.2, -s * 0.04, 0.2, 0.16], [0.0, -s * 0.18, 0.24, 0.12]] as const
    blocks.forEach(([x, z, w, h], k) => {
      const foot = deck - 0.12 * k
      lit.push(at(rbox(s * w, s * h + 0.12 * k, s * w * 0.9, 0.3, 8, 8), BUILT, [x, foot + (s * h + 0.12 * k) / 2, z]))
    })
    lit.push(at(rcone(s * 0.07, s * 0.012, s * 0.4, 0.1, 8), BUILT_DARK, [0, deck + s * 0.32 + s * 0.2, 0]))
    for (const x of [-0.08, 0, 0.08]) glow.push(at(rbox(s * 0.04, s * 0.06, 0.4, 0.3, 4, 4), PAL.glowYellow, [s * x, deck + s * 0.2, s * 0.135 + 0.15]))
    lamp(0, deck + s * 0.72 + 0.3, 0, s * 0.02)
  }
}

/** Every island, placed (deck frame); `few` keeps the nearer four (a weak device). */
export const islandParts = (few = false): { parts: Parts; lamps: Parts } => {
  const parts = newParts()
  const lamps = newParts()
  for (const isl of few ? ISLANDS.slice(0, 4) : ISLANDS) {
    const p = newParts()
    const l = newParts()
    island(p, l, isl)
    for (const [from, to] of [[p, parts], [l, lamps]] as const) {
      for (const k of ['lit', 'fine', 'glow'] as const) for (const g of from[k]) to[k].push(xform(g, isl.at))
    }
  }
  return { parts, lamps }
}
