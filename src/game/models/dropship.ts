import { CylinderGeometry, Group, Mesh, type BufferGeometry } from 'three'
import { dome, ell, lathe, merge, paintBy, rbox, rcone, rcyl, sph, stripUv, torus, xform, type V3 } from './kit'
import { glowVC, outlineMat, toonVC } from './toon'
import { PAL } from './palette'
import { at, chamferRing, loft, newParts, type Parts } from './propKit'

/**
 * The stealth dropship that delivers the mech and takes it out again (GDD 6).
 *
 * A chamfered lifting-body hull lofted through eight sections, a glass
 * canopy under a framed hood, two engine nacelles (an intake lip, a fan and
 * spinner in the intake, banded casings, flared exhaust bells with a lit
 * thruster), swept wings, canted twin fins, canards, landing gear down, the
 * belly hatch, antennas and a sensor dome, with raised panel belts, rivet
 * rows and hull markings. Every layered part stands off what it lies on by
 * centimetres: nothing shares a face.
 *
 * A static prop: one lit mesh with its outline and one glowing mesh. It faces
 * +z; its belly hatch is at the origin, its feet at y = 0.
 */

const HULL = '#6b5bc4'
const HULL_HI = '#8676d6'
const HULL_DARK = '#3d2f86'
const TRIM = PAL.steelDark
const INK = '#241848'

export interface Dropship {
  group: Group
  dispose(): void
}

/** The fuselage's sections, tail to nose: [z, width, belly, top, top chamfer, belly chamfer]. */
const HULL_SECTIONS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [-4.1, 2.4, 1.05, 1.75, 0.3, 0.25],
  [-3.5, 3.4, 0.88, 1.92, 0.45, 0.3],
  [-2.2, 4.2, 0.78, 2.0, 0.55, 0.35],
  [2.2, 4.2, 0.78, 2.0, 0.55, 0.35],
  [3.7, 3.8, 0.82, 1.92, 0.6, 0.35],
  [5.0, 2.9, 0.92, 1.7, 0.55, 0.3],
  [6.1, 1.7, 1.03, 1.48, 0.35, 0.18],
  [6.85, 0.55, 1.15, 1.3, 0.1, 0.06]
]
/** Midship: the flat top, the belly, the side wall (x = ±2.1 between these heights). */
const TOP = 2.0
const BELLY = 0.78
const SIDE = 2.1

/** An airfoil-ish section, six points, in the plane of `span` (x for a wing, y for a fin). */
const foil = (span: number, lead: number, trail: number, mid: number, t: number, vertical = false): V3[] => {
  const c = lead - trail
  const pts: Array<[number, number]> = [
    [lead, mid], [lead - c * 0.3, mid + t / 2], [trail + c * 0.15, mid + t * 0.3],
    [trail, mid], [trail + c * 0.15, mid - t * 0.3], [lead - c * 0.3, mid - t / 2]
  ]
  return pts.map(([z, o]) => (vertical ? [o, span, z] : [span, o, z]) as V3)
}

