import { lathe, rbox, rcone, rcyl, sph, torus, xform, type V3 } from './kit'
import { PAL } from './palette'
import { at, beam, hexRing, newParts, rod, type Parts } from './propKit'
import { mulberry32 } from '../world/rng'

/**
 * ─── The Command Base's deck ─────────────────────────────────────────────────
 *
 * A floating hex platform, built in the camera's own frame (the camera looks
 * from +z; −z is behind the mech): a slab paved with hex plates and their
 * seams, some of them access hatches with bolts; the service pad in the
 * middle (a hex plinth, a lit rim, an inset disc with the pink ring, vents
 * round its apron, three maintenance arms reaching in); service lines with
 * an inset glow and a cable trench running out across the plates; a raised
 * terrace at the back for the stations, with steps up; the rim, hazard
 * striped at the open front, edge lights along it, guard rails round the
 * rest, two landing beacons; and under it all the hull of machinery it flies
 * on, two hover thrusters out at its sides.
 *
 * Every layer stands off the one under it by centimetres (plates 0, apron
 * −3 cm, rim +6 cm, rails and glow strips between): nothing shares a face.
 * The deck's plates are at y = 0; the scene lowers the whole deck by
 * `PAD_TOP` so the mech stands on the pad at its own y = 0.
 */

/** The hex's corner radius: corners at ±x, flat edges facing ±z. */
export const DECK_R = 10
/** The top of the pad's disc, where the mech stands, above the plates. */
export const PAD_TOP = 0.22
/** The terrace at the back: its top, and its front and back edges (z). */
export const TERRACE_TOP = 0.6
export const TERRACE_FRONT = -4.0
const TERRACE_BACK = -8.0
const TERRACE_HALF = 4.8

/** Where the stations stand on the terrace (deck frame), and which way they face. */
export const STATIONS = {
  furnace: { at: [-2.9, TERRACE_TOP, -5.9] as V3, yaw: 0.5 },
  lab: { at: [2.9, TERRACE_TOP, -5.9] as V3, yaw: -0.5 },
  shelf: { at: [0, TERRACE_TOP, -7.55] as V3, yaw: 0 }
} as const

const PLATE = '#6f63b8'
const PLATE_TINTS = ['#6f63b8', '#685cb0', '#7669c2', '#6c60b5']
const SEAM = '#2c2160'
const STEEL = '#5a4f9a'
const STEEL_DARK = '#3d3478'
const INK = '#241848'

/** The hex's own norm: < R inside a hex of corner radius R (corners at ±x). */
const hexNorm = (x: number, z: number): number => Math.max(Math.abs(z) * 2 / Math.sqrt(3), Math.abs(x) + Math.abs(z) / Math.sqrt(3))

/** The deck's six corners (k = 0 front-right … 5 front-left), at corner radius `r`. */
export const deckCorner = (k: number, r = DECK_R): [number, number] => {
  const a = Math.PI / 6 + (k * Math.PI) / 3
  return [Math.sin(a) * r, Math.cos(a) * r]
}

/** A service line: two rails with an inset glow between them; `cables` lays three cables in it instead. */
const serviceLine = (p: Parts, from: [number, number], to: [number, number], cables = false): void => {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const yaw = Math.atan2(dx, dz)
  const mx = (from[0] + to[0]) / 2
  const mz = (from[1] + to[1]) / 2
  const px = Math.cos(yaw)
  const pz = -Math.sin(yaw)
  for (const s of [-1, 1]) p.lit.push(at(rbox(0.1, 0.1, len, 0.25, 6, 4), STEEL_DARK, [mx + px * s * 0.17, -0.01, mz + pz * s * 0.17], [0, yaw, 0]))
  if (cables) {
    const cols = ['#2a1f55', '#5b3fa8', PAL.mechEye]
    const h = (len - 0.1) / 2
    for (let i = -1; i <= 1; i++) {
      const ox = mx + px * i * 0.072
      const oz = mz + pz * i * 0.072
      p.lit.push(rod([ox - Math.sin(yaw) * h, 0.0, oz - Math.cos(yaw) * h], [ox + Math.sin(yaw) * h, 0.0, oz + Math.cos(yaw) * h], 0.034, cols[i + 1]!, 7))
    }
  } else {
    p.glow.push(at(rbox(0.16, 0.03, len - 0.1, 0.3, 6, 4), PAL.glowCyan, [mx, 0.005, mz], [0, yaw, 0]))
  }
  // A junction box at the far end.
  p.lit.push(at(rbox(0.6, 0.22, 0.42, 0.3, 8, 6), STEEL, [to[0], 0.08, to[1]], [0, yaw, 0]))
  p.glow.push(at(sph(0.045, 6, 4), cables ? PAL.glowYellow : PAL.glowCyan, [to[0] + Math.sin(yaw) * -0.22, 0.13, to[1] + Math.cos(yaw) * -0.22]))
}

