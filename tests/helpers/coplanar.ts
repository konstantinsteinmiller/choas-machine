// The user's hard rule: never two opaque faces in one plane. A prop built
// from separate parts (merged into one mesh only at the end) is exactly where
// it happens: a plate laid on a deck, a stripe on a hull, two steps of one
// width. This finds every pair of parts with a face of one lying in a face of
// the other, facing the same way, within `tol` metres.

import { Box3, Vector3, type BufferGeometry } from 'three'

interface Tri { a: Vector3; b: Vector3; c: Vector3; n: Vector3; mid: Vector3; box: Box3 }

/** Strictly inside triangle `t` (in its plane), off its edges. */
const inside = (p: Vector3, t: Tri): boolean => {
  const v0 = t.c.clone().sub(t.a)
  const v1 = t.b.clone().sub(t.a)
  const v2 = p.clone().sub(t.a)
  const d00 = v0.dot(v0); const d01 = v0.dot(v1); const d11 = v1.dot(v1)
  const d20 = v2.dot(v0); const d21 = v2.dot(v1)
  const den = d00 * d11 - d01 * d01
  if (Math.abs(den) < 1e-18) return false
  const u = (d11 * d20 - d01 * d21) / den
  const w = (d00 * d21 - d01 * d20) / den
  return u > 0.01 && w > 0.01 && u + w < 0.99
}

const trisOf = (g: BufferGeometry): Tri[] => {
  const pos = g.attributes.position!
  const idx = g.index
  const n = idx ? idx.count : pos.count
  const at = (i: number): Vector3 => new Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i)
  const out: Tri[] = []
  for (let i = 0; i < n; i += 3) {
    const a = at(i); const b = at(i + 1); const c = at(i + 2)
    const nrm = b.clone().sub(a).cross(c.clone().sub(a))
    // Slivers (lathe poles, degenerate caps) have no plane to share.
    if (nrm.length() < 1e-7) continue
    nrm.normalize()
    out.push({ a, b, c, n: nrm, mid: a.clone().add(b).add(c).divideScalar(3), box: new Box3().setFromPoints([a, b, c]) })
  }
  return out
}

const overlaps = (s: Tri, o: Tri): boolean =>
  inside(s.mid, o) || inside(o.mid, s) || [s.a, s.b, s.c].some(p => inside(p, o)) || [o.a, o.b, o.c].some(p => inside(p, s))

/**
 * Pairs of parts (by index, or by `names`) that share a face: same facing
 * (normals within ~2.5°), in one plane within `tol`, overlapping.
 */
export const coplanarClashes = (parts: readonly BufferGeometry[], tol = 0.01, names?: readonly string[]): string[] => {
  const tris = parts.map(trisOf)
  const boxes = parts.map(g => new Box3().setFromBufferAttribute(g.attributes.position as never).expandByScalar(tol))
  const clashes: string[] = []
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!boxes[i]!.intersectsBox(boxes[j]!)) continue
      const near = tris[j]!.filter(t => t.box.intersectsBox(boxes[i]!))
      if (!near.length) continue
      let hit = false
      for (const s of tris[i]!) {
        if (!s.box.intersectsBox(boxes[j]!)) continue
        for (const o of near) {
          if (s.n.dot(o.n) < 0.999) continue
          if (Math.abs(s.mid.clone().sub(o.a).dot(o.n)) > tol) continue
          if (!s.box.clone().expandByScalar(tol).intersectsBox(o.box)) continue
          if (overlaps(s, o)) { hit = true; break }
        }
        if (hit) break
      }
      if (hit) clashes.push(`${names?.[i] ?? i} / ${names?.[j] ?? j}`)
    }
  }
  return clashes
}
