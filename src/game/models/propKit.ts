import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three'
import { lathe, merge, paint, rbox, stripUv, xform, type V3 } from './kit'
import { glowVC, outlineMat, toonGlowVC, toonVC } from './toon'

/**
 * ─── Static props, kept as parts until they are merged ───────────────────────
 *
 * The Command Base's set pieces (the deck, the furnace, the weapons lab, the
 * disguise shelf, the far islands) are built as lists of painted parts: lit
 * ones with an ink outline, lit `fine` ones without (rivets, bolts, panel
 * lines: an outline would blot them), and glowing ones. The scene merges
 * the lists into one mesh each, so a whole set is three draw calls; the
 * tests read the parts one by one, so no two of them may share a face.
 */

export interface Parts {
  lit: BufferGeometry[]
  fine: BufferGeometry[]
  glow: BufferGeometry[]
}

export const newParts = (): Parts => ({ lit: [], fine: [], glow: [] })

/** Place and paint one part. */
export const at = (g: BufferGeometry, color: string, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry =>
  paint(xform(g, p, r, s), color)

/** Every part of `from`, moved by one transform, added to `into`. */
export const addParts = (into: Parts, from: Parts, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1): Parts => {
  for (const k of ['lit', 'fine', 'glow'] as const) {
    for (const g of from[k]) into[k].push(xform(g, p, r, s))
  }
  return into
}

export const allParts = (p: Parts): BufferGeometry[] => [...p.lit, ...p.fine, ...p.glow]

export const disposeParts = (p: Parts): void => {
  for (const g of allParts(p)) g.dispose()
}

export interface Prop {
  group: Group
  dispose(): void
}

/**
 * Merge a part list into a prop: the lit and fine parts into one toon mesh,
 * the lit ones again into its outline, the glowing ones into one unlit
 * mesh. The parts are freed; the materials are the scene's shared ones.
 */
export const assembleParts = (name: string, parts: Parts, outline = 0.03, glowMat: Material = glowVC()): Prop => {
  const group = new Group()
  group.name = name
  const geos: BufferGeometry[] = []
  const solid = [...parts.lit, ...parts.fine]
  if (solid.length) {
    const body = merge(solid)
    geos.push(body)
    group.add(new Mesh(body, toonVC()))
    if (outline > 0 && parts.lit.length) {
      const ink = parts.fine.length ? merge(parts.lit) : body
      if (ink !== body) geos.push(ink)
      const line = new Mesh(ink, outlineMat(outline))
      line.renderOrder = -1
      group.add(line)
    }
  }
  if (parts.glow.length) {
    const g = merge(parts.glow)
    geos.push(g)
    group.add(new Mesh(g, glowMat))
  }
  disposeParts(parts)
  return { group, dispose: () => { for (const g of geos) g.dispose() } }
}

/** Only what a batched mesh draws with, indexed, and flagged lit (0) or glowing (1). */
const batchable = (g: BufferGeometry, glow: number): BufferGeometry => {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k)
  if (!g.attributes.normal) g.computeVertexNormals()
  const n = g.attributes.position!.count
  if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i))
  g.setAttribute('aGlow', new Float32BufferAttribute(new Float32Array(n).fill(glow), 1))
  return g
}

/** A part pushed out along its normals by `w`: exactly what the outline shader does, baked, so outlines of any width share a mesh. */
const inflate = (g: BufferGeometry, w: number): BufferGeometry => {
  const o = g.clone()
  const p = o.attributes.position!
  const nrm = o.attributes.normal!
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + nrm.getX(i) * w, p.getY(i) + nrm.getY(i) * w, p.getZ(i) + nrm.getZ(i) * w)
  return o
}

/**
 * Several part lists, each with its own outline width, as TWO draw calls
 * however many there are: every lit, fine and glowing part in one mesh
 * (`toonGlowVC`: the glowing ones unlit), and every outline, baked to its
 * own width, in one more. For what never moves (the base's whole set).
 */
export const assembleBatch = (name: string, sets: ReadonlyArray<{ parts: Parts; outline: number }>): Prop => {
  const group = new Group()
  group.name = name
  const solid: BufferGeometry[] = []
  const ink: BufferGeometry[] = []
  for (const { parts, outline } of sets) {
    for (const g of [...parts.lit, ...parts.fine]) solid.push(batchable(g, 0))
    for (const g of parts.glow) solid.push(batchable(g, 1))
    if (outline > 0) for (const g of parts.lit) ink.push(inflate(g, outline))
  }
  const geos: BufferGeometry[] = []
  if (solid.length) {
    const body = merge(solid)
    geos.push(body)
    group.add(new Mesh(body, toonGlowVC()))
  }
  if (ink.length) {
    const lines = merge(ink)
    geos.push(lines)
    const line = new Mesh(lines, outlineMat(0))
    line.renderOrder = -1
    group.add(line)
  }
  for (const g of [...solid, ...ink]) g.dispose()
  return { group, dispose: () => { for (const g of geos) g.dispose() } }
}

