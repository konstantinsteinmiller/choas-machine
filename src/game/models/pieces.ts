import { Box3, BufferGeometry, Color, CylinderGeometry, Euler, Group, Mesh, Quaternion, SphereGeometry, SRGBColorSpace, Vector3 } from 'three'
import { paint } from './kit'
import { glowVC, toonVC } from './toon'
import { PAL } from './palette'

/**
 * ─── A disguise built from the mech's own parts (round 4, #111) ──────────────
 *
 * The mech does not hide UNDER a disguise: it folds itself into one, like a
 * Transformer. Every disguise is kept as its separate pieces (each turning
 * about its own middle), recoloured into the mech's own lilac armour, dark
 * suit, cyan core and pink eyes, and `morphDisguise` flies the pieces out of
 * the mech's chest into place one after another, tumbling, with a little
 * overshoot as each locks in; backwards, they fold away into it again.
 */

interface Piece {
  mesh: Mesh
  home: Vector3
  /** Where it starts, folded inside the mech's chest, and how it tumbles out. */
  from: Vector3
  spin: Quaternion
  /** When, 0 … 1 through the morph, it starts to move. */
  delay: number
}

/** Where the mech's chest is, relative to the disguise's foot: the pieces come out of it. */
const CHEST: readonly [number, number, number] = [0, 1.3, 0.1]
/** The share of the morph each piece takes to fly into place. */
const FLIGHT = 0.5

const hash = (i: number, k: number): number => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const tmp = new Color()
/**
 * A colour as the mech wears it: by brightness, its armour (light to deep)
 * or its suit (dark); a small, strongly coloured accent in the mech's pink.
 *
 * The brightness is the one the colour was authored in (sRGB hex). The vertex
 * colour holds it LINEAR (`paint`), where a mid tone reads far darker: a
 * wooden horse (#b07a4a) is 0.49 light in sRGB but 0.25 linear, which put
 * every disguise but the chrome toaster into the mech's near-black suit.
 */
const mechTone = (geo: BufferGeometry, small: boolean): string => {
  const c = geo.attributes.color
  if (!c) return PAL.mechArmor
  tmp.setRGB(c.getX(0), c.getY(0), c.getZ(0))
  const hsl = { h: 0, s: 0, l: 0 }
  tmp.getHSL(hsl, SRGBColorSpace)
  if (small && hsl.s > 0.55 && hsl.l > 0.35 && hsl.l < 0.8) return PAL.mechEye
  return hsl.l > 0.78 ? PAL.mechArmorHi : hsl.l > 0.55 ? PAL.mechArmor : hsl.l > 0.36 ? PAL.mechArmorDeep : hsl.l > 0.2 ? PAL.mechSuit : PAL.mechSuitDeep
}

/**
 * Build a disguise from its pieces (already placed, painted geometries):
 * each becomes its own mesh about its own middle, recoloured as the mech;
 * the glowing ones are the mech's eyes (pink) and power lines (cyan).
 */
export const assemblePieces = (name: string, lit: BufferGeometry[], glow: BufferGeometry[], lift = 0.05): Group => {
  const group = new Group()
  group.name = name
  const toon = toonVC()
  const shine = glowVC()
  const pieces: Piece[] = []
  const add = (geo: BufferGeometry, glowing: boolean, i: number): void => {
    geo.computeBoundingBox()
    const box = geo.boundingBox!
    const mid = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3())
    const small = size.x * size.y * size.z < 0.06
    // Glowing pieces: two little ones side by side are eyes (pink); the rest the core's cyan.
    const tone = glowing ? (small && size.x < 0.45 ? PAL.mechEye : PAL.mechCore) : mechTone(geo, small)
    paint(geo, tone)
    geo.translate(-mid.x, -mid.y, -mid.z)
    const mesh = new Mesh(geo, glowing ? shine : toon)
    const home = new Vector3(mid.x, mid.y + lift, mid.z)
    mesh.position.copy(home)
    group.add(mesh)
    const from = new Vector3(CHEST[0] + (hash(i, 1) - 0.5) * 0.5, CHEST[1] + (hash(i, 2) - 0.5) * 0.4, CHEST[2] + (hash(i, 3) - 0.5) * 0.3)
    const spin = new Quaternion().setFromEuler(new Euler((hash(i, 4) - 0.5) * 6, (hash(i, 5) - 0.5) * 6, (hash(i, 6) - 0.5) * 6))
    pieces.push({ mesh, home, from, spin, delay: 0 })
  }
  // The mech's own antenna rides on top of whatever it has become, its tip pink: you can tell it is the mech.
  const all = new Box3()
  for (const g of [...lit, ...glow]) { g.computeBoundingBox(); all.union(g.boundingBox!) }
  const ax = all.max.x * 0.45
  const az = (all.min.z + all.max.z) / 2 - 0.15
  // Planted on whatever piece is under that spot (not floating over a taller one elsewhere).
  let top = 0
  for (const g of lit) {
    const b = g.boundingBox!
    if (ax >= b.min.x && ax <= b.max.x && az >= b.min.z && az <= b.max.z) top = Math.max(top, b.max.y)
  }
  if (top === 0) top = all.max.y
  const mast = paint(new CylinderGeometry(0.035, 0.035, 0.5, 6).translate(ax, top + 0.2, az), PAL.mechSuit)
  const tip = paint(new SphereGeometry(0.075, 8, 6).translate(ax, top + 0.48, az), PAL.mechEye)
  lit.push(mast)
  lit.forEach((g, i) => add(g, false, i))
  glow.forEach((g, i) => add(g, true, lit.length + i))
  add(tip, true, lit.length + glow.length)
  // The big pieces unfold first, the small ones (the trim, the eyes) last.
  const order = [...pieces].sort((a, b) => volume(b.mesh) - volume(a.mesh))
  order.forEach((p, i) => { p.delay = (i / Math.max(1, order.length)) * (1 - FLIGHT) })
  group.userData.pieces = pieces
  group.visible = false
  return group
}

const volume = (m: Mesh): number => {
  const b = m.geometry.boundingBox!
  return (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z)
}

/** Ease-out with a little overshoot: a piece locks in with a clack. */
const settle = (t: number): number => {
  const c = 1.7
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}
const ID = new Quaternion()

/**
 * Pose a disguise `k` of the way through its morph: 0 every piece folded
 * away in the mech's chest (hidden), 1 the disguise whole. Returns whether
 * any of it shows.
 */
export const morphDisguise = (g: Group, k: number): boolean => {
  const pieces = g.userData.pieces as Piece[] | undefined
  if (!pieces) return k > 0.01
  let any = false
  for (const p of pieces) {
    const t = Math.min(1, Math.max(0, (k - p.delay) / FLIGHT))
    p.mesh.visible = t > 0
    if (!p.mesh.visible) continue
    any = true
    const e = settle(t)
    p.mesh.position.lerpVectors(p.from, p.home, e)
    p.mesh.quaternion.slerpQuaternions(p.spin, ID, Math.min(1, t * 1.15))
    p.mesh.scale.setScalar(0.2 + 0.8 * Math.min(1.08, e))
  }
  return any
}

/**
 * Free a disguise's pieces. Not its two materials: they are the shared
 * `toonVC` / `glowVC` the pad, the level's props and the salvage draw with
 * too (`beacon.ts` keeps them the same way).
 */
export const disposePieces = (g: Group): void => {
  for (const c of g.children) (c as Mesh).geometry?.dispose()
}
