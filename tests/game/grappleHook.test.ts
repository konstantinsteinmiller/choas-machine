// The grappling hook's look: a real grapnel head on a braided cable, in
// place of the old cyan cone on a cyan rod.

import { describe, expect, it } from 'vitest'
import { InstancedMesh, Matrix4, Mesh, Vector3, type BufferGeometry } from 'three'
import { rcyl } from '@/game/models/kit'
import {
  CABLE_SEGS, HOOK_EYE, HOOK_LEN, TWANG_S, hookHeadGeometry, makeGrappleVisual, tineGeometry, type Vec3
} from '@/game/fx/grappleHook'

const FROM: Vec3 = { x: 1, y: 2.05, z: 3 }
const TO: Vec3 = { x: 2.5, y: 8.5, z: 6 }
const dirOf = (a: Vec3, b: Vec3): Vector3 => new Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize()
const v = (p: Vec3): Vector3 => new Vector3(p.x, p.y, p.z)

const meshes = (vis: ReturnType<typeof makeGrappleVisual>): { body: Mesh; tines: InstancedMesh; cable: InstancedMesh } => {
  const inst = vis.group.children.filter((c): c is InstancedMesh => (c as InstancedMesh).isInstancedMesh)
  const headInst = vis.head.children.filter((c): c is InstancedMesh => (c as InstancedMesh).isInstancedMesh)
  return { body: vis.head.children[0] as Mesh, tines: headInst[0]!, cable: inst[0]! }
}

/** Where segment `i` of the cable starts and ends, in the world. */
const segment = (cable: InstancedMesh, i: number): [Vector3, Vector3] => {
  const m = new Matrix4()
  cable.getMatrixAt(i, m)
  return [new Vector3(0, 0, 0).applyMatrix4(m), new Vector3(0, 1, 0).applyMatrix4(m)]
}

/** Every vertex of a geometry, through a matrix. */
const points = (g: BufferGeometry, m: Matrix4): Vector3[] => {
  const pos = g.attributes.position!
  const out: Vector3[] = []
  for (let i = 0; i < pos.count; i++) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m))
  return out
}

const distToLine = (p: Vector3, a: Vector3, b: Vector3): number => {
  const ab = b.clone().sub(a)
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()))
  return p.distanceTo(a.clone().addScaledVector(ab, t))
}

interface Part { g: BufferGeometry; m: Matrix4; id: number }
interface Tri { a: Vector3; b: Vector3; c: Vector3; n: Vector3; mid: Vector3; id: number }

/** Strictly inside triangle `t` (in its plane), off its edges. */
const inside = (p: Vector3, t: Tri): boolean => {
  const v0 = t.c.clone().sub(t.a)
  const v1 = t.b.clone().sub(t.a)
  const v2 = p.clone().sub(t.a)
  const d00 = v0.dot(v0); const d01 = v0.dot(v1); const d11 = v1.dot(v1)
  const d20 = v2.dot(v0); const d21 = v2.dot(v1)
  const den = d00 * d11 - d01 * d01
  const u = (d11 * d20 - d01 * d21) / den
  const w = (d00 * d21 - d01 * d20) / den
  return u > 0.01 && w > 0.01 && u + w < 0.99
}

/** Pairs of parts with a face of one lying in a face of the other (within 4 mm). */
const coplanarClashes = (parts: Part[]): string[] => {
  const tris: Tri[] = []
  for (const { g, m, id } of parts) {
    const pts = points(g, m)
    const idx = g.index!
    for (let i = 0; i < idx.count; i += 3) {
      const a = pts[idx.getX(i)]!
      const b = pts[idx.getX(i + 1)]!
      const c = pts[idx.getX(i + 2)]!
      const n = b.clone().sub(a).cross(c.clone().sub(a))
      if (n.lengthSq() < 1e-14) continue
      tris.push({ a, b, c, n: n.normalize(), mid: a.clone().add(b).add(c).divideScalar(3), id })
    }
  }
  const clashes = new Set<string>()
  for (let i = 0; i < tris.length; i++) {
    const s = tris[i]!
    for (let j = i + 1; j < tris.length; j++) {
      const o = tris[j]!
      if (o.id === s.id || Math.abs(s.n.dot(o.n)) < 0.999) continue
      if (Math.abs(s.mid.clone().sub(o.a).dot(o.n)) > 0.004) continue
      if (inside(s.mid, o) || inside(o.mid, s)) clashes.add(`part ${s.id} / part ${o.id}`)
    }
  }
  return [...clashes]
}

/** Bite, then let the twang die out. */
const settle = (vis: ReturnType<typeof makeGrappleVisual>, from = FROM, to = TO): void => {
  vis.update(from, to, 0.3, { flying: true, time: 0, progress: 0.9 })
  vis.update(from, to, 0.3, { flying: false, time: 0.016 })
  vis.update(from, to, 0.3, { flying: false, time: 0.016 + TWANG_S + 0.1 })
  vis.group.updateMatrixWorld(true)
}

