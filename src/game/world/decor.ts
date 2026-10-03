import { BufferGeometry, Group, Mesh } from 'three'
import { merge, paint, rbox, rcone, rcyl, rock, sph, torus, xform, type V3 } from '../models/kit'
import { toonVC, glowVC } from '../models/toon'
import type { Decor, DecorKind } from './fortress'

/**
 * ─── Dressing ────────────────────────────────────────────────────────────────
 *
 * What makes the fortress a scrapyard: heaps, cranes, pipes, tanks, cable
 * drums, floodlights. Every piece is built from the kit's ROUNDED solids
 * (`rbox`, `rcyl`): nothing here has a razor edge.
 *
 * No gameplay and no collision of its own. A prop that should stop the mech
 * (a scrap heap) is placed by the builder on a cell that does: `heap()` in
 * `fortress.ts` raises a cover block and tells the mesh builder to leave it
 * undrawn, because the heap draws over it.
 *
 * Every prop of a fortress is baked into TWO merged meshes, one lit and one
 * glowing, however many props there are: a base's worth costs two draw calls.
 */

const STEEL = '#8b86b8'
const STEEL_DARK = '#4f4985'
const STEEL_DEEP = '#39336a'
const RUST = '#b96b4d'
const RUST_DARK = '#8a4a37'
const TEAL = '#4fb2c4'
const YELLOW = '#e0b23c'
const RUBBER = '#2c2752'
const CYAN = '#5fe9ff'
const PINK = '#ff5fb7'
const WARN = '#ffd23f'
const RED = '#ff4060'

type Parts = { lit: BufferGeometry[]; glow: BufferGeometry[] }

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry =>
  paint(xform(g, p, r, s), color)
/** A small rounded block: the building brick of everything here. */
const block = (w: number, h: number, d: number, color: string, p: V3, r: V3 = [0, 0, 0], round = 0.3): BufferGeometry =>
  part(rbox(w, h, d, round, 6, 4), color, p, r)
const drum = (r: number, h: number, color: string, p: V3, rot: V3 = [0, 0, 0], segs = 10): BufferGeometry =>
  part(rcyl(r, h, Math.min(r, h / 2) * 0.25, segs, 2), color, p, rot)

/** The parts of one prop, around its own origin at the foot. */
const CAMO = '#5c7a5a'
const CAMO_DARK = '#3d5446'

