import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three'
import { merge, paint, stripUv, xform, type V3 } from '../models/kit'
import { toonVC, glowVC } from '../models/toon'
import type { Decor, DecorKind } from './fortress'

/**
 * Dressing: lamps, antennas, barrels, flags. No gameplay, no collision.
 *
 * Every prop of a fortress is baked into TWO merged meshes, one lit and one
 * glowing, however many props there are: a base's worth of lamps costs two
 * draw calls, not two per lamp.
 */

const STEEL = '#6f63a8'
const STEEL_DARK = '#473a86'
const CYAN = '#5fe9ff'
const PINK = '#ff5fb7'
const WARN = '#ffd23f'

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry =>
  paint(xform(stripUv(g), p, r, s), color)

/** The parts of one prop, around its own origin at the foot. */
const PARTS: Record<DecorKind, () => { lit: BufferGeometry[]; glow: BufferGeometry[] }> = {
  lamp: () => ({
    lit: [
      part(new CylinderGeometry(0.09, 0.13, 3.2, 6), STEEL, [0, 1.6, 0]),
      part(new BoxGeometry(0.5, 0.12, 0.5), STEEL_DARK, [0, 3.3, 0])
    ],
    glow: [part(new SphereGeometry(0.2, 8, 6), CYAN, [0, 3.12, 0])]
  }),
  antenna: () => ({
    lit: [
      part(new CylinderGeometry(0.06, 0.16, 4.6, 6), STEEL, [0, 2.3, 0]),
      part(new CylinderGeometry(0.5, 0.5, 0.08, 10), STEEL_DARK, [0, 2.6, 0], [0.5, 0, 0]),
      part(new CylinderGeometry(0.32, 0.32, 0.08, 10), STEEL_DARK, [0, 3.6, 0], [0.5, 0.8, 0])
    ],
    glow: [part(new SphereGeometry(0.13, 8, 6), PINK, [0, 4.68, 0])]
  }),
  barrel: () => ({
    lit: [
      part(new CylinderGeometry(0.42, 0.42, 1.05, 10), '#b05ad8', [0, 0.525, 0]),
      part(new CylinderGeometry(0.45, 0.45, 0.1, 10), STEEL_DARK, [0, 0.3, 0]),
      part(new CylinderGeometry(0.45, 0.45, 0.1, 10), STEEL_DARK, [0, 0.8, 0])
    ],
    glow: [part(new BoxGeometry(0.3, 0.3, 0.02), WARN, [0, 0.55, 0.43])]
  }),
  flag: () => ({
    lit: [part(new CylinderGeometry(0.05, 0.07, 3.4, 6), STEEL, [0, 1.7, 0])],
    glow: [part(new ConeGeometry(0.42, 1.2, 3), PINK, [0.55, 2.9, 0], [0, 0, -Math.PI / 2], [1, 1, 0.08])]
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