/** The service pad the mech stands on. */
const servicePad = (p: Parts): void => {
  const { lit, fine, glow } = p
  const turn: V3 = [0, Math.PI / 6, 0]
  // A hex plinth with a lit band round it, the inset disc and its pink ring.
  lit.push(at(rcyl(2.3, 0.26, 0.06, 6, 2), PLATE, [0, 0.06, 0], turn))
  glow.push(at(hexRing(2.31, 2.43, 0.0, 0.1), PAL.glowCyan))
  lit.push(at(rcyl(1.75, 0.06, 0.02, 36, 2), '#4a3f96', [0, PAD_TOP - 0.03, 0]))
  glow.push(at(torus(1.48, 0.026, 6, 64), PAL.glowPink, [0, PAD_TOP, 0], [Math.PI / 2, 0, 0]))
  // Bolts round the plinth's top, just inside its edge.
  for (let k = 0; k < 6; k++) {
    for (const t of [0.3, 0.7]) {
      const [ax, az] = deckCorner(k, 2.0)
      const [bx, bz] = deckCorner(k + 1, 2.0)
      fine.push(at(sph(0.035, 6, 4), STEEL_DARK, [ax + (bx - ax) * t, 0.19, az + (bz - az) * t]))
    }
  }
  // The apron round it, a little below the plates, with a vent in each side.
  lit.push(at(hexRing(2.45, 3.4, -0.12, -0.03), STEEL_DARK))
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3
    const cx = Math.sin(a) * 2.52
    const cz = Math.cos(a) * 2.52
    const tx = Math.cos(a)
    const tz = -Math.sin(a)
    // A frame of four bars, three slats across it, the glow under them.
    for (const s of [-1, 1]) {
      lit.push(at(rbox(0.9, 0.06, 0.06, 0.3, 6, 4), STEEL, [cx + Math.sin(a) * s * 0.17, 0.0, cz + Math.cos(a) * s * 0.17], [0, a, 0]))
      lit.push(at(rbox(0.06, 0.06, 0.4, 0.3, 4, 4), STEEL, [cx + tx * s * 0.42, 0.0, cz + tz * s * 0.42], [0, a, 0]))
    }
    for (let i = -1; i <= 1; i++) fine.push(at(rbox(0.04, 0.03, 0.26, 0.3, 4, 4), INK, [cx + tx * i * 0.22, 0.015, cz + tz * i * 0.22], [0, a, 0]))
    glow.push(at(rbox(0.74, 0.02, 0.26, 0.3, 6, 4), PAL.glowCyan, [cx, -0.005, cz], [0, a, 0]))
  }
  // Three low maintenance clamps (behind and to the sides; the front is the camera's).
  for (const a of [Math.PI, Math.PI - 1.25, Math.PI + 1.25]) {
    const s = Math.sin(a)
    const c = Math.cos(a)
    const r0 = 2.95
    const P = (r: number, y: number): V3 => [s * r, y, c * r]
    lit.push(at(rcyl(0.3, 0.24, 0.05, 12, 2), STEEL_DARK, P(r0, 0.05)))
    lit.push(at(torus(0.3, 0.035, 6, 20), PAL.hazard, P(r0, 0.14), [Math.PI / 2, 0, 0]))
    lit.push(at(rcyl(0.09, 0.62, 0.025, 10, 2), STEEL, P(r0, 0.4)))
    lit.push(at(sph(0.12, 10, 8), STEEL_DARK, P(r0, 0.74)))
    lit.push(beam(P(r0, 0.74), P(1.8, 0.5), 0.12, 0.15, STEEL))
    // A piston under the arm, a clamp at its end with a lit tool between the jaws.
    lit.push(rod(P(r0 - 0.04, 0.3), P(2.3, 0.6), 0.03, PAL.steel))
    lit.push(at(sph(0.09, 8, 6), STEEL_DARK, P(1.8, 0.5)))
    for (const side of [-1, 1]) {
      const q: V3 = [s * 1.64 + c * side * 0.08, 0.46, c * 1.64 - s * side * 0.08]
      lit.push(beam(P(1.8, 0.49), q, 0.04, 0.06, INK))
    }
    glow.push(at(sph(0.04, 6, 4), PAL.glowCyan, P(1.66, 0.47)))
  }
}

