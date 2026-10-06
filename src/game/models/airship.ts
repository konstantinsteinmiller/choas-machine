import { CylinderGeometry, type BufferGeometry } from 'three'
import { RigBuilder, dome, lathe, rbox, rcone, rcyl, sph, stripUv, torus, xform, type Rig, type V3 } from './kit'
import { PAL } from './palette'
import { at, chamferRing, loft } from './propKit'

/**
 * ─── The Airship (#142) ──────────────────────────────────────────────────────
 *
 * A flying fortress some 29 m long that circles the later fortresses: a
 * chamfered gas hull lofted through eight sections with raised panel belts
 * and rivet rows, a bridge gondola under it with its windows lit, four tail
 * fins, four engine pods on pylons (a fan spinning in each intake, a lit
 * exhaust), a twin-barrelled turret on its back and one under its tail, two
 * rocket pods of four tubes on its flanks, and a searchlight under the bridge.
 *
 * One skinned rig: three draw calls, and its parts are what it breaks into
 * when it comes down (`fx/shatter.ts`). It faces +z, its middle at the origin.
 *
 * Every round and rocket leaves from a SOCKET: a named point at a barrel's or
 * a tube's mouth, in that barrel's or pod's own bone. The flash, the recoil and
 * the round itself all read the same socket in the same frame (#142).
 */

const HULL = '#6f62b8'
const HULL_HI = '#8a7ed0'
const HULL_DARK = '#43398a'
const TRIM = PAL.steelDark
const INK = '#221a46'
const RED = PAL.glowRed

/** The hull's sections, tail to nose: [z, width, belly, top, top chamfer, belly chamfer]. */
const SECTIONS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [-14.2, 1.4, -0.8, 0.8, 0.3, 0.3],
  [-12.4, 3.8, -2.0, 2.1, 0.95, 0.85],
  [-8.6, 6.2, -2.9, 3.0, 1.6, 1.4],
  [-1.5, 7.0, -3.2, 3.3, 1.8, 1.5],
  [5.5, 6.8, -3.1, 3.2, 1.7, 1.45],
  [10.4, 4.9, -2.4, 2.5, 1.2, 1.05],
  [13.4, 2.4, -1.2, 1.3, 0.55, 0.5],
  [14.6, 0.7, -0.35, 0.4, 0.12, 0.1]
]

/** Where the engine pods hang, their pylons' roots, in the hull's frame. */
export const ENGINE_AT: ReadonlyArray<V3> = [[-5.2, -0.6, 6.5], [5.2, -0.6, 6.5], [-5.6, -0.4, -6.5], [5.6, -0.4, -6.5]]
/** The turrets: on its back near the nose, and under its tail. */
export const TURRET_AT: Readonly<Record<'F' | 'B', V3>> = { F: [0, 3.25, 7.5], B: [0, -3.0, -7.2] }
/** The rocket pods, on its flanks amidships. */
export const POD_AT: Readonly<Record<'L' | 'R', V3>> = { L: [-4.3, -1.5, 0.5], R: [4.3, -1.5, 0.5] }
/** The searchlight under the bridge. */
export const LAMP_AT: V3 = [0, -4.75, 2.5]

const BARREL_LEN = 2.2
const BARREL_GAP = 0.32
const TUBE = 0.24

/**
 * Every emission point (#142): the bone, and the mouth in that bone's frame.
 * A turret's two barrels fire in turn; a pod's four tubes in turn.
 */
export const AIRSHIP_SOCKETS = {
  turretF: [['barrelsF', -BARREL_GAP / 2, 0.35, BARREL_LEN + 0.55], ['barrelsF', BARREL_GAP / 2, 0.35, BARREL_LEN + 0.55]],
  turretB: [['barrelsB', -BARREL_GAP / 2, -0.35, BARREL_LEN + 0.55], ['barrelsB', BARREL_GAP / 2, -0.35, BARREL_LEN + 0.55]],
  podL: [['podL', -TUBE, TUBE, 1.42], ['podL', TUBE, TUBE, 1.42], ['podL', -TUBE, -TUBE, 1.42], ['podL', TUBE, -TUBE, 1.42]],
  podR: [['podR', -TUBE, TUBE, 1.42], ['podR', TUBE, TUBE, 1.42], ['podR', -TUBE, -TUBE, 1.42], ['podR', TUBE, -TUBE, 1.42]]
} as const satisfies Record<string, ReadonlyArray<readonly [string, number, number, number]>>

/** The hull's height over its middle, and its half-length and half-width (for the hit volumes and the flight). */
export const AIRSHIP_HALF = { x: 3.5, y: 3.3, z: 14.6 } as const

const cyl = (r: number, len: number, segs = 10): BufferGeometry => stripUv(new CylinderGeometry(r, r, len, segs))