// ─── Shapes the kit does not have ────────────────────────────────────────────

/**
 * A hexagonal ring (a rim, a collar): its inner and outer walls straight,
 * corners at ±x (flat sides facing ±z), between heights `y0` and `y1`.
 */
export const hexRing = (rIn: number, rOut: number, y0: number, y1: number): BufferGeometry =>
  xform(lathe([[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1], [rIn, y0]], 6), [0, 0, 0], [0, Math.PI / 6, 0])

/**
 * A solid lofted through closed rings of points (each ring the same count,
 * in order round the shape): a hull, a wing, a fin. Smooth normals along
 * and round it; flat caps on both ends. Wound to face outward whichever way
 * round the rings are given.
 */
export const loft = (rings: ReadonlyArray<ReadonlyArray<V3>>, caps = true): BufferGeometry => {
  const n = rings[0]!.length
  const pos: number[] = []
  const idx: number[] = []
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2])
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i
      const b = r * n + ((i + 1) % n)
      const c = (r + 1) * n + i
      const d = (r + 1) * n + ((i + 1) % n)
      idx.push(a, b, d, a, d, c)
    }
  }
  if (caps) {
    for (const [ri, flip] of [[0, true], [rings.length - 1, false]] as const) {
      const ring = rings[ri]!
      const mid = new Vector3()
      for (const p of ring) mid.add(new Vector3(p[0], p[1], p[2]))
      mid.divideScalar(n)
      const base = pos.length / 3
      for (const p of ring) pos.push(p[0], p[1], p[2])
      pos.push(mid.x, mid.y, mid.z)
      for (let i = 0; i < n; i++) {
        const a = base + i
        const b = base + ((i + 1) % n)
        if (flip) idx.push(base + n, b, a)
        else idx.push(base + n, a, b)
      }
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  // Outward: a closed solid's signed volume is positive.
  let vol = 0
  const A = new Vector3(); const B = new Vector3(); const C = new Vector3()
  const P = g.attributes.position!
  for (let i = 0; i < idx.length; i += 3) {
    A.fromBufferAttribute(P, idx[i]!); B.fromBufferAttribute(P, idx[i + 1]!); C.fromBufferAttribute(P, idx[i + 2]!)
    vol += A.dot(B.cross(C))
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]!; idx[i + 1] = idx[i + 2]!; idx[i + 2] = t }
    g.setIndex(idx)
  }
  g.computeVertexNormals()
  return g
}

/**
 * A chamfered section for `loft`: a box `w` wide between heights `y0` and
 * `y1`, its corners cut by `c` (the top ones) and `cb` (the bottom ones), at
 * depth `z`. Eight points, round from the top.
 */
export const chamferRing = (z: number, w: number, y0: number, y1: number, c: number, cb = c): V3[] => {
  const h = w / 2
  return [
    [h - c, y1, z], [h, y1 - c, z], [h, y0 + cb, z], [h - cb, y0, z],
    [-h + cb, y0, z], [-h, y0 + cb, z], [-h, y1 - c, z], [-h + c, y1, z]
  ]
}

const _up = new Vector3(0, 1, 0)
const _a = new Vector3()
const _b = new Vector3()
const _q = new Quaternion()
const _m = new Matrix4()

/** Stand a geometry built along +y between two points (its middle at their midpoint). */
const between = (g: BufferGeometry, a: V3, b: V3, roll = 0): BufferGeometry => {
  _a.set(a[0], a[1], a[2])
  _b.set(b[0], b[1], b[2])
  const dir = _b.clone().sub(_a).normalize()
  _q.setFromUnitVectors(_up, dir)
  if (roll) _q.multiply(new Quaternion().setFromAxisAngle(_up, roll))
  _m.compose(_a.add(_b).multiplyScalar(0.5), _q, new Vector3(1, 1, 1))
  return g.applyMatrix4(_m)
}

/** A rod (pipe, rail, strut) from `a` to `b`. */
export const rod = (a: V3, b: V3, r: number, color: string, segs = 8): BufferGeometry => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  return paint(between(stripUv(new CylinderGeometry(r, r, len, segs)), a, b), color)
}

/** A rounded beam `w` × `d` in section from `a` to `b`; `roll` turns it about its length. */
export const beam = (a: V3, b: V3, w: number, d: number, color: string, roll = 0, round = 0.3): BufferGeometry => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  return paint(between(rbox(w, len, d, round, 8, 6), a, b, roll), color)
}
