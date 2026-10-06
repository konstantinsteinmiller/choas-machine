import { BufferGeometry, CylinderGeometry } from 'three'
import { lathe, paintBy, rbox, rcone, rcyl, sph, stripUv, torus, xform, type V3 } from './kit'
import { at, newParts, type Parts } from './propKit'
import type { WeaponId } from '../data/ids'

/**
 * ─── CM-07's three weapons, one model each (#167) ────────────────────────────
 *
 * The weapon in the hand is the weapon on its button (`components/hud/
 * WeaponArt.vue`): the same side view turned into solids, in the same
 * colour (the rifle cyan, the mini-gun violet, the launcher red), its body
 * in the tone, the steel a deep shade of it, the lit bits glowing in its
 * light tone. Every part is laid out in the drawing's own units (the
 * button's 100 × 40 box), so the shapes line up with it part for part.
 *
 * Frame: the weapon bone's. The grip is at the origin, the barrel runs down
 * −y, +z is the top of the weapon (raising the arm turns −y forward and +z
 * up), x is its side. Each muzzle is where its bore opens, taken from the
 * same numbers that place the bore, so the round, the flash and the trail
 * leave from the hole in the model and nowhere else (`MUZZLE`).
 *
 * The mech's rig (`models/mech.ts`), the weapons lab's rack and its
 * hologram (`models/weaponLab.ts`) are all built from these parts.
 */

/** Metres per drawing unit (the mech's design size; the rig is drawn at `MECH_SCALE`). */
const K = 0.02

/** The colours, matched to the HUD's tokens (`assets/css/tokens.sass`). */
export const WEAPON_LOOK: Readonly<Record<WeaponId, { body: string; dark: string; hi: string }>> = {
  // --cm-cyan, its deep mix (30 % into #120a28, as the button), --cm-cyan-hi
  sniper: { body: '#4de8ff', dark: '#244d69', hi: '#a8f5ff' },
  // --cm-violet, its mix, --cm-lilac
  minigun: { body: '#9a78ff', dark: '#3b2b69', hi: '#cbbcff' },
  // --cm-danger, its mix, 45 % of it into white
  rocket: { body: '#ff5576', dark: '#59213f', hi: '#ffb3c1' }
}
const INK = '#150c2b'
const WARN = '#ffd23f'

/** Where the hand closes on each weapon, in drawing units (x along, y down). */
const GRIP: Readonly<Record<WeaponId, readonly [number, number]>> = {
  sniper: [31, 29],
  minigun: [30, 33],
  rocket: [36, 30]
}
/** Each bore's mouth in drawing units: where the round leaves. */
const BORE: Readonly<Record<WeaponId, readonly [number, number]>> = {
  sniper: [97, 21.4],
  minigun: [97, 19.75],
  rocket: [97, 20]
}

/** Drawing x → the bone's y (forward is −y). */
const fy = (w: WeaponId, x: number): number => -(x - GRIP[w][0]) * K
/** Drawing y (down) → the bone's z (up). */
const fz = (w: WeaponId, y: number): number => (GRIP[w][1] - y) * K

/** Each muzzle on the weapon's own bone (`[x, y, z]`, the frame above). */
export const MUZZLE: Readonly<Record<WeaponId, V3>> = {
  sniper: [0, fy('sniper', BORE.sniper[0]), fz('sniper', BORE.sniper[1])],
  minigun: [0, fy('minigun', BORE.minigun[0]), fz('minigun', BORE.minigun[1])],
  rocket: [0, fy('rocket', BORE.rocket[0]), fz('rocket', BORE.rocket[1])]
}

/** The mini-gun's barrels turn on this axis (a bone of their own in the rig). */
export const MINIGUN_SPIN_AT: V3 = [0, fy('minigun', 40), fz('minigun', BORE.minigun[1])]

/**
 * A tube open at its front (−y) end: the outside, the lip, and the bore going
 * `depth` into it, its walls and floor in ink. Length `h`, centred.
 */