/** An engine pod, built along +z (intake forward), at its own bone's origin. */
const engine = (b: RigBuilder, bone: string, fan: string): void => {
  // The casing: an intake lip, a waist, a flared exhaust.
  b.part(bone, at(lathe([[0, -1.9], [0.62, -1.9], [0.95, -1.5], [1.15, -0.4], [1.12, 0.9], [0.98, 1.65], [0.86, 1.8], [0.78, 1.6], [0, 1.6]], 20), HULL, [0, 0, 0], [Math.PI / 2, 0, 0]), '#fff')
  for (const z of [-0.8, 0.5]) b.part(bone, at(torus(1.15, 0.05, 6, 30), HULL_DARK, [0, 0, z]), '#fff')
  b.part(bone, at(torus(0.84, 0.07, 6, 28), TRIM, [0, 0, 1.78]), '#fff')
  b.part(bone, at(rcone(0.66, 0.5, 0.5, 0.03, 18), INK, [0, 0, -2.1], [-Math.PI / 2, 0, 0]), '#fff')
  b.part(bone, at(rcyl(0.5, 0.05, 0.01, 18, 1), PAL.glowCyan, [0, 0, -2.37], [Math.PI / 2, 0, 0]), '#fff', { glow: true, outline: false })
  // Cooling fins along its back.
  for (const x of [-0.25, 0, 0.25]) b.part(bone, at(rbox(0.06, 0.3, 1.2, 0.3, 4, 6), TRIM, [x, 1.22, -0.2]), '#fff')
  // The fan: a spinner and eight blades, spinning on its own bone.
  b.part(fan, at(rcone(0.22, 0.04, 0.4, 0.02, 12), TRIM, [0, 0, 0.2], [Math.PI / 2, 0, 0]), '#fff')
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const blade = xform(rbox(0.6, 0.04, 0.16, 0.3, 6, 4), [0, 0, 0], [0, 0.5, 0])
    b.part(fan, at(blade, INK, [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0], [0, 0, a]), '#fff')
  }
}

/** A twin-barrelled turret: a dome on a ring, the housing, the barrels on their own bone (they recoil). */
const turret = (b: RigBuilder, bone: string, barrels: string, under: boolean): void => {
  const s = under ? -1 : 1
  b.part(bone, at(rcyl(1.0, 0.24, 0.06, 18, 2), TRIM, [0, 0.12 * s, 0]), '#fff')
  b.part(bone, at(dome(0.85, Math.PI / 2, 18, 8), HULL_DARK, [0, 0.24 * s, 0], under ? [Math.PI, 0, 0] : [0, 0, 0]), '#fff')
  b.part(bone, at(rbox(1.1, 0.62, 1.3, 0.35, 10, 8), HULL_HI, [0, 0.42 * s, 0.25]), '#fff')
  b.part(bone, at(rbox(0.5, 0.12, 0.06, 0.4, 6, 3), RED, [0, 0.52 * s, 0.92]), '#fff', { glow: true, outline: false })
  for (const x of [-BARREL_GAP / 2, BARREL_GAP / 2]) {
    b.part(barrels, at(cyl(0.085, BARREL_LEN), INK, [x, 0.35 * s, 0.55 + BARREL_LEN / 2], [Math.PI / 2, 0, 0]), '#fff')
    b.part(barrels, at(rcyl(0.13, 0.32, 0.03, 10, 2), TRIM, [x, 0.35 * s, 0.75], [Math.PI / 2, 0, 0]), '#fff')
    b.part(barrels, at(rcyl(0.12, 0.2, 0.03, 10, 2), TRIM, [x, 0.35 * s, BARREL_LEN + 0.4], [Math.PI / 2, 0, 0]), '#fff')
  }
}

/** A rocket pod: a housing with four tubes, their mouths dark with a red glow deep inside. */
const pod = (b: RigBuilder, bone: string): void => {
  b.part(bone, at(rbox(1.1, 1.1, 2.6, 0.25, 10, 8), HULL_DARK, [0, 0, 0.1]), '#fff')
  b.part(bone, at(rbox(1.16, 0.14, 2.0, 0.4, 8, 3), PAL.hazard, [0, 0.62, 0.1]), '#fff')
  for (const [x, y] of [[-TUBE, TUBE], [TUBE, TUBE], [-TUBE, -TUBE], [TUBE, -TUBE]] as const) {
    b.part(bone, at(rcyl(0.17, 0.3, 0.03, 12, 2), TRIM, [x, y, 1.33], [Math.PI / 2, 0, 0]), '#fff')
    b.part(bone, at(rcyl(0.1, 0.04, 0.01, 10, 1), RED, [x, y, 1.33], [Math.PI / 2, 0, 0]), '#fff', { glow: true, outline: false })
  }
}

