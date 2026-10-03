import { BufferGeometry, Group, Mesh } from 'three'
import { merge, paint, rbox, rcyl, xform, type V3 } from './kit'
import { glowVC, toonVC } from './toon'

/**
 * ─── The hide box ────────────────────────────────────────────────────────────
 *
 * A dented scrapyard crate the mech pulls down over itself: riveted steel
 * panels, a lifting ring on the lid, a hazard stripe, and two narrow slits
 * the mech peers out of (they glow, faintly: the box is looking back). Big
 * enough to cover a crouched mech; its feet show under the rim when it
 * creeps. Origin at the bottom middle; faces +z.
 */

const STEEL = '#7d77ad'
const STEEL_DARK = '#4a4482'
const RIM = '#5d5799'
const HAZARD = '#ffd23f'
const INK = '#241848'
const SLIT = '#5fe9ff'

export const BOX_W = 2.0
export const BOX_H = 1.75
/** The rim stands this far off the floor: the feet show under it. */
export const BOX_LIFT = 0.28

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0]): BufferGeometry => paint(xform(g, p, r), color)

export const buildHideBox = (): Group => {
  const h = BOX_H
  const w = BOX_W
  const lit: BufferGeometry[] = [
    // The shell, with a slightly dented lid.
    part(rbox(w, h, w, 0.12, 6, 6), STEEL, [0, h / 2, 0]),
    part(rbox(w * 0.96, 0.1, w * 0.96, 0.4, 6, 3), STEEL_DARK, [0, h + 0.02, 0], [0.03, 0, -0.02]),
    // Corner posts and a rim at the foot.
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      part(rbox(0.16, h + 0.04, 0.16, 0.4, 4, 4), RIM, [sx! * (w / 2 - 0.04), h / 2, sz! * (w / 2 - 0.04)])),
    part(rbox(w + 0.06, 0.12, w + 0.06, 0.3, 6, 3), RIM, [0, 0.06, 0]),
    // A dark band behind the slits.
    part(rbox(w * 0.72, 0.28, 0.04, 0.4, 4, 3), INK, [0, h * 0.72, w / 2 + 0.01]),
    // The lifting ring on the lid.
    part(rcyl(0.12, 0.06, 0.02, 10, 1), STEEL_DARK, [0, h + 0.1, 0]),
    part(rbox(0.36, 0.06, 0.08, 0.4, 4, 3), STEEL_DARK, [0, h + 0.2, 0])
  ]
  // A hazard band round its middle, on every face: yellow and ink in turns.
  const SEG = 7
  for (let face = 0; face < 4; face++) {
    const r = (face * Math.PI) / 2
    for (let i = 0; i < SEG; i++) {
      const along = -w / 2 + 0.16 + ((w - 0.32) * (i + 0.5)) / SEG
      const nx = Math.sin(r) * (w / 2 + 0.015)
      const nz = Math.cos(r) * (w / 2 + 0.015)
      const tx = Math.cos(r) * along
      const tz = -Math.sin(r) * along
      lit.push(part(rbox((w - 0.32) / SEG + 0.005, 0.18, 0.03, 0.2, 3, 2), i % 2 ? INK : HAZARD, [nx + tx, h * 0.38, nz + tz], [0, r, 0]))
    }
    // Rivets at the band's ends.
    for (const sgn of [-1, 1]) {
      const a = sgn * (w / 2 - 0.2)
      lit.push(part(rbox(0.07, 0.07, 0.04, 0.5, 3, 3), STEEL_DARK, [Math.sin(r) * (w / 2 + 0.02) + Math.cos(r) * a, h * 0.6, Math.cos(r) * (w / 2 + 0.02) - Math.sin(r) * a], [0, r, 0]))
    }
  }
  const glow: BufferGeometry[] = [
    // The slits: two little eyes, a touch sleepy.
    part(rbox(0.38, 0.07, 0.04, 0.45, 4, 3), SLIT, [-0.32, h * 0.72, w / 2 + 0.03], [0, 0, 0.12]),
    part(rbox(0.38, 0.07, 0.04, 0.45, 4, 3), SLIT, [0.32, h * 0.72, w / 2 + 0.03], [0, 0, -0.12])
  ]
  const group = new Group()
  group.name = 'hide-box'
  const a = merge(lit)
  const b = merge(glow)
  for (const g of [...lit, ...glow]) g.dispose()
  const shell = new Mesh(a, toonVC())
  shell.position.y = BOX_LIFT
  const eyes = new Mesh(b, glowVC())
  eyes.position.y = BOX_LIFT
  group.add(shell, eyes)
  group.visible = false
  return group
}

export const disposeHideBox = (g: Group): void => {
  for (const c of g.children) (c as Mesh).geometry.dispose()
}