/** The terrace at the back, its steps and its lit fascia. */
const terrace = (p: Parts): void => {
  const { lit, glow } = p
  const d = TERRACE_FRONT - TERRACE_BACK
  const zc = (TERRACE_FRONT + TERRACE_BACK) / 2
  lit.push(at(rbox(TERRACE_HALF * 2, TERRACE_TOP + 0.04, d, 0.14, 28, 10), STEEL, [0, (TERRACE_TOP - 0.04) / 2, zc]))
  // Deck panels on it, with seams between.
  const cols = 6
  const rows = 3
  const cw = (TERRACE_HALF * 2 - 0.5) / cols
  const rd = (d - 0.4) / rows
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -TERRACE_HALF + 0.25 + cw * (i + 0.5)
      const z = TERRACE_FRONT - 0.2 - rd * (j + 0.5)
      lit.push(at(rbox(cw - 0.05, 0.05, rd - 0.05, 0.2, 8, 4), (i + j) % 2 ? PLATE : PLATE_TINTS[2]!, [x, TERRACE_TOP + 0.0, z]))
    }
  }
  // The fascia: ribs, a lit strip, lights at the foot.
  glow.push(at(rbox(TERRACE_HALF * 2 - 0.6, 0.05, 0.04, 0.3, 8, 4), PAL.glowCyan, [0, TERRACE_TOP - 0.13, TERRACE_FRONT + 0.005]))
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) < 1) continue
    lit.push(at(rbox(0.14, TERRACE_TOP - 0.05, 0.08, 0.3, 4, 6), STEEL_DARK, [i * 1.3, (TERRACE_TOP - 0.05) / 2 - 0.02, TERRACE_FRONT + 0.03]))
  }
  // Steps up, in the middle, their noses hazard yellow.
  // (Each a different width and foot, so no two of their faces meet in a plane.)
  const steps: Array<[number, number, number, number, number]> = [[2.4, 0.2, TERRACE_FRONT + 0.45, 0.5, -0.02], [2.3, 0.4, TERRACE_FRONT + 0.1, 0.4, -0.06]]
  for (const [w, top, z, dep, foot] of steps) {
    lit.push(at(rbox(w, top - foot, dep, 0.2, 10, 6), STEEL_DARK, [0, (top + foot) / 2, z]))
    lit.push(at(rbox(w - 0.12, 0.03, 0.06, 0.3, 8, 4), PAL.hazard, [0, top, z + dep / 2 - 0.015]))
  }
}