const bored = (rOut: number, rIn: number, h: number, depth: number, segs = 14, rBack = rOut): BufferGeometry => {
  const y0 = -h / 2
  const y1 = h / 2
  const lip = Math.min(0.006, (rOut - rIn) / 3)
  const g = lathe([
    [0, y0 + depth], [rIn, y0 + depth], [rIn, y0 + 0.002], [rIn + lip, y0], [rOut - lip, y0], [rOut, y0 + lip],
    [rBack, y1 - lip], [rBack - lip, y1], [0, y1]
  ], segs)
  return g
}
/** Paint a `bored` tube: its bore ink, the rest one colour. */
const paintBored = (g: BufferGeometry, rIn: number, h: number, hex: string): BufferGeometry =>
  paintBy(g, (x, y, z) => (Math.hypot(x, z) <= rIn * 1.01 && y > -h / 2 + 0.001 ? INK : hex))

/** A part along the barrel axis from drawing x0 to x1, at drawing y. */
const along = (w: WeaponId, g: BufferGeometry, color: string, x0: number, x1: number, y: number, x = 0): BufferGeometry =>
  at(g, color, [x, fy(w, (x0 + x1) / 2), fz(w, y)])

/** A rounded block over the drawing's rect (x, y, w, h), `d` thick (m). */
const block = (wp: WeaponId, color: string, x: number, y: number, w: number, h: number, d: number, round = 0.4, tilt = 0, side = 0): BufferGeometry =>
  at(rbox(d, w * K, h * K, round, 6, 6), color, [side, fy(wp, x + w / 2), fz(wp, y + h / 2)], [tilt, 0, 0])

/** A disc whose axis is the weapon's side (x): a drum, a bolt head. */
const sideDisc = (wp: WeaponId, color: string, x: number, y: number, r: number, d: number, side = 0): BufferGeometry =>
  at(rcyl(r * K, d, Math.min(0.012, d / 3), 12, 1), color, [side, fy(wp, x), fz(wp, y)], [0, 0, Math.PI / 2])

const rifle = (): Parts => {
  const w: WeaponId = 'sniper'
  const { body, dark, hi } = WEAPON_LOOK[w]
  const p = newParts()
  const { lit, fine, glow } = p
  // The stock: a long block, the cheek rest on it, the butt pad.
  lit.push(block(w, body, 4, 19, 23, 12, 0.085, 0.4, -0.06))
  lit.push(block(w, dark, 7, 22.6, 13, 4.6, 0.1, 0.45, -0.06))
  lit.push(block(w, dark, 2.2, 20.5, 2.4, 11, 0.095, 0.45, -0.06))
  // The receiver, its rail on top, notched.
  lit.push(block(w, body, 26, 17.5, 28, 9, 0.12, 0.35))
  lit.push(block(w, dark, 27, 16.4, 26, 1.6, 0.07, 0.5))
  for (const x of [29, 32.5, 41, 44, 51]) fine.push(block(w, INK, x, 15.6, 1.2, 1.2, 0.075, 0.5))
  glow.push(at(rbox(0.016, 25 * K, 0.014, 0.6, 4, 4), hi, [0.062, fy(w, 40.5), fz(w, 18.9)]))
  // The barrel, fluted with three rings, the folded bipod under it.
  const barrel = stripUv(new CylinderGeometry(1.8 * K, 1.8 * K, 38 * K, 12))
  lit.push(along(w, barrel, dark, 53, 91, BORE.sniper[1]))
  for (const x of [62, 70, 78]) fine.push(along(w, torus(1.8 * K, 0.006, 4, 12).rotateX(Math.PI / 2), body, x, x, BORE.sniper[1]))
  for (const s of [-1, 1]) lit.push(at(rbox(0.016, 22 * K, 0.022, 0.6, 4, 4), dark, [s * 0.03, fy(w, 71), fz(w, 25)], [-0.04, 0, 0]))
  // The brake, ported, its bore open at the front.
  const bH = 9 * K
  const brake = paintBored(bored(3 * K, 1.5 * K, bH, 0.07, 12), 1.5 * K, bH, body)
  lit.push(along(w, brake, body, 88, 97, BORE.sniper[1]))
  for (const x of [91.7, 94.7]) fine.push(block(w, INK, x - 0.7, 19.2, 1.4, 4.4, 0.13, 0.5))
  // The scope: tube, eyepiece, the objective's bell with its glass, on two mounts.
  lit.push(along(w, rcyl(2.6 * K, 25 * K, 0.01, 12, 1), body, 30, 55, 12.25))
  lit.push(along(w, rcyl(2.2 * K, 5 * K, 0.012, 12, 1), body, 25.5, 30.5, 12.25))
  const bell = rcone(2.7 * K, 4.2 * K, 7 * K, 0.012, 12)
  lit.push(at(bell, body, [0, fy(w, 57.5), fz(w, 12.25)], [Math.PI, 0, 0]))
  glow.push(along(w, rcyl(3.4 * K, 0.012, 0.004, 16, 1), hi, 61.8, 61.8, 12.25))
  for (const x of [36, 47]) lit.push(block(w, dark, x, 14.2, 3, 3.6, 0.05, 0.5))
  for (const x of [41.5]) lit.push(sideDisc(w, dark, x, 12.25, 1.6, 0.075))
  // Magazine, grip, trigger guard, the bolt and its glowing knob on the right.
  lit.push(block(w, dark, 38, 26, 6, 7.5, 0.075, 0.45, 0.12))
  lit.push(block(w, dark, 28, 25.5, 5.2, 9.5, 0.07, 0.45, -0.32))
  fine.push(at(torus(2.6 * K, 0.008, 4, 10, Math.PI).rotateX(-Math.PI / 2).rotateZ(Math.PI / 2), INK, [0, fy(w, 35.5), fz(w, 26.6)]))
  lit.push(at(rcyl(0.012, 0.09, 0.004, 6, 1), dark, [-0.09, fy(w, 49), fz(w, 21)], [0, 0, Math.PI / 2]))
  glow.push(at(sph(2 * K, 8, 6), hi, [-0.14, fy(w, 49), fz(w, 21)]))
  return p
}

