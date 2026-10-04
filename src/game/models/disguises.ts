import { BufferGeometry, Group } from 'three'
import { cap, ell, paint, rbox, rcone, rcyl, sph, torus, xform, type V3 } from './kit'
import { buildHideBox } from './hideBox'
import { assemblePieces, disposePieces } from './pieces'

/**
 * ─── The disguises (#97) ─────────────────────────────────────────────────────
 *
 * What the mech folds itself into when it hides (#111: like a Transformer,
 * in its own colours and parts, `pieces.ts`). The toaster is the one every
 * mech has; the rest are unlocked (one rewarded video each, or scrap where
 * there are no videos). They are looks only: every one keeps the same rules.
 * Each is about two metres across, built in code from the rig kit, origin at
 * the bottom middle, facing +z.
 */

export { DISGUISE_IDS, DISGUISE_SCRAP, FREE_DISGUISE, type DisguiseId } from './disguiseIds'
import type { DisguiseId } from './disguiseIds'

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0]): BufferGeometry => paint(xform(g, p, r), color)

const assemble = (name: string, lit: BufferGeometry[], glow: BufferGeometry[]): Group => assemblePieces(name, lit, glow)

/** A chrome toaster: two slots that glow, a lever on the side, a dial, and toast. */
const toaster = (): Group => {
  const CHROME = '#d9d4f2'
  const DARK = '#3b3654'
  const TOAST = '#e0a15a'
  const CRUST = '#9c5f2a'
  const lit: BufferGeometry[] = [
    part(rbox(2.0, 1.45, 1.4, 0.35, 10, 8), CHROME, [0, 0.72, 0]),
    part(rbox(1.96, 0.1, 1.36, 0.4, 8, 3), DARK, [0, 0.05, 0]),
    // The two slices sticking up out of their slots.
    part(rbox(0.72, 0.5, 0.16, 0.45, 6, 4), TOAST, [-0.42, 1.55, 0]),
    part(rbox(0.72, 0.5, 0.16, 0.45, 6, 4), TOAST, [0.42, 1.55, 0]),
    part(rbox(0.74, 0.06, 0.18, 0.4, 6, 2), CRUST, [-0.42, 1.8, 0]),
    part(rbox(0.74, 0.06, 0.18, 0.4, 6, 2), CRUST, [0.42, 1.8, 0]),
    // The lever and the dial.
    part(rbox(0.08, 0.5, 0.12, 0.4, 3, 3), DARK, [1.03, 0.85, 0.3]),
    part(rbox(0.16, 0.1, 0.24, 0.4, 3, 2), '#ff4fb6', [1.1, 1.05, 0.3]),
    part(rcyl(0.14, 0.06, 0.02, 12, 1), DARK, [0, 0.55, 0.72], [Math.PI / 2, 0, 0]),
    // Little feet.
    ...[[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]].map(([x, z]) => part(rcyl(0.1, 0.08, 0.02, 8, 1), DARK, [x!, 0.02, z!]))
  ]
  const glow: BufferGeometry[] = [
    // The slots glow orange where the elements are, and two eyes peer out of the grille.
    part(rbox(0.8, 0.04, 0.2, 0.4, 6, 2), '#ff8a3d', [-0.42, 1.46, 0]),
    part(rbox(0.8, 0.04, 0.2, 0.4, 6, 2), '#ff8a3d', [0.42, 1.46, 0]),
    part(rbox(0.32, 0.06, 0.04, 0.45, 4, 3), '#5fe9ff', [-0.3, 1.0, 0.71], [0, 0, 0.1]),
    part(rbox(0.32, 0.06, 0.04, 0.45, 4, 3), '#5fe9ff', [0.3, 1.0, 0.71], [0, 0, -0.1])
  ]
  return assemble('disguise-toaster', lit, glow)
}

