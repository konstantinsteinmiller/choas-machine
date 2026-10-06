import { Matrix4, Quaternion, Vector3, type BufferGeometry, type Mesh } from 'three'
import { rbox, rcyl, sph, torus, type V3 } from './kit'
import { glowVC } from './toon'
import { PAL } from './palette'
import { at, newParts, type Parts } from './propKit'
import { DISGUISE_IDS, buildDisguise, disposeDisguise, morphDisguise, type DisguiseId } from './disguises'

/**
 * ─── The disguise shelf ──────────────────────────────────────────────────────
 *
 * The Chassis Bay's display: a lit cabinet of six niches, one per disguise
 * (`DISGUISE_IDS`, three across, two high). A disguise the player owns
 * stands in its niche as a small model on a lit plinth; one still locked is
 * a dim hologram of itself over a plinth with its light low. Origin at the
 * foot; faces +z.
 *
 * The frame is static (`shelfParts`); what stands in the niches is baked
 * again whenever the owned set changes (`shelfContents`).
 */

const FRAME = '#4a3f8c'
const FRAME_DARK = '#2e2560'
const PANEL = '#5b4fa8'
const INK = '#241848'

const COLS = 3
const PITCH_X = 1.05
/** The floors of the two rows of niches, and the room above each. */
const FLOORS = [0.48, 1.68] as const
const PLINTH_TOP = 0.07
/** Where a model's back stands: 3 cm in front of the niche's back panel. */
const NICHE_BACK = -0.235
/** How big a disguise stands in its niche (they are about the hide box's size). */
export const SHELF_MODEL_SCALE = 0.27

/** Where niche `i` (in `DISGUISE_IDS` order: top row left to right, then the bottom) stands its model. */
export const nicheAt = (i: number): V3 => {
  const col = i % COLS
  const row = Math.floor(i / COLS)
  return [(col - 1) * PITCH_X, FLOORS[1 - row]! + PLINTH_TOP, -0.02]
}

export const shelfParts = (): Parts => {
  const p = newParts()
  const { lit, fine, glow } = p
  // The cabinet: a base, the back, two pillars, dividers, the middle shelf, a crest.
  lit.push(at(rbox(3.4, 0.5, 0.75, 0.15, 14, 6), FRAME_DARK, [0, 0.23, 0]))
  lit.push(at(rbox(3.3, 2.5, 0.08, 0.15, 14, 12), FRAME, [0, 1.68, -0.32]))
  for (const s of [-1, 1]) {
    lit.push(at(rbox(0.18, 2.66, 0.78, 0.18, 6, 14), FRAME_DARK, [s * 1.66, 1.62, 0]))
    glow.push(at(rbox(0.04, 2.2, 0.03, 0.3, 4, 10), PAL.glowCyan, [s * 1.66, 1.65, 0.4]))
  }
  for (const s of [-1, 1]) lit.push(at(rbox(0.08, 2.44, 0.6, 0.25, 4, 12), FRAME, [s * PITCH_X / 2, 1.68, -0.02]))
  lit.push(at(rbox(3.16, 0.08, 0.64, 0.25, 14, 4), FRAME_DARK, [0, FLOORS[1] - 0.04, -0.01]))
  lit.push(at(rbox(3.56, 0.24, 0.82, 0.2, 14, 6), FRAME_DARK, [0, 2.99, 0]))
  glow.push(at(rbox(3.2, 0.04, 0.03, 0.3, 10, 4), PAL.glowPink, [0, 2.97, 0.425]))
  for (const s of [-1, 0, 1]) {
    lit.push(at(rcyl(0.07, 0.1, 0.02, 8, 1), INK, [s * 1.2, 3.15, 0.1]))
    glow.push(at(sph(0.06, 8, 6), s === 0 ? PAL.glowPink : PAL.glowCyan, [s * 1.2, 3.22, 0.1]))
  }
  // Each niche: a lit back panel, a light along its top, a hex plinth.
  for (let i = 0; i < DISGUISE_IDS.length; i++) {
    const [x, y] = nicheAt(i)
    const floor = y - PLINTH_TOP
    lit.push(at(rbox(0.86, 1.0, 0.03, 0.25, 8, 8), PANEL, [x, floor + 0.55, -0.28]))
    const ceiling = Math.floor(i / COLS) === 1 ? FLOORS[1] - 0.08 : 2.87
    glow.push(at(rbox(0.72, 0.025, 0.05, 0.3, 6, 4), '#d8ccff', [x, ceiling - 0.005, 0.2]))
    lit.push(at(rcyl(0.3, 0.09, 0.025, 6, 2), FRAME_DARK, [x, floor + 0.025, -0.02], [0, Math.PI / 6, 0]))
    // Two bolts on the plinth's front edge, clear of what stands on it.
    for (const s of [-1, 1]) fine.push(at(sph(0.02, 5, 4), PAL.steel, [x + s * 0.1, floor + PLINTH_TOP, 0.21]))
  }
  return p
}

