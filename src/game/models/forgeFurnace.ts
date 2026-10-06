import { rbox, rcone, rcyl, sph, torus, type V3 } from './kit'
import { PAL } from './palette'
import { at, beam, newParts, rod, type Parts } from './propKit'

/**
 * ─── The Forge's furnace ─────────────────────────────────────────────────────
 *
 * Where the Forge melts the haul and builds the weapon tiers: an arc
 * crucible caged in steel staves (its molten core shows between them), a
 * hood and a finned chimney, a spout pouring into an ingot mould, a heat
 * exchanger with glowing vents piped into the stack, a hydraulic press with
 * a hot billet on its die, and a tool rack (tongs, hammer, wrench).
 *
 * The molten parts (core, stream, pool, billet, the stack's glow) are their
 * own list, `furnaceCoreParts`, so the scene can pulse their glow. Origin at
 * the foot; faces +z.
 */

const STEEL = '#5a4f9a'
const STEEL_DARK = '#3d3478'
const IRON = '#2e2560'
const INK = '#241848'
const COPPER = '#c27a5a'
const HOT = '#ff8a2e'
const MOLTEN = '#ffb347'
const WHITE_HOT = '#fff1b0'

/** The crucible's centre, and the top of the stack (where embers leave). */
const CRUCIBLE: [number, number] = [-0.45, -0.1]
export const FURNACE_STACK_TOP: V3 = [CRUCIBLE[0], 3.3, CRUCIBLE[1]]