/** A jack-in-the-box: a striped box, a crank, and a clown's head on its spring peeking out. */
const clown = (): Group => {
  const lit: BufferGeometry[] = []
  const faces = ['#ff4fb6', '#5fe9ff', '#ffd23f', '#9a78ff']
  for (let f = 0; f < 4; f++) {
    const r = (f * Math.PI) / 2
    lit.push(part(rbox(1.9, 1.5, 0.08, 0.2, 4, 4), faces[f]!, [Math.sin(r) * 0.95, 0.75, Math.cos(r) * 0.95], [0, r, 0]))
  }
  lit.push(
    part(rbox(1.9, 0.08, 1.9, 0.2, 4, 2), '#ffffff', [0, 0.04, 0]),
    // The lid, flung open behind.
    part(rbox(1.9, 0.08, 1.9, 0.2, 4, 2), '#ff4fb6', [0, 1.9, -1.2], [-1.2, 0, 0]),
    // The spring and the head.
    part(torus(0.25, 0.05, 4, 12), '#c9c4e6', [0, 1.6, 0], [Math.PI / 2, 0, 0]),
    part(torus(0.25, 0.05, 4, 12), '#c9c4e6', [0, 1.75, 0], [Math.PI / 2, 0, 0]),
    part(sph(0.42, 12, 10), '#fff1e0', [0, 2.15, 0]),
    part(sph(0.12, 8, 6), '#ff2244', [0, 2.12, 0.42]),
    part(rcone(0.36, 0.02, 0.5, 0.02, 10), '#ffd23f', [0, 2.75, 0]),
    // The crank.
    part(rcyl(0.04, 0.4, 0.01, 6, 1), '#3b3654', [1.12, 0.9, 0], [0, 0, Math.PI / 2]),
    part(rcyl(0.07, 0.25, 0.02, 6, 1), '#ff4fb6', [1.32, 0.78, 0])
  )
  const glow: BufferGeometry[] = [
    part(sph(0.06, 6, 4), '#5fe9ff', [-0.15, 2.25, 0.38]),
    part(sph(0.06, 6, 4), '#5fe9ff', [0.15, 2.25, 0.38])
  ]
  return assemble('disguise-clown', lit, glow)
}

/** A wooden trojan horse on wheels: a barrel body, a long neck and head, a mane. */
const horse = (): Group => {
  const WOOD = '#b07a4a'
  const DARK = '#7a4f2c'
  const lit: BufferGeometry[] = [
    part(rbox(1.0, 0.95, 2.1, 0.45, 10, 8), WOOD, [0, 1.15, 0]),
    // Legs on a plank with four wheels.
    ...[[-0.35, -0.75], [0.35, -0.75], [-0.35, 0.75], [0.35, 0.75]].map(([x, z]) => part(rbox(0.18, 0.7, 0.18, 0.4, 3, 3), DARK, [x!, 0.55, z!])),
    part(rbox(1.2, 0.12, 2.3, 0.3, 4, 2), DARK, [0, 0.2, 0]),
    ...[[-0.65, -0.9], [0.65, -0.9], [-0.65, 0.9], [0.65, 0.9]].map(([x, z]) => part(rcyl(0.2, 0.08, 0.02, 10, 1), '#3b3654', [x!, 0.2, z!], [0, 0, Math.PI / 2])),
    // The neck and the head.
    part(rbox(0.5, 1.0, 0.5, 0.4, 6, 6), WOOD, [0, 1.95, 0.85], [0.35, 0, 0]),
    part(rbox(0.45, 0.45, 0.85, 0.45, 6, 6), WOOD, [0, 2.45, 1.25]),
    part(rbox(0.12, 0.3, 0.12, 0.4, 3, 3), DARK, [-0.15, 2.75, 1.0]),
    part(rbox(0.12, 0.3, 0.12, 0.4, 3, 3), DARK, [0.15, 2.75, 1.0]),
    // The mane and the tail.
    part(rbox(0.12, 0.9, 0.3, 0.4, 3, 4), DARK, [0, 2.15, 0.6], [0.35, 0, 0]),
    part(cap(0.07, 0.5, 6, 2), DARK, [0, 1.2, -1.15], [0.6, 0, 0])
  ]
  const glow: BufferGeometry[] = [
    part(sph(0.06, 6, 4), '#5fe9ff', [-0.2, 2.55, 1.5]),
    part(sph(0.06, 6, 4), '#5fe9ff', [0.2, 2.55, 1.5])
  ]
  const g = assemble('disguise-horse', lit, glow)
  // A horse is long: kept to the box's footprint, near enough.
  g.scale.setScalar(0.88)
  return g
}