const minigun = (): Parts => {
  const w: WeaponId = 'minigun'
  const { body, dark, hi } = WEAPON_LOOK[w]
  const p = newParts()
  const { lit, fine, glow } = p
  // The belt box at the back, the belt (its rounds lit) into the housing.
  lit.push(block(w, dark, 4, 27, 15, 10, 0.16, 0.3))
  fine.push(block(w, INK, 5.5, 29.5, 12, 1, 0.165, 0.6))
  for (let i = 0; i < 5; i++) {
    const t = i / 4
    const x = 19.5 + t * 8.5
    const y = 30 + Math.sin(t * Math.PI) * 2.8
    glow.push(at(rbox(0.05, 1.3 * K, 1.9 * K, 0.6, 4, 4), hi, [0, fy(w, x), fz(w, y)], [0.4 - t * 0.8, 0, 0]))
  }
  // The motor housing, its drum on both sides with a lit hub, the cap, two lit lines.
  lit.push(block(w, body, 18, 10, 25, 20, 0.28, 0.3))
  lit.push(sideDisc(w, dark, 18, 20, 7, 0.31))
  for (const s of [-1, 1]) glow.push(sideDisc(w, hi, 18, 20, 2.4, 0.012, s * 0.168))
  for (const s of [-1, 1]) glow.push(at(rbox(0.012, 19 * K, 0.014, 0.6, 4, 4), hi, [s * 0.141, fy(w, 31), fz(w, 13)]))
  for (const s of [-1, 1]) glow.push(at(rbox(0.012, 0.014, 11 * K, 0.6, 4, 4), hi, [s * 0.141, fy(w, 36), fz(w, 20.5)]))
  // The carry handle, an arch over the housing.
  const arch = torus(7 * K, 1.4 * K, 6, 14, Math.PI)
  arch.rotateX(Math.PI / 2)
  arch.rotateZ(Math.PI / 2)
  lit.push(at(arch, body, [0, fy(w, 30), fz(w, 10.2)]))
  // The grip under it.
  lit.push(block(w, dark, 26.5, 29.5, 6, 8, 0.075, 0.45, -0.3))
  return p
}

/** The mini-gun's turning part, in the weapon frame: barrels, spindle, clamps and the muzzle collar. */
const minigunSpin = (): Parts => {
  const w: WeaponId = 'minigun'
  const { body, dark, hi } = WEAPON_LOOK[w]
  const p = newParts()
  const { lit, glow } = p
  const y = BORE.minigun[1]
  const bH = 57 * K
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const g = paintBored(bored(1.45 * K, 0.75 * K, bH, 0.05, 8), 0.75 * K, bH, dark)
    lit.push(at(g, dark, [Math.cos(a) * 5 * K, fy(w, 68.5), fz(w, y) + Math.sin(a) * 5 * K]))
  }
  lit.push(along(w, rcyl(1.6 * K, 55 * K, 0.01, 10, 1), INK, 41, 96, y))
  for (const x of [58.5, 82.5]) lit.push(along(w, rcyl(7.6 * K, 5 * K, 0.014, 14, 1), body, x - 2.5, x + 2.5, y))
  lit.push(along(w, bored(8.3 * K, 7.4 * K, 5.4 * K, 0.08, 16), body, 90.6, 96, y))
  glow.push(along(w, torus(7.85 * K, 0.006, 4, 16).rotateX(Math.PI / 2), hi, 96.3, 96.3, y))
  glow.push(along(w, rcyl(7.2 * K, 0.014, 0.004, 14, 1), hi, 43, 43, y))
  return p
}