/** The plinths' rims: lit for an owned disguise, low for a locked one. */
export const shelfRimParts = (owned: ReadonlySet<DisguiseId>): Parts => {
  const p = newParts()
  DISGUISE_IDS.forEach((id, i) => {
    const [x, y, z] = nicheAt(i)
    p.glow.push(at(torus(0.24, 0.016, 4, 6), owned.has(id) ? PAL.glowCyan : '#4b3f8f', [x, y - 0.008, z], [Math.PI / 2, 0, Math.PI / 6]))
  })
  return p
}

export interface ShelfContents {
  /** The owned disguises' lit and glowing pieces, in the shelf's frame. */
  lit: BufferGeometry[]
  glow: BufferGeometry[]
  /** The locked ones' shapes, for the hologram (no colours). */
  holo: BufferGeometry[]
}

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _up = new Vector3(0, 1, 0)

/** One disguise, baked into niche `i`: its lit and glowing pieces if owned, its shape for a hologram if not. */
export const nicheModel = (id: DisguiseId, i: number, owned: boolean): ShelfContents => {
  const out: ShelfContents = { lit: [], glow: [], holo: [] }
  const shine = glowVC()
  const g = buildDisguise(id)
  morphDisguise(g, 1)
  g.updateMatrixWorld(true)
  const [x, y, z] = nicheAt(i)
  // Turned a little toward the middle of the room, sunk a hair into its plinth.
  _m.compose(_p.set(x, y - 0.006, z), _q.setFromAxisAngle(_up, -x * 0.18), _s.setScalar(SHELF_MODEL_SCALE))
  const all: BufferGeometry[] = []
  for (const c of g.children as Mesh[]) {
    const geo = c.geometry.clone()
    if (geo.attributes.uv) geo.deleteAttribute('uv')
    geo.applyMatrix4(c.matrix)
    geo.applyMatrix4(_m)
    all.push(geo)
    if (!owned) {
      geo.deleteAttribute('color')
      out.holo.push(geo)
    } else {
      ;(c.material === shine ? out.glow : out.lit).push(geo)
    }
  }
  disposeDisguise(g)
  // Its back a few centimetres off the niche's back panel, however deep it is.
  let back = Infinity
  for (const geo of all) { geo.computeBoundingBox(); back = Math.min(back, geo.boundingBox!.min.z) }
  for (const geo of all) geo.translate(0, 0, NICHE_BACK - back)
  return out
}

/** Bake every disguise into its niche: whole for an owned one, a hologram's shape for a locked one. */
export const shelfContents = (owned: ReadonlySet<DisguiseId>): ShelfContents => {
  const out: ShelfContents = { lit: [], glow: [], holo: [] }
  DISGUISE_IDS.forEach((id, i) => {
    const m = nicheModel(id, i, owned.has(id))
    out.lit.push(...m.lit)
    out.glow.push(...m.glow)
    out.holo.push(...m.holo)
  })
  // One index layout for each list, or they cannot merge.
  for (const k of ['lit', 'glow', 'holo'] as const) {
    if (!out[k].some(g => !g.index) || !out[k].some(g => g.index)) continue
    out[k] = out[k].map((g) => {
      if (!g.index) return g
      const flat = g.toNonIndexed()
      g.dispose()
      return flat
    })
  }
  return out
}