/** The deck's parts (deck frame, plates at y = 0). */
export const deckParts = (): Parts => {
  const p = newParts()
  const { lit, fine, glow } = p
  const turn: V3 = [0, Math.PI / 6, 0]
  const R = DECK_R

  // ── The slab and the rim ──
  lit.push(at(lathe([[0, -0.78], [R - 0.65, -0.78], [R - 0.4, -0.55], [R - 0.4, -0.06], [0, -0.06]], 6), SEAM, [0, 0, 0], turn))
  lit.push(at(hexRing(R - 0.8, R, -0.34, 0.06), STEEL_DARK))
  // Hazard stripes across the open front edge.
  const front = (R - 0.4) * Math.cos(Math.PI / 6)
  for (let i = -5; i <= 5; i++) lit.push(at(rbox(0.6, 0.04, 0.17, 0.3, 6, 4), PAL.hazard, [i * 0.8, 0.07, front], [0, 0.7, 0]))
  // Edge lights along the rim's outer faces, landing lights along the front.
  for (let k = 0; k < 6; k++) {
    const [ax, az] = deckCorner(k)
    const [bx, bz] = deckCorner(k + 1)
    for (let t = 1; t < 6; t++) {
      const f = t / 6
      const x = ax + (bx - ax) * f
      const z = az + (bz - az) * f
      glow.push(at(sph(0.07, 6, 4), k === 5 ? PAL.glowYellow : PAL.glowCyan, [x, -0.14, z]))
    }
  }

  // ── The plates: a hex grid inside the rim, round the pad, short of the terrace ──
  const rng = mulberry32(20261006)
  const PR = 0.95
  const step = 2 * PR * Math.cos(Math.PI / 6) + 0.045
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      // Pointy (+z) hexes: neighbours across their flat sides, at ±60° and on x.
      const x = step * (i + j * 0.5)
      const z = step * j * Math.cos(Math.PI / 6)
      if (hexNorm(x, z) + 0.55 > R - 0.8) continue
      if (Math.hypot(x, z) < 3.45) continue
      if (z < TERRACE_FRONT - 0.95 && Math.abs(x) < TERRACE_HALF - 0.6) continue
      const tint = PLATE_TINTS[Math.floor(rng() * PLATE_TINTS.length)]!
      lit.push(at(rcyl(PR, 0.1, 0.025, 6, 1), tint, [x, -0.05, z]))
      const kind = rng()
      if (kind < 0.28) {
        // An access hatch: an inset lid and four bolts.
        lit.push(at(rcyl(0.55, 0.04, 0.012, 6, 1), STEEL, [x, 0.0, z], turn))
        for (let b = 0; b < 4; b++) {
          const a = (b / 4) * Math.PI * 2 + Math.PI / 4
          fine.push(at(sph(0.03, 6, 4), STEEL_DARK, [x + Math.cos(a) * 0.68, 0.0, z + Math.sin(a) * 0.68]))
        }
      } else if (kind < 0.36) {
        // A floor grille with the glow under it.
        for (let s = -2; s <= 2; s++) fine.push(at(rbox(0.07, 0.04, 0.8, 0.3, 4, 4), INK, [x + s * 0.15, 0.025, z]))
        glow.push(at(rbox(0.72, 0.024, 0.62, 0.3, 6, 4), PAL.glowCyan, [x, 0.0, z]))
      }
    }
  }

  // ── The pad, the terrace, the service lines ──
  servicePad(p)
  terrace(p)
  const toward = (x: number, z: number, r: number): [number, number] => {
    const l = Math.hypot(x, z)
    return [(x / l) * r, (z / l) * r]
  }
  serviceLine(p, toward(-2.6, TERRACE_FRONT, 3.3), [-2.7, TERRACE_FRONT + 0.3])
  serviceLine(p, toward(2.6, TERRACE_FRONT, 3.3), [2.7, TERRACE_FRONT + 0.3])
  serviceLine(p, toward(-1, 0.18, 3.3), [-(R - 1.15), 0.95], true)
  serviceLine(p, toward(1, 0.18, 3.3), [R - 1.15, 0.95], true)

  // ── Guard rails round all but the open front, two beacons at its corners ──
  const RR = R - 0.4
  for (let k = 0; k < 5; k++) {
    const [ax, az] = deckCorner(k, RR)
    const [bx, bz] = deckCorner(k + 1, RR)
    const n = 6
    for (let t = 0; t <= n; t++) {
      if (k > 0 && t === 0) continue
      const f = t / n
      lit.push(at(rcyl(0.045, 1.05, 0.012, 8, 1), STEEL, [ax + (bx - ax) * f, 0.56, az + (bz - az) * f]))
    }
    lit.push(rod([ax, 0.62, az], [bx, 0.62, bz], 0.028, STEEL_DARK))
    lit.push(rod([ax, 1.05, az], [bx, 1.05, bz], 0.034, STEEL))
    glow.push(rod([ax, 0.97, az], [bx, 0.97, bz], 0.014, PAL.glowCyan, 5))
  }
  for (const k of [0, 5]) {
    const [x, z] = deckCorner(k, RR)
    lit.push(at(rcyl(0.22, 0.2, 0.05, 10, 2), STEEL_DARK, [x, 0.12, z]))
    lit.push(at(rcyl(0.06, 1.5, 0.02, 8, 1), STEEL, [x, 0.95, z]))
    lit.push(at(rcone(0.16, 0.1, 0.14, 0.03, 10), INK, [x, 1.72, z]))
  }

  // ── Underneath: the hull it flies on, ribs, a reactor, two hover thrusters ──
  lit.push(at(lathe([[0, -4.3], [1.3, -4.3], [2.8, -3.5], [5.8, -2.3], [8.7, -1.0], [9.1, -0.7]], 6), STEEL_DARK, [0, 0, 0], turn))
  for (let k = 0; k < 6; k++) {
    const [ax, az] = deckCorner(k, 8.75)
    const [bx, bz] = deckCorner(k, 3.0)
    lit.push(beam([ax, -1.05, az], [bx, -3.45, bz], 0.32, 0.36, STEEL))
  }
  lit.push(at(rcyl(1.5, 0.7, 0.15, 18, 2), STEEL, [0, -4.55, 0]))
  glow.push(at(torus(1.52, 0.06, 6, 36), PAL.glowCyan, [0, -4.55, 0], [Math.PI / 2, 0, 0]))
  glow.push(at(rcyl(0.9, 0.05, 0.02, 18, 1), PAL.glowPink, [0, -4.92, 0]))
  for (const k of [1, 4]) {
    const [x, z] = deckCorner(k, R + 0.75)
    const [ix, iz] = deckCorner(k, R - 0.3)
    lit.push(beam([ix, -0.2, iz], [x, -0.45, z], 0.5, 0.3, STEEL_DARK))
    lit.push(at(rcyl(0.62, 0.95, 0.12, 16, 2), STEEL, [x, -0.6, z]))
    for (const y of [-0.38, -0.82]) lit.push(at(torus(0.63, 0.035, 6, 24), STEEL_DARK, [x, y, z], [Math.PI / 2, 0, 0]))
    lit.push(at(rcone(0.72, 0.5, 0.42, 0.03, 16), INK, [x, -1.2, z]))
    glow.push(at(rcyl(0.6, 0.06, 0.01, 16, 1), PAL.glowCyan, [x, -1.42, z]))
    glow.push(at(xform(rcone(0.5, 0.08, 0.5, 0.02, 14), [0, 0, 0], [Math.PI, 0, 0]), PAL.glowWhite, [x, -1.68, z]))
    glow.push(at(sph(0.07, 6, 4), PAL.glowRed, [x, -0.1, z]))
  }
  return p
}

/** The landing beacons' lamps: their own mesh, so they can blink. */
export const deckLampParts = (): Parts => {
  const p = newParts()
  for (const k of [0, 5]) {
    const [x, z] = deckCorner(k, DECK_R - 0.4)
    p.glow.push(at(sph(0.13, 10, 8), PAL.glowRed, [x, 1.88, z]))
  }
  return p
}