const launcher = (): Parts => {
  const w: WeaponId = 'rocket'
  const { body, dark, hi } = WEAPON_LOOK[w]
  const p = newParts()
  const { lit, fine, glow } = p
  const y = BORE.rocket[1]
  // The tube, a lit line along its top.
  lit.push(along(w, rcyl(6 * K, 75 * K, 0.02, 14, 2), body, 10.5, 85.5, y))
  glow.push(at(rbox(0.014, 70 * K, 0.014, 0.6, 4, 4), hi, [0.05, fy(w, 48), fz(w, 15.3)]))
  // The flared muzzle, open, the rocket's lit nose sitting inside it.
  const mH = 13 * K
  const flare = paintBored(bored(10 * K, 7.6 * K, mH, 0.12, 16, 6.6 * K), 7.6 * K, mH, body)
  lit.push(along(w, flare, body, 84, 97, y))
  glow.push(at(rcone(5.6 * K, 0.006, 6 * K, 0.004, 14), hi, [0, fy(w, 93.2), fz(w, y)], [Math.PI, 0, 0]))
  // The back-blast vent, open behind.
  const vH = 8 * K
  const vent = paintBored(bored(8.5 * K, 6.2 * K, vH, 0.07, 12, 6.4 * K), 6.2 * K, vH, dark)
  lit.push(at(vent, dark, [0, fy(w, 7), fz(w, y)], [Math.PI, 0, 0]))
  // The rings, the hazard band.
  for (const x of [21.75, 75.75]) lit.push(along(w, rcyl(7.4 * K, 3.5 * K, 0.012, 14, 1), dark, x - 1.75, x + 1.75, y))
  const band = rcyl(6.8 * K, 10 * K, 0.006, 16, 1)
  lit.push(along(w, band, WARN, 60, 70, y))
  // The sight on top, its post, its lit lens.
  lit.push(block(w, dark, 40, 7.5, 12, 5, 0.07, 0.4))
  lit.push(block(w, dark, 44.5, 11.5, 3, 3.2, 0.05, 0.5))
  glow.push(at(rcyl(1.4 * K, 0.012, 0.004, 12, 1), hi, [0, fy(w, 52.3), fz(w, 10)]))
  fine.push(block(w, INK, 41.5, 8.6, 6, 1, 0.075, 0.6))
  // Both grips.
  lit.push(block(w, dark, 33, 25.5, 6, 9, 0.075, 0.45, -0.25))
  lit.push(block(w, dark, 54.5, 25.5, 5.5, 7.5, 0.075, 0.45, -0.2))
  return p
}

/** A weapon's parts in its bone's frame (for the mini-gun, without its turning barrels: `weaponSpinParts`). */
export const weaponBodyParts = (id: WeaponId): Parts => (id === 'sniper' ? rifle() : id === 'minigun' ? minigun() : launcher())

/** The parts that turn (the mini-gun's barrels), still in the weapon frame; empty for the others. */
export const weaponSpinParts = (id: WeaponId): Parts => (id === 'minigun' ? minigunSpin() : newParts())

/** Every part of a weapon, in its frame. */
export const weaponModelParts = (id: WeaponId): Parts => {
  const a = weaponBodyParts(id)
  const b = weaponSpinParts(id)
  return { lit: [...a.lit, ...b.lit], fine: [...a.fine, ...b.fine], glow: [...a.glow, ...b.glow] }
}

/** Move parts by an offset (used to hang the turning barrels on their own bone). */
export const shiftParts = (p: Parts, by: V3): Parts => {
  for (const k of ['lit', 'fine', 'glow'] as const) for (const g of p[k]) xform(g, by)
  return p
}