/** One engine nacelle, built along +y (intake up), turned onto +z by the caller. */
const nacelle = (p: Parts): void => {
  const L: BufferGeometry[] = []
  const G: BufferGeometry[] = []
  // The casing, its intake a recess behind the lip.
  L.push(at(lathe([[0, -1.3], [0.7, -1.3], [0.86, -1.0], [0.9, 0.5], [0.85, 1.25], [0.72, 1.5], [0.6, 1.45], [0.56, 1.05], [0, 1.05]], 18), HULL))
  L.push(at(torus(0.66, 0.075, 8, 24), TRIM, [0, 1.47, 0], [Math.PI / 2, 0, 0]))
  // Raised bands round the casing (its panel lines).
  for (const y of [-0.6, 0.25]) L.push(at(torus(0.9, 0.035, 6, 28), HULL_DARK, [0, y, 0], [Math.PI / 2, 0, 0]))
  // In the intake: a spinner and a fan of eight twisted blades.
  L.push(at(rcone(0.17, 0.03, 0.34, 0.02, 12), TRIM, [0, 1.21, 0]))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    // Twisted about its own length, then turned out to its place round the hub.
    const blade = xform(rbox(0.36, 0.03, 0.11, 0.3, 6, 4), [0, 0, 0], [0.5, 0, 0])
    L.push(at(blade, INK, [Math.cos(a) * 0.34, 1.13, Math.sin(a) * 0.34], [0, -a, 0]))
  }
  // The exhaust: a flared bell, a dark lip, the lit thruster and its flame stub.
  L.push(at(rcone(0.74, 0.55, 0.45, 0.03, 18), HULL_DARK, [0, -1.45, 0]))
  L.push(at(torus(0.72, 0.045, 6, 24), INK, [0, -1.66, 0], [Math.PI / 2, 0, 0]))
  G.push(at(rcyl(0.6, 0.04, 0.01, 18, 1), PAL.glowCyan, [0, -1.69, 0]))
  G.push(at(rcone(0.46, 0.08, 0.38, 0.02, 14), PAL.glowWhite, [0, -1.88, 0], [Math.PI, 0, 0]))
  // Cooling fins along the top.
  // (The nacelle is turned onto +z: its local −z is up.)
  for (const x of [-0.2, 0, 0.2]) L.push(at(rbox(0.05, 0.5, 0.16, 0.3, 4, 6), TRIM, [x, 0.1, -0.95]))
  p.lit.push(...L)
  p.glow.push(...G)
}

