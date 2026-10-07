import type { BufferGeometry } from 'three'
import { cap, merge, paint, rbox, rcyl, sph, torus, xform, type V3 } from './kit'

/**
 * ─── What lies about in a fortress (#76, #78, #101) ──────────────────────────
 *
 * Built in code from the rig kit's rounded solids, flat colours, an outline's
 * worth of chunkiness. Each returns the lit part and the glowing part as one
 * geometry apiece, so a whole fortress's worth is two instanced draws per
 * kind. Origins at the bottom middle.
 */

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0]): BufferGeometry => paint(xform(g, p, r), color)
const done = (lit: BufferGeometry[], glow: BufferGeometry[]): { lit: BufferGeometry; glow: BufferGeometry } => {
  const out = { lit: merge(lit), glow: merge(glow) }
  for (const g of [...lit, ...glow]) g.dispose()
  return out
}

/**
 * A repair kit (#101): a fat spanner crossed over a screwdriver on a little
 * steel plate, a handful of bolts and screws round it, a green cross that
 * glows. Readable from the perch as "health".
 */
export const buildRepairKit = (): { lit: BufferGeometry; glow: BufferGeometry } => {
  const STEEL = '#c9c4e6'
  const DARK = '#5d5799'
  const HANDLE = '#ff8a3d'
  const lit: BufferGeometry[] = [
    part(rbox(0.86, 0.08, 0.62, 0.4, 6, 3), DARK, [0, 0.04, 0]),
    // The spanner: a shaft with an open jaw at each end.
    part(rbox(0.7, 0.07, 0.11, 0.4, 6, 3), STEEL, [0, 0.14, 0], [0, 0.55, 0]),
    part(torus(0.1, 0.035, 6, 10, Math.PI * 1.5), STEEL, [0.3, 0.14, -0.18], [Math.PI / 2, 0, 0.6]),
    part(torus(0.08, 0.03, 6, 10, Math.PI * 1.5), STEEL, [-0.3, 0.14, 0.18], [Math.PI / 2, 0, 3.7]),
    // The screwdriver across it.
    part(rcyl(0.055, 0.3, 0.02, 8, 1), HANDLE, [-0.12, 0.17, -0.2], [0, 0, Math.PI / 2 - 0.6]),
    part(cap(0.018, 0.34, 6, 2), STEEL, [0.14, 0.17, 0.04], [0, 0, Math.PI / 2 - 0.6]),
    // Bolts and screws.
    ...[[0.32, 0.18], [-0.34, -0.16], [0.18, 0.24], [-0.2, 0.22], [0.36, -0.06]].map(([x, z], i) =>
      part(rcyl(0.04, 0.05, 0.01, 6, 1), i % 2 ? STEEL : DARK, [x!, 0.105, z!]))
  ]
  const glow: BufferGeometry[] = [
    part(rbox(0.26, 0.04, 0.08, 0.3, 3, 2), '#5dff9a', [0, 0.36, 0]),
    part(rbox(0.08, 0.04, 0.26, 0.3, 3, 2), '#5dff9a', [0, 0.36, 0])
  ]
  return done(lit, glow)
}

/**
 * An ammo crate (#76): an olive steel box with a lid, stencilled bands and
 * rounds showing at the top, a glowing tag on the front.
 */
export const buildAmmoCrate = (): { lit: BufferGeometry; glow: BufferGeometry } => {
  const BOX = '#5f6b3a'
  const BAND = '#3b4422'
  const BRASS = '#e8c35a'
  const lit: BufferGeometry[] = [
    part(rbox(1.0, 0.56, 0.62, 0.2, 6, 4), BOX, [0, 0.28, 0]),
    part(rbox(1.04, 0.08, 0.66, 0.4, 6, 3), BAND, [0, 0.6, 0]),
    part(rbox(1.02, 0.08, 0.64, 0.3, 6, 3), BAND, [0, 0.14, 0]),
    // Rounds standing in the open half of the lid.
    ...[-0.3, -0.18, -0.06, 0.06].map(x => part(cap(0.035, 0.16, 6, 2), BRASS, [x, 0.72, 0.1])),
    part(rbox(0.5, 0.06, 0.62, 0.3, 4, 3), BOX, [0.24, 0.68, 0], [0, 0, -0.25])
  ]
  const glow: BufferGeometry[] = [part(rbox(0.3, 0.12, 0.03, 0.3, 3, 2), '#ffd23f', [-0.18, 0.36, 0.32])]
  return done(lit, glow)
}

/**
 * What a fallen guard drops (#76, #183): rifle rounds, drawn as one big rifle
 * cartridge standing up, in the rifle's cyan with a brass case, so it reads
 * as the rifle's ammunition from across a yard.
 */
export const buildAmmoPouch = (): { lit: BufferGeometry; glow: BufferGeometry } => {
  const lit: BufferGeometry[] = [
    // The brass case, its rim, and a small dark base plate to stand on.
    part(cap(0.1, 0.34, 10, 3), '#e8c35a', [0, 0.28, 0]),
    part(rbox(0.26, 0.05, 0.26, 0.4, 6, 3), '#2f3a55', [0, 0.025, 0]),
    part(cap(0.108, 0.03, 10, 2), '#b8932f', [0, 0.11, 0])
  ]
  // The bullet: the rifle's cyan, glowing.
  const glow: BufferGeometry[] = [part(cap(0.075, 0.18, 10, 4), '#4de8ff', [0, 0.6, 0])]
  return done(lit, glow)
}

/**
 * An exploding barrel (#78): a red fuel drum standing on a low steel pallet
 * (it stands clear of the ground), two ribs, a yellow-and-black hazard band,
 * a filler cap, a flame sign that glows.
 */
export const buildFuelBarrel = (): { lit: BufferGeometry; glow: BufferGeometry } => {
  const RED = '#d8344a'
  const RED_DARK = '#9c1f33'
  const PALLET = '#4a4482'
  const lit: BufferGeometry[] = [
    // The pallet: two runners and a deck of slats.
    part(rbox(0.96, 0.08, 0.14, 0.3, 4, 2), PALLET, [0, 0.04, -0.3]),
    part(rbox(0.96, 0.08, 0.14, 0.3, 4, 2), PALLET, [0, 0.04, 0.3]),
    ...[-0.32, 0, 0.32].map(x => part(rbox(0.22, 0.05, 0.9, 0.3, 3, 2), PALLET, [x, 0.105, 0])),
    // The drum.
    part(rcyl(0.4, 1.05, 0.06, 16, 2), RED, [0, 0.13 + 0.525, 0]),
    part(torus(0.405, 0.03, 4, 18), RED_DARK, [0, 0.13 + 0.3, 0], [Math.PI / 2, 0, 0]),
    part(torus(0.405, 0.03, 4, 18), RED_DARK, [0, 0.13 + 0.78, 0], [Math.PI / 2, 0, 0]),
    part(rcyl(0.07, 0.06, 0.01, 8, 1), '#3b3654', [0.18, 0.13 + 1.07, 0.1])
  ]
  // The hazard band: yellow and black tiles round the drum's middle.
  const N = 12
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    lit.push(part(rbox(0.21, 0.16, 0.03, 0.2, 2, 2), i % 2 ? '#241848' : '#ffd23f', [Math.sin(a) * 0.41, 0.13 + 0.55, Math.cos(a) * 0.41], [0, a, 0]))
  }
  const glow: BufferGeometry[] = [
    // A flame sign on the front, above the band.
    part(rbox(0.16, 0.2, 0.02, 0.5, 3, 3), '#ffb061', [0, 0.13 + 0.86, 0.41])
  ]
  return done(lit, glow)
}