export const buildAirship = (): Rig => {
  const b = new RigBuilder()
  b.bone('hull', null, [0, 0, 0])

  // ── The gas hull, its belts, its deck plates and rivets ──
  b.part('hull', at(loft(SECTIONS.map(([z, w, y0, y1, c, cb]) => chamferRing(z, w, y0, y1, c, cb))), HULL), '#fff')
  for (const [z, w, y0, y1, c, cb] of [[-6, 6.55, -3.04, 3.14, 1.7, 1.45], [0.5, 7.08, -3.24, 3.34, 1.82, 1.52], [7.5, 6.12, -2.84, 2.94, 1.55, 1.32]] as const) {
    b.part('hull', at(loft([chamferRing(z, w, y0, y1, c, cb), chamferRing(z + 0.32, w, y0, y1, c, cb)]), HULL_DARK), '#fff')
  }
  for (const [z0, z1] of [[-5.5, 0.1], [0.95, 7.0]] as const) {
    b.part('hull', at(rbox(2.6, 0.06, z1 - z0 - 0.3, 0.25, 8, 4), HULL_HI, [0, 3.28, (z0 + z1) / 2]), '#fff')
  }
  for (let i = 0; i <= 14; i++) {
    const z = -7 + i
    for (const s of [-1, 1]) b.part('hull', at(sph(0.05, 6, 4), TRIM, [s * 1.66, 3.28, z]), '#fff', { outline: false })
  }
  // Markings: a pink band down each flank, a skull badge by the nose.
  for (const s of [-1, 1]) {
    b.part('hull', at(rbox(0.06, 0.3, 9, 0.3, 4, 4), PAL.mechEye, [s * 3.52, 0.9, 1], [0, 0, 0]), '#fff')
    b.part('hull', at(rcyl(0.55, 0.06, 0.02, 8, 1), RED, [s * 3.4, 0.4, 9.2], [0, 0, Math.PI / 2]), '#fff')
  }
  // Running lights along the keel.
  b.part('hull', at(cyl(0.06, 16, 6), PAL.glowCyan, [0, -3.17, 0], [Math.PI / 2, 0, 0]), '#fff', { glow: true, outline: false })
  // ── Fins: up, down and either side, at the tail ──
  for (const [r, len] of [[0, 3.6], [Math.PI, 2.8], [Math.PI / 2, 3.2], [-Math.PI / 2, 3.2]] as const) {
    b.part('hull', at(rbox(0.22, len, 3.4, 0.35, 6, 8), HULL_DARK, [Math.sin(r) * (1.4 + len / 2), Math.cos(r) * (1.4 + len / 2), -12.2], [0, 0, -r]), '#fff')
    b.part('hull', at(rbox(0.26, 0.18, 3.0, 0.4, 4, 4), RED, [Math.sin(r) * (1.4 + len), Math.cos(r) * (1.4 + len), -12.2], [0, 0, -r]), '#fff')
  }
  // ── The bridge gondola, under the nose half, its windows lit ──
  b.part('hull', at(rbox(2.8, 1.5, 7.6, 0.4, 12, 8), HULL_HI, [0, -3.9, 3.0]), '#fff')
  b.part('hull', at(rbox(2.0, 0.5, 2.6, 0.4, 8, 6), HULL_DARK, [0, -3.25, 3.0]), '#fff')
  b.part('hull', at(rbox(2.86, 0.32, 6.4, 0.4, 10, 4), PAL.glowCyan, [0, -3.8, 3.2]), '#fff', { glow: true, outline: false })
  b.part('hull', at(rbox(2.4, 0.9, 0.5, 0.4, 8, 6), HULL_DARK, [0, -3.9, 6.95]), '#fff')

  // ── Engines on pylons ──
  ENGINE_AT.forEach((p, i) => {
    const side = Math.sign(p[0])
    // The pylon from the hull's flank out to the pod.
    b.part('hull', at(rbox(Math.abs(p[0]) - 2.6, 0.4, 1.6, 0.35, 8, 4), TRIM, [side * (2.6 + (Math.abs(p[0]) - 2.6) / 2) * 0.98, p[1] + 0.2, p[2]]), '#fff')
    b.bone(`engine${i}`, 'hull', p)
    b.bone(`fan${i}`, `engine${i}`, [0, 0, 1.45])
    engine(b, `engine${i}`, `fan${i}`)
  })
  // ── Turrets ──
  b.bone('turretF', 'hull', TURRET_AT.F)
  b.bone('barrelsF', 'turretF', [0, 0, 0])
  turret(b, 'turretF', 'barrelsF', false)
  b.bone('turretB', 'hull', TURRET_AT.B)
  b.bone('barrelsB', 'turretB', [0, 0, 0])
  turret(b, 'turretB', 'barrelsB', true)
  // ── Rocket pods ──
  b.bone('podL', 'hull', POD_AT.L)
  pod(b, 'podL')
  b.bone('podR', 'hull', POD_AT.R)
  pod(b, 'podR')
  // ── The searchlight under the bridge: a yoke, the lamp, its lens ──
  b.bone('lamp', 'hull', LAMP_AT)
  b.part('lamp', at(rcyl(0.55, 0.9, 0.08, 14, 2), TRIM, [0, -0.2, 0], [Math.PI / 2, 0, 0]), '#fff')
  b.part('lamp', at(rcyl(0.5, 0.06, 0.02, 14, 1), PAL.glowWhite, [0, -0.2, 0.47], [Math.PI / 2, 0, 0]), '#fff', { glow: true, outline: false })

  return b.build({ outline: 0.06, height: AIRSHIP_HALF.y * 2 })
}
