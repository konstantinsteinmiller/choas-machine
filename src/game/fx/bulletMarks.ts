import { CircleGeometry, Mesh, MeshBasicMaterial, Quaternion, Raycaster, RingGeometry, Vector3, type Intersection } from 'three'
import type { Rig } from '../models/kit'

/**
 * ─── Where a round went in and came out (#152) ───────────────────────────────
 *
 * A small mark at each: on a person a dark hole with a pale rim (no blood),
 * on a machine a dent that glows hot for a moment and cools to dark steel.
 * Each sits on the body's own surface (the round's line cast against the
 * posed, skinned mesh: the hit capsules are rounder than the body, a mark
 * there would hang in the air) and is a child of the bone that moves the
 * face it is on, so it moves with the body:
 * walking, falling, flying apart as a ragdoll. A fixed pool, the oldest
 * reused first; a burned or hidden body hides its marks with it.
 */

const POOL = 48
const HOLE = 0.035
const HOT_S = 0.6

interface Mark { mesh: Mesh; t: number; metal: boolean }

const _v = new Vector3()
const _n = new Vector3()
const _q = new Quaternion()
const _z = new Vector3(0, 0, 1)
const _o = new Vector3()
const _d = new Vector3()
const _ray = new Raycaster()
const _hits: Intersection[] = []
/** How far back along its line a round's surface is looked for (m), and how far on. */
const BACK = 0.4
const ON = 1.2

export class BulletMarks {
  private fleshMat = new MeshBasicMaterial({ color: '#2a1d33', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  private rimMat = new MeshBasicMaterial({ color: '#9d8fb8', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  private holeGeo = new CircleGeometry(HOLE, 10)
  private rimGeo = new RingGeometry(HOLE * 0.95, HOLE * 1.5, 12)
  private dentGeo = new CircleGeometry(HOLE * 1.3, 10)
  private marks: Mark[] = []
  private next = 0

  /**
   * Mark `rig` where a round going along (dx, dy, dz) meets its surface near
   * (x, y, z), world: an entry going in, or an exit looked for from behind
   * (the far point, the reversed line). `metal` for a machine. No surface on
   * that line (the round only grazed the capsule): no mark.
   */
  mark(rig: Rig, x: number, y: number, z: number, dx: number, dy: number, dz: number, metal: boolean): void {
    const body = rig.mesh
    rig.root.updateMatrixWorld(true)
    body.computeBoundingSphere()
    _d.set(dx, dy, dz).normalize()
    _ray.set(_o.set(x, y, z).addScaledVector(_d, -BACK), _d)
    _ray.far = BACK + ON
    _hits.length = 0
    _ray.intersectObject(body, false, _hits)
    const hit = _hits[0]
    if (!hit?.face) return
    const bone = body.skeleton.bones[body.geometry.attributes.skinIndex!.getX(hit.face.a)]
    if (!bone) return
    // The face's normal, posed and in the world, out towards the round.
    body.getVertexPosition(hit.face.a, _v)
    const a = _v.clone()
    body.getVertexPosition(hit.face.b, _v)
    const b = _v.clone().sub(a)
    body.getVertexPosition(hit.face.c, _v)
    _n.copy(_v.sub(a)).cross(b).negate().transformDirection(body.matrixWorld)
    if (_n.dot(_d) > 0) _n.negate()
    const m = this.take(metal)
    // Into the bone's frame: where, and facing out along the normal.
    bone.add(m.mesh)
    m.mesh.position.copy(bone.worldToLocal(_v.copy(hit.point)))
    bone.getWorldQuaternion(_q).invert()
    _n.applyQuaternion(_q)
    m.mesh.quaternion.setFromUnitVectors(_z, _n)
    // A hair off the surface, never in it.
    m.mesh.position.addScaledVector(_n, 0.008)
    m.mesh.visible = true
  }

  /** A body stood up whole again (the training ground): its marks go. */
  clear(rig: Rig): void {
    for (const m of this.marks) {
      let o = m.mesh.parent
      while (o && o !== rig.root) o = o.parent
      if (o) m.mesh.removeFromParent()
    }
  }

  /** The hot dents cool (seconds). */
  update(dt: number): void {
    for (const m of this.marks) {
      if (!m.metal || m.t >= HOT_S) continue
      m.t += dt
      const k = Math.min(1, m.t / HOT_S)
      ;(m.mesh.material as MeshBasicMaterial).color.setRGB(1 - 0.84 * k, 0.55 - 0.42 * k, 0.15 - 0.03 * k)
    }
  }

  private take(metal: boolean): Mark {
    let m = this.marks[this.next]
    if (m && m.metal !== metal) {
      m.mesh.removeFromParent()
      this.disposeMark(m)
      m = undefined
    }
    if (!m) {
      const mesh = metal
        ? new Mesh(this.dentGeo, new MeshBasicMaterial({ color: '#ff8c26', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))
        : new Mesh(this.holeGeo, this.fleshMat)
      if (!metal) mesh.add(new Mesh(this.rimGeo, this.rimMat))
      mesh.renderOrder = 3
      m = { mesh, t: 0, metal }
      this.marks[this.next] = m
    }
    m.mesh.removeFromParent()
    m.t = 0
    if (metal) (m.mesh.material as MeshBasicMaterial).color.set('#ff8c26')
    this.next = (this.next + 1) % POOL
    return m
  }

  private disposeMark(m: Mark): void {
    if (m.metal) (m.mesh.material as MeshBasicMaterial).dispose()
  }

  dispose(): void {
    for (const m of this.marks) { m.mesh.removeFromParent(); this.disposeMark(m) }
    this.marks = []
    this.fleshMat.dispose()
    this.rimMat.dispose()
    this.holeGeo.dispose()
    this.rimGeo.dispose()
    this.dentGeo.dispose()
  }
}