/** A leafy bush: green lumps of leaves over a few twigs. */
const bush = (): Group => {
  const LEAF = ['#3fbf5a', '#2f9a48', '#58d66e']
  const lit: BufferGeometry[] = []
  const lumps: Array<[number, number, number, number]> = [
    [0, 0.75, 0, 0.85], [-0.6, 0.6, 0.25, 0.6], [0.62, 0.62, -0.2, 0.62], [0.2, 1.25, 0.2, 0.55],
    [-0.35, 1.15, -0.35, 0.5], [0.45, 0.45, 0.6, 0.45], [-0.5, 0.45, -0.6, 0.45], [0.05, 1.55, -0.05, 0.38]
  ]
  lumps.forEach(([x, y, z, r], i) => lit.push(part(ell(r, r * 0.85, r, 10, 8), LEAF[i % LEAF.length]!, [x, y, z])))
  for (const [x, z, a] of [[-0.3, 0.7, 0.3], [0.5, 0.5, -0.4], [0, -0.7, 0.2]] as const) lit.push(part(cap(0.03, 0.45, 5, 2), '#7a4f2c', [x, 1.2, z], [a, 0, a]))
  const glow: BufferGeometry[] = [
    part(sph(0.05, 6, 4), '#5fe9ff', [-0.14, 1.0, 0.8]),
    part(sph(0.05, 6, 4), '#5fe9ff', [0.14, 1.0, 0.8])
  ]
  return assemble('disguise-bush', lit, glow)
}

/** A big teddy bear sitting with its legs out: round ears, a snout, a bow. */
const teddy = (): Group => {
  const FUR = '#c48b5a'
  const LIGHT = '#e8c49a'
  const lit: BufferGeometry[] = [
    part(ell(0.85, 0.75, 0.7, 12, 10), FUR, [0, 0.75, -0.05]),
    part(ell(0.5, 0.4, 0.06, 10, 6), LIGHT, [0, 0.72, 0.62]),
    part(sph(0.6, 14, 10), FUR, [0, 1.75, 0.05]),
    part(sph(0.22, 8, 6), FUR, [-0.45, 2.25, 0]),
    part(sph(0.22, 8, 6), FUR, [0.45, 2.25, 0]),
    part(sph(0.12, 8, 6), LIGHT, [-0.45, 2.25, 0.12]),
    part(sph(0.12, 8, 6), LIGHT, [0.45, 2.25, 0.12]),
    part(ell(0.24, 0.17, 0.2, 10, 6), LIGHT, [0, 1.65, 0.56]),
    part(sph(0.07, 6, 4), '#3b2418', [0, 1.72, 0.74]),
    // The legs out in front, the arms at the sides.
    part(ell(0.28, 0.25, 0.42, 8, 6), FUR, [-0.45, 0.25, 0.55]),
    part(ell(0.28, 0.25, 0.42, 8, 6), FUR, [0.45, 0.25, 0.55]),
    part(ell(0.22, 0.4, 0.22, 8, 6), FUR, [-0.85, 0.85, 0.15], [0, 0, 0.4]),
    part(ell(0.22, 0.4, 0.22, 8, 6), FUR, [0.85, 0.85, 0.15], [0, 0, -0.4]),
    // A bow at the neck.
    part(ell(0.18, 0.12, 0.08, 8, 6), '#ff4fb6', [-0.18, 1.25, 0.55], [0, 0, 0.4]),
    part(ell(0.18, 0.12, 0.08, 8, 6), '#ff4fb6', [0.18, 1.25, 0.55], [0, 0, -0.4]),
    part(sph(0.07, 6, 4), '#ff4fb6', [0, 1.25, 0.58])
  ]
  const glow: BufferGeometry[] = [
    part(sph(0.08, 8, 6), '#5fe9ff', [-0.2, 1.86, 0.52]),
    part(sph(0.08, 8, 6), '#5fe9ff', [0.2, 1.86, 0.52])
  ]
  return assemble('disguise-teddy', lit, glow)
}

/** Build a disguise's model. The crate is the original hide box. */
export const buildDisguise = (id: DisguiseId): Group => {
  switch (id) {
    case 'toaster': return toaster()
    case 'crate': return buildHideBox()
    case 'clown': return clown()
    case 'horse': return horse()
    case 'bush': return bush()
    case 'teddy': return teddy()
  }
}

export const disposeDisguise = (g: Group): void => disposePieces(g)

export { morphDisguise } from './pieces'