const PARTS: Record<DecorKind, () => Parts> = {
  // A camo net on four poles, sagging to the ground at the back: a place to crouch.
  net: () => ({
    lit: [
      drum(0.06, 1.9, STEEL_DARK, [-0.85, 0.95, -0.85], [0, 0, 0], 6),
      drum(0.06, 1.9, STEEL_DARK, [0.85, 0.95, -0.85], [0, 0, 0], 6),
      drum(0.06, 1.5, STEEL_DARK, [-0.85, 0.75, 0.85], [0, 0, 0], 6),
      drum(0.06, 1.5, STEEL_DARK, [0.85, 0.75, 0.85], [0, 0, 0], 6),
      block(2.0, 0.08, 1.9, CAMO, [0, 1.75, 0], [0.18, 0, 0], 0.5),
      block(1.9, 1.3, 0.08, CAMO_DARK, [0, 1.05, -0.95], [-0.25, 0, 0], 0.5),
      block(0.5, 0.06, 0.5, CAMO_DARK, [-0.4, 1.83, -0.2], [0.18, 0.4, 0], 0.5),
      block(0.6, 0.06, 0.4, CAMO_DARK, [0.45, 1.72, 0.35], [0.18, -0.3, 0], 0.5)
    ],
    glow: []
  }),
  // A tangle of cable: loops and coils knee to chest high.
  tangle: () => ({
    lit: [
      part(torus(0.55, 0.07, 5, 12), RUBBER, [-0.3, 0.6, 0], [0.4, 0.3, 0]),
      part(torus(0.5, 0.07, 5, 12), RUBBER, [0.35, 0.8, 0.2], [1.2, -0.4, 0.3]),
      part(torus(0.45, 0.06, 5, 12), '#3a3466', [0, 1.1, -0.3], [0.2, 1.1, 0.5]),
      part(torus(0.6, 0.06, 5, 12), '#3a3466', [0.1, 0.35, 0.3], [1.5, 0, 0]),
      drum(0.08, 1.6, RUBBER, [0.2, 0.7, -0.4], [0.9, 0.3, 0.6], 6),
      drum(0.08, 1.4, RUBBER, [-0.5, 0.9, 0.3], [0.2, 0.8, 1.2], 6)
    ],
    glow: [part(sph(0.07, 6, 5), WARN, [0.4, 1.2, 0.1])]
  }),
  // A railing on a ledge's open edge.
  rail: () => ({
    lit: [
      drum(0.05, 1.1, STEEL_DARK, [-0.9, 0.55, 0.85], [0, 0, 0], 6),
      drum(0.05, 1.1, STEEL_DARK, [0.9, 0.55, 0.85], [0, 0, 0], 6),
      drum(0.045, 2.0, STEEL, [0, 1.08, 0.85], [0, 0, Math.PI / 2], 6),
      drum(0.035, 2.0, STEEL, [0, 0.6, 0.85], [0, 0, Math.PI / 2], 6)
    ],
    glow: []
  }),
  // A floodlight on a bent post.
  lamp: () => ({
    lit: [
      drum(0.09, 3.3, STEEL_DARK, [0, 1.65, 0], [0, 0, 0], 8),
      drum(0.2, 0.16, STEEL_DEEP, [0, 0.08, 0]),
      block(0.12, 0.12, 0.7, STEEL_DARK, [0, 3.3, 0.28]),
      block(0.5, 0.2, 0.36, STEEL, [0, 3.2, 0.62], [0.5, 0, 0])
    ],
    glow: [part(rbox(0.4, 0.05, 0.28, 0.4, 6, 4), CYAN, [0, 3.09, 0.67], [0.5, 0, 0])]
  }),
  antenna: () => ({
    lit: [
      drum(0.07, 4.6, STEEL_DARK, [0, 2.3, 0], [0, 0, 0], 8),
      drum(0.26, 0.2, STEEL_DEEP, [0, 0.1, 0]),
      drum(0.5, 0.08, STEEL, [0, 2.6, 0], [0.5, 0, 0], 12),
      drum(0.32, 0.08, STEEL, [0, 3.6, 0], [0.5, 0.8, 0], 12)
    ],
    glow: [part(sph(0.13, 8, 6), PINK, [0, 4.68, 0])]
  }),
  barrel: () => ({
    lit: [
      drum(0.42, 1.05, '#9a6ad0', [0, 0.525, 0], [0, 0, 0], 12),
      part(torus(0.43, 0.035, 5, 14), STEEL_DEEP, [0, 0.3, 0], [Math.PI / 2, 0, 0]),
      part(torus(0.43, 0.035, 5, 14), STEEL_DEEP, [0, 0.8, 0], [Math.PI / 2, 0, 0])
    ],
    glow: [block(0.3, 0.3, 0.03, WARN, [0, 0.55, 0.42])]
  }),
  flag: () => ({
    lit: [drum(0.05, 3.4, STEEL_DARK, [0, 1.7, 0], [0, 0, 0], 6), drum(0.16, 0.12, STEEL_DEEP, [0, 0.06, 0], [0, 0, 0], 8)],
    glow: [part(rcone(0.42, 0.02, 1.2, 0.02, 3), PINK, [0.55, 2.9, 0], [0, 0, -Math.PI / 2], [1, 1, 0.08])]
  }),
  // A solid heap of scrap, a cell wide: a mound, plates, a pipe or two.
  heap: () => ({
    lit: [
      part(rock(1.05, 11, 9, 6), STEEL_DEEP, [0, 0.5, 0], [0, 0, 0], [1, 1.0, 1]),
      part(rock(0.7, 23, 8, 5), RUST_DARK, [0.25, 0.95, -0.1], [0, 0.6, 0], [1, 0.85, 1]),
      block(1.0, 0.12, 0.8, STEEL, [-0.25, 1.2, 0.1], [0.5, 0.3, 0.2], 0.2),
      block(0.7, 0.1, 0.8, RUST, [0.35, 0.95, -0.2], [-0.4, 1.1, 0.3], 0.2),
      block(0.5, 0.5, 0.5, TEAL, [0.1, 1.42, 0.25], [0.6, 0.4, 0.2]),
      block(0.4, 0.4, 0.4, RUST_DARK, [-0.55, 0.62, -0.5], [0.3, 0.8, 0.5]),
      block(0.36, 0.36, 0.36, YELLOW, [0.6, 0.55, 0.55], [0.9, 0.2, 0.4]),
      block(0.5, 0.3, 0.34, STEEL_DARK, [-0.45, 0.72, 0.6], [0.2, 1.4, 0.7]),
      drum(0.09, 1.7, STEEL, [0.2, 0.95, -0.55], [1.1, 0.4, 0.5], 7),
      drum(0.07, 1.4, RUST, [-0.3, 1.2, -0.1], [0.4, 0.2, 1.2], 7),
      part(torus(0.3, 0.08, 5, 12), STEEL_DARK, [0.72, 0.42, -0.3], [1.2, 0.3, 0])
    ],
    glow: [part(sph(0.06, 6, 5), CYAN, [0.1, 1.5, 0.3])]
  }),
  tires: () => ({
    lit: [
      part(torus(0.36, 0.15, 6, 14), RUBBER, [0, 0.15, 0], [Math.PI / 2, 0, 0]),
      part(torus(0.36, 0.15, 6, 14), RUBBER, [0.04, 0.45, 0.02], [Math.PI / 2, 0, 0]),
      part(torus(0.36, 0.15, 6, 14), RUBBER, [-0.02, 0.75, -0.03], [Math.PI / 2, 0, 0]),
      part(torus(0.36, 0.15, 6, 14), RUBBER, [0.75, 0.42, 0.1], [0.25, 0.5, 0.3])
    ],
    glow: []
  }),
  pipes: () => ({
    lit: [
      drum(0.24, 2.4, STEEL, [-0.26, 0.24, 0], [Math.PI / 2, 0, 0]),
      drum(0.24, 2.4, RUST, [0.26, 0.24, 0], [Math.PI / 2, 0, 0]),
      drum(0.24, 2.4, STEEL_DARK, [0, 0.66, 0.1], [Math.PI / 2, 0, 0]),
      drum(0.17, 0.06, STEEL_DEEP, [-0.26, 0.24, 1.2], [Math.PI / 2, 0, 0], 8),
      drum(0.17, 0.06, STEEL_DEEP, [0.26, 0.24, 1.2], [Math.PI / 2, 0, 0], 8)
    ],
    glow: []
  }),
  // A gantry crane: four posts, a cab, a jib with its scrap magnet. The
  // tallest thing in the yard, and what a sniper finds the base by.
  crane: () => {
    const lit: BufferGeometry[] = []
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
      lit.push(block(0.16, 9.2, 0.16, STEEL_DARK, [x, 4.6, z], [0, 0, 0], 0.15))
    }
    for (let y = 1.2; y < 9; y += 1.9) {
      lit.push(block(1.16, 0.1, 0.1, STEEL, [0, y, -0.5]), block(1.16, 0.1, 0.1, STEEL, [0, y, 0.5]))
      lit.push(block(0.1, 0.1, 1.16, STEEL, [-0.5, y, 0]), block(0.1, 0.1, 1.16, STEEL, [0.5, y, 0]))
      lit.push(block(1.5, 0.08, 0.08, RUST, [0, y + 0.95, 0.5], [0, 0, 0.9]))
    }
    lit.push(
      block(1.5, 1.1, 1.5, YELLOW, [0, 9.75, 0], [0, 0, 0], 0.25),
      block(1.1, 0.5, 0.2, STEEL_DEEP, [0, 9.85, 0.72]),
      block(0.34, 0.34, 9.5, STEEL_DARK, [0, 10.5, 3.2], [0, 0, 0], 0.2),
      block(1.0, 0.8, 1.2, STEEL_DEEP, [0, 10.4, -2.0]),
      drum(0.03, 3.6, STEEL_DEEP, [0, 8.6, 7.2], [0, 0, 0], 5),
      drum(0.5, 0.24, STEEL_DARK, [0, 6.7, 7.2], [0, 0, 0], 12),
      block(0.66, 0.6, 0.66, RUST, [0.05, 6.24, 7.2], [0.2, 0.5, 0.1])
    )
    return { lit, glow: [part(sph(0.12, 6, 5), RED, [0, 10.95, 7.9]), part(sph(0.12, 6, 5), RED, [0, 10.45, 0])] }
  },
  generator: () => ({
    lit: [
      block(1.5, 1.1, 1.0, STEEL, [0, 0.6, 0], [0, 0, 0], 0.22),
      block(1.6, 0.12, 1.1, STEEL_DEEP, [0, 0.06, 0]),
      block(0.5, 0.5, 0.06, STEEL_DEEP, [-0.4, 0.66, 0.5]),
      block(1.3, 0.12, 0.06, WARN, [0, 0.2, 0.51]),
      drum(0.11, 0.9, STEEL_DARK, [0.5, 1.5, -0.25], [0, 0, 0], 8),
      part(rcone(0.11, 0.17, 0.2, 0.02, 8), STEEL_DEEP, [0.5, 2.0, -0.25])
    ],
    glow: [
      block(0.34, 0.06, 0.03, CYAN, [0.35, 0.82, 0.51]),
      block(0.34, 0.06, 0.03, CYAN, [0.35, 0.68, 0.51]),
      block(0.34, 0.06, 0.03, CYAN, [0.35, 0.54, 0.51])
    ]
  }),
  // I-beams left leaning against something.
  girder: () => ({
    lit: [
      block(0.26, 3.6, 0.2, RUST, [0.1, 1.7, 0.55], [-0.3, 0, 0], 0.15),
      block(0.26, 3.2, 0.2, STEEL_DARK, [-0.25, 1.5, 0.5], [-0.34, 0.1, 0], 0.15),
      block(0.26, 2.6, 0.2, RUST_DARK, [0.5, 0.14, 0.2], [Math.PI / 2, 0.4, 0], 0.15)
    ],
    glow: []
  }),
  tank: () => ({
    lit: [
      drum(0.72, 2.5, STEEL, [0, 0.98, 0], [Math.PI / 2, 0, 0], 14),
      block(1.2, 0.5, 0.3, STEEL_DEEP, [0, 0.25, -0.8]),
      block(1.2, 0.5, 0.3, STEEL_DEEP, [0, 0.25, 0.8]),
      part(torus(0.73, 0.05, 5, 16), WARN, [0, 0.98, 0.35]),
      part(torus(0.73, 0.05, 5, 16), RUST, [0, 0.98, -0.5]),
      drum(0.12, 0.34, STEEL_DARK, [0, 1.84, 0.2], [0, 0, 0], 8)
    ],
    glow: [part(sph(0.07, 6, 5), CYAN, [0, 2.05, 0.2])]
  }),
  // A cable drum, on its side.
  spool: () => ({
    lit: [
      drum(0.75, 0.1, RUST_DARK, [-0.4, 0.75, 0], [0, 0, Math.PI / 2], 14),
      drum(0.75, 0.1, RUST_DARK, [0.4, 0.75, 0], [0, 0, Math.PI / 2], 14),
      drum(0.36, 0.72, STEEL_DEEP, [0, 0.75, 0], [0, 0, Math.PI / 2], 12)
    ],
    glow: []
  }),
  // A vent stack, with the furnace light in its mouth.
  stack: () => ({
    lit: [
      drum(0.34, 4.4, STEEL_DARK, [0, 2.2, 0], [0, 0, 0], 12),
      drum(0.44, 0.3, STEEL_DEEP, [0, 0.15, 0], [0, 0, 0], 12),
      part(torus(0.36, 0.06, 5, 14), RUST, [0, 3.0, 0], [Math.PI / 2, 0, 0]),
      part(rcone(0.34, 0.46, 0.4, 0.03, 12), STEEL_DEEP, [0, 4.6, 0])
    ],
    glow: [drum(0.3, 0.05, PINK, [0, 4.78, 0], [0, 0, 0], 12)]
  }),
  cone: () => ({
    lit: [part(rcone(0.2, 0.04, 0.56, 0.02, 8), '#ff8a4a', [0, 0.3, 0]), block(0.46, 0.05, 0.46, STEEL_DEEP, [0, 0.03, 0])],
    glow: [part(torus(0.12, 0.03, 4, 10), '#ffffff', [0, 0.34, 0], [Math.PI / 2, 0, 0])]
  })
}

export interface DecorMesh {
  group: Group
  dispose(): void
}

export const buildDecor = (decor: readonly Decor[]): DecorMesh => {
  const group = new Group()
  group.name = 'decor'
  const lit: BufferGeometry[] = []
  const glow: BufferGeometry[] = []
  for (const d of decor) {
    const parts = PARTS[d.kind]()
    for (const g of parts.lit) lit.push(xform(g, [d.x, d.y, d.z], [0, d.rot, 0]))
    for (const g of parts.glow) glow.push(xform(g, [d.x, d.y, d.z], [0, d.rot, 0]))
  }
  const geos: BufferGeometry[] = []
  if (lit.length > 0) {
    const g = merge(lit)
    geos.push(g)
    const m = new Mesh(g, toonVC())
    m.matrixAutoUpdate = false
    group.add(m)
  }
  if (glow.length > 0) {
    const g = merge(glow)
    geos.push(g)
    const m = new Mesh(g, glowVC())
    m.matrixAutoUpdate = false
    group.add(m)
  }
  for (const g of [...lit, ...glow]) g.dispose()
  return {
    group,
    dispose: () => {
      for (const g of geos) g.dispose()
      group.clear()
    }
  }
}