export const furnaceParts = (): Parts => {
  const p = newParts()
  const { lit, fine, glow } = p
  const [cx, cz] = CRUCIBLE

  // ── The plinth it stands on, hazard striped along the front ──
  lit.push(at(rbox(3.2, 0.14, 2.3, 0.2, 14, 6), IRON, [0.17, 0.05, 0.2]))
  for (let i = 0; i < 7; i++) lit.push(at(rbox(0.26, 0.03, 0.07, 0.3, 4, 4), i % 2 ? INK : PAL.hazard, [-1.2 + i * 0.4 + 0.17, 0.125, 1.3]))

  // ── The crucible: a base ring, ten staves round the core, collars, a hood, the stack ──
  lit.push(at(rcyl(0.85, 0.25, 0.06, 22, 2), STEEL_DARK, [cx, 0.235, cz]))
  for (let k = 0; k < 10; k++) {
    const a = ((k + 0.5) / 10) * Math.PI * 2
    lit.push(at(rbox(0.16, 1.22, 0.14, 0.3, 6, 8), STEEL, [cx + Math.sin(a) * 0.7, 0.95, cz + Math.cos(a) * 0.7], [0, a, 0]))
  }
  for (const [y, r] of [[0.42, 0.07], [1.48, 0.07], [0.95, 0.04]] as const) lit.push(at(torus(0.75, r, 6, 32), IRON, [cx, y, cz], [Math.PI / 2, 0, 0]))
  lit.push(at(rcone(0.95, 0.45, 0.5, 0.05, 22), STEEL_DARK, [cx, 1.8, cz]))
  lit.push(at(torus(0.83, 0.06, 6, 32), IRON, [cx, 1.57, cz], [Math.PI / 2, 0, 0]))
  lit.push(at(rcyl(0.26, 1.3, 0.04, 14, 2), STEEL, [cx, 2.62, cz]))
  for (const y of [2.3, 2.55, 2.8, 3.05]) lit.push(at(torus(0.3, 0.035, 5, 18), STEEL_DARK, [cx, y, cz], [Math.PI / 2, 0, 0]))
  lit.push(at(torus(0.27, 0.05, 6, 18), IRON, [cx, 3.27, cz], [Math.PI / 2, 0, 0]))
  // Electrodes down through the hood (an arc furnace), their clamps lit.
  for (const s of [-1, 1]) {
    lit.push(rod([cx + s * 0.32, 1.7, cz + 0.12], [cx + s * 0.46, 2.55, cz + 0.2], 0.06, COPPER, 8))
    glow.push(at(sph(0.07, 6, 5), PAL.glowCyan, [cx + s * 0.46, 2.6, cz + 0.2]))
  }
  // The spout, out over the front, and the mould under it.
  lit.push(beam([cx, 1.4, cz + 0.62], [cx, 1.27, cz + 1.12], 0.2, 0.14, STEEL_DARK))
  lit.push(at(rbox(0.62, 0.2, 0.42, 0.25, 8, 6), IRON, [cx, 0.3, cz + 1.13]))
  lit.push(at(rbox(0.7, 0.05, 0.5, 0.3, 8, 4), STEEL_DARK, [cx, 0.18, cz + 1.13]))

  // ── The heat exchanger behind, its vents glowing, piped into the stack ──
  const hx = 0.82
  const hz = -0.6
  lit.push(at(rbox(0.8, 1.3, 0.66, 0.2, 10, 10), STEEL_DARK, [hx, 0.77, hz]))
  for (let i = 0; i < 5; i++) {
    const y = 0.45 + i * 0.16
    fine.push(at(rbox(0.6, 0.035, 0.05, 0.3, 6, 4), INK, [hx, y + 0.04, hz + 0.355]))
    glow.push(at(rbox(0.56, 0.05, 0.03, 0.3, 6, 4), HOT, [hx, y, hz + 0.335]))
  }
  glow.push(at(sph(0.08, 8, 6), PAL.glowYellow, [hx + 0.25, 1.46, hz + 0.2]))
  lit.push(at(rcyl(0.11, 0.12, 0.03, 10, 2), STEEL, [hx + 0.25, 1.4, hz + 0.2]))
  // The big pipe: up out of it, over, and into the stack; flanges at the joints.
  lit.push(rod([hx - 0.15, 1.38, hz], [hx - 0.15, 2.45, hz], 0.1, COPPER, 10))
  lit.push(at(sph(0.13, 10, 8), COPPER, [hx - 0.15, 2.45, hz]))
  lit.push(rod([hx - 0.15, 2.45, hz], [cx + 0.2, 2.45, cz - 0.12], 0.1, COPPER, 10))
  for (const [x, y, z, r] of [[hx - 0.15, 1.5, hz, 0], [hx - 0.15, 2.2, hz, 0]] as const) lit.push(at(torus(0.12, 0.03, 5, 14), IRON, [x, y, z], [Math.PI / 2, 0, r]))
  // Two coolant lines low down into the crucible's base.
  for (const y of [0.3, 0.5]) lit.push(rod([hx - 0.4, y, hz + 0.1], [cx + 0.6, y, cz - 0.2], 0.05, STEEL, 8))

  // ── The press, at the front right: anvil and die, two columns, crosshead, ram ──
  const px = 0.9
  const pz = 0.45
  lit.push(at(rbox(0.76, 0.42, 0.6, 0.2, 10, 8), IRON, [px, 0.33, pz]))
  lit.push(at(rbox(0.5, 0.1, 0.4, 0.25, 8, 4), STEEL, [px, 0.58, pz]))
  for (const s of [-1, 1]) {
    lit.push(at(rcyl(0.065, 1.42, 0.02, 10, 1), PAL.steel, [px + s * 0.3, 1.25, pz]))
    lit.push(at(rcyl(0.09, 0.1, 0.02, 10, 1), STEEL_DARK, [px + s * 0.3, 0.62, pz]))
  }
  lit.push(at(rbox(0.86, 0.24, 0.36, 0.2, 10, 6), STEEL_DARK, [px, 1.96, pz]))
  for (let i = 0; i < 4; i++) lit.push(at(rbox(0.16, 0.12, 0.03, 0.3, 4, 4), i % 2 ? INK : PAL.hazard, [px - 0.3 + i * 0.2, 1.96, pz + 0.19]))
  lit.push(at(rcyl(0.12, 0.6, 0.02, 12, 1), PAL.steel, [px, 1.55, pz]))
  lit.push(at(rbox(0.42, 0.12, 0.3, 0.25, 8, 4), STEEL, [px, 1.2, pz]))
  lit.push(at(rcyl(0.16, 0.3, 0.04, 12, 2), STEEL, [px, 2.22, pz]))

  // ── The tool rack on the right end: a pegboard, tongs, a hammer, a wrench ──
  const tx = 1.62
  for (const z of [-0.4, 0.3]) lit.push(at(rcyl(0.04, 1.55, 0.015, 8, 1), STEEL, [tx, 0.88, z]))
  lit.push(rod([tx, 1.62, -0.45], [tx, 1.62, 0.35], 0.035, STEEL_DARK))
  lit.push(at(rbox(0.04, 1.0, 0.66, 0.3, 4, 8), INK, [tx - 0.04, 1.05, -0.05]))
  // Tongs: two long jaws crossed at a pin.
  lit.push(rod([tx + 0.06, 1.55, -0.27], [tx + 0.06, 0.82, -0.15], 0.018, PAL.steel, 6))
  lit.push(rod([tx + 0.1, 1.55, -0.15], [tx + 0.1, 0.82, -0.27], 0.018, PAL.steel, 6))
  fine.push(at(sph(0.03, 6, 4), INK, [tx + 0.08, 1.19, -0.21]))
  // A hammer and a wrench.
  lit.push(rod([tx + 0.07, 1.55, 0.03], [tx + 0.07, 0.9, 0.03], 0.025, COPPER, 6))
  lit.push(at(rbox(0.12, 0.13, 0.3, 0.3, 6, 6), STEEL_DARK, [tx + 0.07, 0.9, 0.03]))
  lit.push(rod([tx + 0.07, 1.55, 0.23], [tx + 0.07, 1.05, 0.23], 0.022, PAL.steel, 6))
  lit.push(at(torus(0.07, 0.025, 5, 12, Math.PI * 1.5), PAL.steel, [tx + 0.07, 0.99, 0.23], [0, Math.PI / 2, Math.PI * 0.75]))
  for (const z of [-0.21, 0.03, 0.23]) fine.push(at(sph(0.025, 6, 4), STEEL_DARK, [tx + 0.0, 1.58, z]))
  return p
}

/** The molten parts: their own mesh, so their glow can pulse. */
export const furnaceCoreParts = (): Parts => {
  const p = newParts()
  const [cx, cz] = CRUCIBLE
  p.glow.push(at(rcyl(0.62, 1.15, 0.1, 22, 2), MOLTEN, [cx, 0.95, cz]))
  p.glow.push(rod([cx, 1.26, cz + 1.13], [cx, 0.42, cz + 1.13], 0.045, WHITE_HOT, 8))
  p.glow.push(at(rbox(0.48, 0.03, 0.28, 0.3, 6, 4), MOLTEN, [cx, 0.405, cz + 1.13]))
  p.glow.push(at(rbox(0.34, 0.08, 0.16, 0.3, 6, 4), HOT, [0.9, 0.665, 0.45]))
  p.glow.push(at(torus(0.2, 0.04, 5, 16), HOT, [cx, 3.27, cz], [Math.PI / 2, 0, 0]))
  return p
}