/** The ship's parts, in its own frame (for the tests: no two may share a face). */
export const dropshipParts = (): Parts => {
  const p = newParts()
  const { lit, fine, glow } = p

  // ── The hull ──
  lit.push(at(loft(HULL_SECTIONS.map(([z, w, y0, y1, c, cb]) => chamferRing(z, w, y0, y1, c, cb))), HULL))
  // Panel belts: the section, a little proud, a hand's breadth long.
  for (const z of [-1.5, 0.15, 1.7]) {
    lit.push(at(loft([chamferRing(z, 2 * SIDE + 0.05, BELLY - 0.025, TOP + 0.025, 0.55, 0.35), chamferRing(z + 0.07, 2 * SIDE + 0.05, BELLY - 0.025, TOP + 0.025, 0.55, 0.35)]), HULL_DARK))
  }
  // Deck plates and longitudinal seams on the flat top, between the belts.
  for (const [z0, z1] of [[-1.38, 0.05], [0.3, 1.6]] as const) {
    const zc = (z0 + z1) / 2
    const len = z1 - z0 - 0.1
    lit.push(at(rbox(1.15, 0.05, len, 0.25, 8, 4), HULL_HI, [0, TOP + 0.005, zc]))
    for (const x of [-1.0, 1.0]) fine.push(at(rbox(0.05, 0.036, len, 0.4, 4, 4), INK, [x, TOP + 0.003, zc]))
  }
  // Rivet rows along the top's edges and down the flanks.
  for (let i = 0; i <= 10; i++) {
    const z = -2.0 + i * 0.4
    for (const s of [-1, 1]) {
      fine.push(at(sph(0.028, 6, 4), TRIM, [s * 1.44, TOP, z]))
      fine.push(at(sph(0.026, 6, 4), TRIM, [s * SIDE, 1.18, z]))
    }
  }
  // Markings: a pink stripe down each flank, hazard chevrons by the tail, a hex badge.
  for (const s of [-1, 1]) {
    const x = s * (SIDE + 0.035)
    lit.push(at(rbox(0.04, 0.12, 1.8, 0.3, 4, 4), PAL.mechEye, [x, 1.28, 0]))
    for (let k = 0; k < 3; k++) lit.push(at(rbox(0.04, 0.09, 0.3, 0.3, 4, 4), PAL.hazard, [x, 1.29, -1.95 + k * 0.32], [0.6, 0, 0]))
    lit.push(at(rcyl(0.15, 0.04, 0.012, 6, 1), PAL.mechCore, [s * (SIDE + 0.03), 1.29, 1.2], [0, 0, Math.PI / 2]))
    fine.push(at(rcyl(0.09, 0.04, 0.012, 6, 1), INK, [s * (SIDE + 0.06), 1.29, 1.2], [0, 0, Math.PI / 2]))
    // A running light along the lower chine.
    glow.push(at(stripUv(new CylinderGeometry(0.035, 0.035, 4.0, 6)), PAL.glowCyan, [s * SIDE, BELLY + 0.35, 0.1], [Math.PI / 2, 0, 0]))
  }

  // ── The canopy: glass under a framed hood ──
  const glass = ell(0.85, 0.5, 1.45, 18, 12)
  xform(glass, [0, 1.72, 4.3])
  paintBy(glass, (x, y, z) => (y > 2.08 && Math.abs(x + (z - 4.3) * 0.25) < 0.16 ? '#e6fdff' : y > 1.9 ? '#5fd6ff' : '#3a2f8c'))
  glow.push(glass)
  // The frame: a ridge down the middle and two arches over it.
  lit.push(at(torus(1, 0.03, 5, 28, Math.PI), INK, [0, 1.72, 4.3], [0, Math.PI / 2, 0], [1.48, 0.525, 1]))
  for (const dz of [-0.45, 0.55]) {
    const k = Math.sqrt(1 - (dz / 1.45) ** 2)
    lit.push(at(torus(1, 0.035, 5, 24, Math.PI), INK, [0, 1.72, 4.3 + dz], [0, 0, 0], [0.85 * k * 1.04, 0.5 * k * 1.06, 1]))
  }
  // The chin sensor, its lens lit.
  lit.push(at(sph(0.26, 12, 8), HULL_DARK, [0, 0.98, 5.55]))
  glow.push(at(sph(0.1, 8, 6), PAL.glowPink, [0, 0.93, 5.78]))

  // ── Engines, wings, fins ──
  for (const s of [-1, 1]) {
    const n = newParts()
    nacelle(n)
    for (const g of n.lit) lit.push(xform(g, [s * 4.4, 1.42, -1.2], [Math.PI / 2, 0, 0]))
    for (const g of n.glow) glow.push(xform(g, [s * 4.4, 1.42, -1.2], [Math.PI / 2, 0, 0]))
    // A swept wing from inside the hull through the nacelle to its tip.
    lit.push(at(loft([foil(s * 1.6, 0.9, -2.9, 1.4, 0.34), foil(s * 4.4, -0.45, -2.6, 1.43, 0.24), foil(s * 5.7, -1.1, -2.35, 1.5, 0.12)]), HULL_DARK))
    // A wing fence, and the tip's navigation light (red to port, +x).
    lit.push(at(rbox(0.05, 0.3, 1.6, 0.3, 4, 6), TRIM, [s * 3.0, 1.45, -1.0]))
    glow.push(at(sph(0.09, 8, 6), s > 0 ? PAL.glowRed : PAL.glowGreen, [s * 5.72, 1.5, -1.78]))
    // Canards by the nose.
    lit.push(at(loft([foil(s * 1.2, 4.9, 3.9, 1.3, 0.12), foil(s * 2.35, 4.4, 3.95, 1.36, 0.06)]), HULL_DARK))
    // A canted tail fin, its tip lit.
    const fin = loft([foil(-0.3, -1.8, -4.0, 0, 0.22, true), foil(1.45, -3.35, -4.45, 0, 0.1, true)])
    lit.push(at(fin, HULL_DARK, [s * 1.25, 1.85, 0], [0, 0, -s * 0.32]))
    glow.push(at(sph(0.06, 6, 5), PAL.glowPink, [s * (1.25 + Math.sin(0.32) * 1.5), 1.85 + Math.cos(0.32) * 1.5, -3.95]))
    // Antennas on the back.
    lit.push(at(stripUv(new CylinderGeometry(0.016, 0.02, 0.75, 5)), TRIM, [s * 0.55, TOP + 0.36, -2.75]))
    glow.push(at(sph(0.04, 6, 4), PAL.glowPink, [s * 0.55, TOP + 0.76, -2.75]))
  }

  // ── The back: a sensor dome, a dish, the ramp, two small thrusters ──
  lit.push(at(dome(0.32, Math.PI / 2, 14, 6), HULL_HI, [0, TOP - 0.02, -1.95]))
  glow.push(at(sph(0.07, 6, 5), PAL.glowCyan, [0, TOP + 0.3, -1.95]))
  lit.push(at(rcyl(0.035, 0.32, 0.01, 6, 1), TRIM, [0, TOP + 0.14, 2.1]))
  lit.push(at(rcone(0.05, 0.24, 0.1, 0.02, 12), TRIM, [0, TOP + 0.33, 2.1], [0.5, 0, 0]))
  lit.push(at(rbox(2.0, 0.55, 0.12, 0.3, 8, 6), HULL_DARK, [0, 1.38, -4.13]))
  for (const s of [-1, 1]) {
    lit.push(at(rcyl(0.17, 0.2, 0.03, 12, 2), INK, [s * 0.75, 1.4, -4.26], [Math.PI / 2, 0, 0]))
    glow.push(at(rcyl(0.12, 0.04, 0.01, 12, 1), PAL.glowCyan, [s * 0.75, 1.4, -4.375], [Math.PI / 2, 0, 0]))
  }

  // ── Underneath: the belly hatch at the origin, its frame, the gear ──
  lit.push(at(rbox(1.75, 0.08, 1.75, 0.25, 8, 4), INK, [0, BELLY - 0.03, 0]))
  glow.push(at(rbox(1.4, 0.04, 1.4, 0.3, 8, 4), PAL.glowCyan, [0, BELLY - 0.095, 0]))
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    lit.push(at(rbox(1.78, 0.05, 0.12, 0.3, 8, 4), k % 2 ? PAL.hazard : INK, [Math.sin(a) * 0.96, BELLY - 0.02, Math.cos(a) * 0.96], [0, a, 0]))
  }
  for (const [x, z] of [[0, 4.4], [-1.5, -1.7], [1.5, -1.7]] as const) {
    // A strut on an oleo, a foot pad, a door to each side (the belly is higher under the nose).
    const b = z > 3 ? 0.87 : BELLY
    lit.push(at(rcyl(0.11, 0.3, 0.03, 10, 2), TRIM, [x, b - 0.12, z]))
    lit.push(at(rcyl(0.06, 0.62, 0.02, 8, 1), PAL.steel, [x, 0.42, z]))
    lit.push(at(torus(0.075, 0.025, 5, 10), INK, [x, 0.3, z], [Math.PI / 2, 0, 0]))
    lit.push(at(rcyl(0.3, 0.1, 0.035, 12, 2), INK, [x, 0.08, z]))
    for (const s of [-1, 1]) lit.push(at(rbox(0.04, 0.42, 0.7, 0.3, 4, 6), HULL_DARK, [x + s * 0.32, b - 0.19, z], [0, 0, s * 0.25]))
  }
  return p
}

export const buildDropship = (): Dropship => {
  const p = dropshipParts()
  const group = new Group()
  group.name = 'dropship'
  const litGeo = merge([...p.lit, ...p.fine])
  const inkGeo = merge(p.lit)
  const glowGeo = merge(p.glow)
  // The materials are the scene's shared ones: only the geometry is ours.
  const body = new Mesh(litGeo, toonVC())
  const line = new Mesh(inkGeo, outlineMat(0.05))
  line.renderOrder = -1
  group.add(body, line, new Mesh(glowGeo, glowVC()))
  for (const g of [...p.lit, ...p.fine, ...p.glow]) g.dispose()
  return {
    group,
    dispose: () => {
      litGeo.dispose()
      inkGeo.dispose()
      glowGeo.dispose()
    }
  }
}