describe('the grappling hook head', () => {
  it('ends at `to` and points along from → to, whichever way the line runs', () => {
    const cases: Array<[Vec3, Vec3]> = [
      [FROM, TO],
      [{ x: 0, y: 2, z: 0 }, { x: 0, y: 9, z: 0 }], // straight up
      [{ x: 0, y: 6, z: 0 }, { x: 4, y: 6, z: -2 }], // level
      [{ x: 0, y: 8, z: 0 }, { x: 0.3, y: 2, z: 0.2 }] // down a face
    ]
    for (const [from, to] of cases) {
      const vis = makeGrappleVisual()
      settle(vis, from, to)
      const dir = dirOf(from, to)
      expect(vis.head.position.distanceTo(v(to))).toBeLessThan(1e-9)
      expect(new Vector3(0, 0, 1).applyQuaternion(vis.head.quaternion).dot(dir)).toBeGreaterThan(0.9999)
      // The nose is the head's foremost point, at `to`; the eye is HOOK_LEN behind.
      const { body, tines } = meshes(vis)
      const along = points(body.geometry, body.matrixWorld).map(p => p.sub(v(to)).dot(dir))
      expect(Math.max(...along)).toBeCloseTo(0, 3)
      expect(Math.min(...along)).toBeCloseTo(-HOOK_LEN, 2)
      // No tine reaches past the nose.
      const m = new Matrix4()
      for (let i = 0; i < tines.count; i++) {
        tines.getMatrixAt(i, m)
        m.premultiply(tines.matrixWorld)
        for (const p of points(tines.geometry, m)) expect(p.sub(v(to)).dot(dir)).toBeLessThan(0)
      }
      vis.dispose()
    }
  })

  it('is about 0.4 m long with four tines, flung open in the air and tucked in once it bites', () => {
    expect(HOOK_LEN).toBeGreaterThanOrEqual(0.35)
    expect(HOOK_LEN).toBeLessThanOrEqual(0.45)
    const vis = makeGrappleVisual()
    const { tines } = meshes(vis)
    expect(tines.count).toBe(4)
    // How far the tine tips stand off the head's axis.
    const spread = (): number => {
      const m = new Matrix4()
      tines.getMatrixAt(0, m)
      const pts = points(tines.geometry, m)
      return Math.max(...pts.map(p => Math.hypot(p.x, p.y)))
    }
    vis.update(FROM, TO, 0, { flying: true, time: 0, progress: 0.4 })
    const open = spread()
    vis.update(FROM, TO, 0, { flying: false, time: 0.05 })
    // Halfway through the snap.
    vis.update(FROM, TO, 0, { flying: false, time: 0.095 })
    const snapping = spread()
    vis.update(FROM, TO, 0, { flying: false, time: 0.5 })
    const bite = spread()
    expect(open).toBeGreaterThan(bite + 0.05)
    expect(snapping).toBeLessThan(open)
    expect(snapping).toBeGreaterThan(bite)
    vis.dispose()
  })

  it('spins in the air and holds still once it has bitten', () => {
    const vis = makeGrappleVisual()
    vis.update(FROM, TO, 0, { flying: true, time: 0, progress: 0 })
    vis.update(FROM, TO, 0, { flying: true, time: 0.05, progress: 0.2 })
    const q1 = vis.head.quaternion.clone()
    vis.update(FROM, TO, 0, { flying: true, time: 0.1, progress: 0.4 })
    expect(vis.head.quaternion.angleTo(q1)).toBeGreaterThan(0.1)
    vis.update(FROM, TO, 0, { flying: false, time: 0.15 })
    const q2 = vis.head.quaternion.clone()
    vis.update(FROM, TO, 0, { flying: false, time: 0.3 })
    expect(vis.head.quaternion.angleTo(q2)).toBeLessThan(1e-9)
    vis.dispose()
  })
})

describe('the grappling hook cable', () => {
  it('runs from the hand to the eye, its segments end to end', () => {
    const vis = makeGrappleVisual()
    settle(vis)
    const { cable } = meshes(vis)
    expect(cable.count).toBe(CABLE_SEGS)
    const eye = v(TO).addScaledVector(dirOf(FROM, TO), -HOOK_EYE)
    expect(segment(cable, 0)[0].distanceTo(v(FROM))).toBeLessThan(1e-5)
    expect(segment(cable, CABLE_SEGS - 1)[1].distanceTo(eye)).toBeLessThan(1e-5)
    // Each starts where the last stopped: no overlap, so no doubled surface.
    for (let i = 1; i < CABLE_SEGS; i++) expect(segment(cable, i)[0].distanceTo(segment(cable, i - 1)[1])).toBeLessThan(1e-5)
    vis.dispose()
  })

  it('is taut and straight once the hook has bitten', () => {
    const vis = makeGrappleVisual()
    settle(vis)
    const { cable } = meshes(vis)
    const eye = v(TO).addScaledVector(dirOf(FROM, TO), -HOOK_EYE)
    for (let i = 0; i < CABLE_SEGS; i++) expect(distToLine(segment(cable, i)[1], v(FROM), eye)).toBeLessThan(1e-5)
    vis.dispose()
  })

  it('sags in the air, less the nearer the hook is to the wall, and twangs on the bite', () => {
    const vis = makeGrappleVisual()
    const { cable } = meshes(vis)
    const eye = v(TO).addScaledVector(dirOf(FROM, TO), -HOOK_EYE)
    const bend = (): number => {
      let worst = 0
      for (let i = 0; i < CABLE_SEGS; i++) worst = Math.max(worst, distToLine(segment(cable, i)[1], v(FROM), eye))
      return worst
    }
    vis.update(FROM, TO, 0, { flying: true, time: 0, progress: 0.2 })
    const early = bend()
    vis.update(FROM, TO, 0, { flying: true, time: 0.1, progress: 0.8 })
    const late = bend()
    vis.update(FROM, TO, 0, { flying: true, time: 0.2, progress: 1 })
    const landed = bend()
    expect(early).toBeGreaterThan(0.1)
    expect(late).toBeLessThan(early)
    expect(landed).toBeLessThan(1e-5)
    vis.update(FROM, TO, 0, { flying: false, time: 0.21 })
    vis.update(FROM, TO, 0, { flying: false, time: 0.23 })
    expect(bend()).toBeGreaterThan(0.005)
    vis.dispose()
  })

  it('draws no cable when the hook is still at the hand', () => {
    const vis = makeGrappleVisual()
    vis.update(FROM, { x: FROM.x, y: FROM.y + 0.2, z: FROM.z }, 0, { flying: true, time: 0, progress: 0 })
    expect(meshes(vis).cable.count).toBe(0)
    vis.update(FROM, TO, 0, { flying: true, time: 0.02, progress: 0.1 })
    expect(meshes(vis).cable.count).toBe(CABLE_SEGS)
    vis.dispose()
  })
})

describe('the grappling hook visual', () => {
  it('reuses its objects frame after frame', () => {
    const vis = makeGrappleVisual()
    const { cable, tines } = meshes(vis)
    const arrays = [cable.instanceMatrix.array, tines.instanceMatrix.array]
    const kids = vis.group.children.length + vis.head.children.length
    for (let f = 0; f < 120; f++) {
      vis.update(FROM, TO, f * 0.01, { flying: f < 30, time: f / 60, progress: Math.min(1, f / 30) })
    }
    expect(vis.group.children.length + vis.head.children.length).toBe(kids)
    expect(cable.instanceMatrix.array).toBe(arrays[0])
    expect(tines.instanceMatrix.array).toBe(arrays[1])
    // Every matrix is finite.
    for (const a of arrays) for (const x of a) expect(Number.isFinite(x)).toBe(true)
    vis.dispose()
  })

  it('shows and hides as a whole, hidden until asked', () => {
    const vis = makeGrappleVisual()
    expect(vis.group.visible).toBe(false)
    vis.setVisible(true)
    expect(vis.group.visible).toBe(true)
    vis.setVisible(false)
    expect(vis.group.visible).toBe(false)
    vis.dispose()
  })

  it('has no two parts with faces in one plane (no z-fighting)', () => {
    const parts: Part[] = hookHeadGeometry().parts.map((g, i) => ({ g, m: new Matrix4(), id: i }))
    // The tines, in both their poses, through the visual's own matrices.
    const vis = makeGrappleVisual()
    const tines = meshes(vis).tines
    const tine = tineGeometry()
    for (const flying of [true, false]) {
      vis.update(FROM, TO, 0, { flying, time: flying ? 0 : 1 })
      for (let i = 0; i < tines.count; i++) {
        const m = new Matrix4()
        tines.getMatrixAt(i, m)
        // A tine's open and biting poses share an id: they are never drawn together.
        parts.push({ g: tine, m, id: 100 + i })
      }
    }
    expect(coplanarClashes(parts)).toEqual([])
    vis.dispose()
  })

  it('(the z-fighting check does catch two caps in one plane)', () => {
    const a = rcyl(0.05, 0.1, 0.01, 10, 1)
    const b = rcyl(0.04, 0.1, 0.01, 10, 1)
    expect(coplanarClashes([{ g: a, m: new Matrix4(), id: 0 }, { g: b, m: new Matrix4().makeTranslation(0, 0.1, 0), id: 1 }])).not.toEqual([])
    expect(coplanarClashes([{ g: a, m: new Matrix4(), id: 0 }, { g: b, m: new Matrix4().makeTranslation(0, 0.12, 0), id: 1 }])).toEqual([])
  })
})
