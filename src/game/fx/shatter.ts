import { Bone, Box3, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, type Material, type MeshToonMaterial } from 'three'
import { merge, type Rig } from '../models/kit'
import { VOID, heightAt, type Grid } from '../world/grid'

/**
 * ─── A machine coming apart into its own parts (#139) ────────────────────────
 *
 * A destroyed drone, searchlight, roomba, hound, Enforcer or Goliath does not
 * vanish into generic debris: it breaks into the very parts it was built from
 * (`RigBuilder` keeps them), each a rigid piece that tumbles, bounces and comes
 * to rest — plates, arms, wheels, rotors, the turret, the barrel — so the wreck
 * could, in principle, be put back together. Small bits (an LED, a bolt, a
 * rivet strip) stay on the plate they sit on (`planPieces`).
 *
 * A wreck is ONE skinned mesh (plus its outline) whose skeleton has a bone per
 * piece: a Goliath in forty pieces is still three draw calls, toon-shaded and
 * outlined like it was alive. Each piece's bone starts exactly where its part
 * was posed at the moment of death, so the break is seamless.
 *
 * Pieces come to rest a couple of centimetres over the floor (never coplanar
 * with it: no z-fighting at any distance), fall off the island if they go
 * over the edge, and sleep once still. The flamethrower melts the lot (`melt`).
 */

/** Which parts fly together: a bone's big parts each on their own, its small ones on the nearest big one. */
export interface PieceGroup { bone: number; parts: number[] }

/**
 * A part counts as big (a piece of its own) from this size (its box's
 * diagonal, m), or this share of its bone's biggest part, whichever is less
 * than `BIG_CAP`: a wheel on a tank's hull is a piece, though the hull is huge.
 */
const BIG_ABS = 0.1
const BIG_SHARE = 0.3
const BIG_CAP = 0.5

/**
 * Group parts into pieces (pure). `boxes` are the parts' boxes in their bone's
 * own space. No more than `maxPieces`: past that, smaller parts join bigger
 * ones until it fits (a bone never splits below one piece).
 */
export const planPieces = (parts: ReadonlyArray<{ bone: number; box: Box3 }>, maxPieces = 28): PieceGroup[] => {
  const size = parts.map(p => p.box.getSize(_v).length())
  const centre = parts.map(p => p.box.getCenter(new Vector3()))
  const byBone = new Map<number, number[]>()
  parts.forEach((p, i) => { const l = byBone.get(p.bone) ?? []; l.push(i); byBone.set(p.bone, l) })
  for (let share = BIG_SHARE; ; share += 0.1) {
    const out: PieceGroup[] = []
    for (const [bone, list] of byBone) {
      const max = Math.max(...list.map(i => size[i]!))
      // The cap grows with the share when there are too many pieces.
      const big = list.filter(i => size[i]! >= Math.max(BIG_ABS, Math.min(share * max, BIG_CAP * share / BIG_SHARE)))
      if (big.length === 0) { out.push({ bone, parts: list.slice() }); continue }
      const groups = big.map(i => ({ bone, parts: [i] }))
      for (const i of list) {
        if (big.includes(i)) continue
        let best = 0
        let bestD = Infinity
        big.forEach((b, k) => { const d = centre[i]!.distanceTo(centre[b]!); if (d < bestD) { bestD = d; best = k } })
        groups[best]!.parts.push(i)
      }
      out.push(...groups)
    }
    if (out.length <= maxPieces || share >= 1) return out
  }
}

const GRAVITY = 20
const BOUNCE = 0.3
const FRICTION = 0.55
/** How far over the floor a resting piece's lowest point stays (m): centimetres, never coplanar. */
export const REST_CLEAR = 0.02
/** A step this much higher than a piece is a wall it bounces off. */
const WALL = 0.5
const SLEEP_V = 0.35
const SLEEP_W = 0.8
const SLEEP_S = 0.35
const MAX_AWAKE_S = 8
/** How long the flamethrower's melt takes to take a wreck (s). */
export const MELT_S = 0.9
/** Torn apart, the parts glow this hot (emissive) and cool off over `HOT_S`. */
const HOT = [0.3, 0.1, 0.02] as const
const HOT_S = 0.35

interface Piece {
  bone: Bone
  v: Vector3
  w: Vector3
  /** The piece's box corners in its own frame. */
  corners: Vector3[]
  scale: number
  still: number
  asleep: boolean
}

interface Wreck {
  mesh: SkinnedMesh
  outline: SkinnedMesh | null
  geos: BufferGeometry[]
  pieces: Piece[]
  material: MeshToonMaterial
  t: number
  /** Seconds into the melt, or −1. */
  melt: number
}

const _v = new Vector3()
const _a = new Vector3()
const _m = new Matrix4()
const _mi = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()

/** A deterministic 0 … 1 stream from a seed. */
const rng = (seed: number): (() => number) => {
  let a = (Math.floor(seed * 2654435761) >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Shatter {
  readonly group = new Group()
  private wrecks = new Map<number, Wreck>()

  constructor(private grid: Grid) {
    this.group.name = 'shatter'
  }

  /**
   * Break a rig into its parts where it stands posed. `dirX/dirZ` is the way
   * the killing blow pushed (unit, or 0), `force` how hard it comes apart (m/s).
   * Returns false for a rig that does not keep its parts.
   */
  break(id: number, rig: Rig, opts: { dirX?: number; dirZ?: number; force?: number; seed?: number } = {}): boolean {
    const parts = rig.parts
    if (!parts || parts.length === 0) return false
    this.clear(id)
    rig.root.updateMatrixWorld(true)
    this.group.updateMatrixWorld(true)
    const inv = rig.mesh.skeleton.boneInverses
    const srcBones = rig.mesh.skeleton.bones
    // Each part's box in its bone's own space.
    const boxes = parts.map(p => {
      const b = new Box3()
      const pos = p.geo.attributes.position!
      for (let i = 0; i < pos.count; i++) b.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(inv[p.bone]!))
      return { bone: p.bone, box: b }
    })
    const plan = planPieces(boxes)
    const toWreck = _mi.copy(this.group.matrixWorld).invert()
    const bones: Bone[] = []
    const binds: Matrix4[] = []
    const pieces: Piece[] = []
    const toon: BufferGeometry[] = []
    const glow: BufferGeometry[] = []
    const lines: BufferGeometry[] = []
    const r = rng((opts.seed ?? 0.5) + id * 0.137)
    plan.forEach((g, k) => {
      const box = new Box3()
      for (const i of g.parts) box.union(boxes[i]!.box)
      const c = box.getCenter(new Vector3())
      // Bind: bind space → the bone's space → the piece's own (centred on its box).
      binds.push(new Matrix4().makeTranslation(-c.x, -c.y, -c.z).multiply(inv[g.bone]!))
      // Start: where the part is posed now, centred on its box.
      const b = new Bone()
      b.name = `piece${k}`
      _m.copy(toWreck).multiply(srcBones[g.bone]!.matrixWorld).multiply(new Matrix4().makeTranslation(c.x, c.y, c.z))
      _m.decompose(b.position, b.quaternion, _s)
      b.scale.copy(_s)
      bones.push(b)
      const corners: Vector3[] = []
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x - c.x, y - c.y, z - c.z))
      pieces.push({ bone: b, v: new Vector3(), w: new Vector3(), corners, scale: _s.x, still: 0, asleep: false })
      for (const i of g.parts) {
        const p = parts[i]!
        const geo = p.geo.clone()
        const n = geo.attributes.position!.count
        const idx = new Uint16Array(n * 4)
        const wt = new Float32Array(n * 4)
        for (let j = 0; j < n; j++) { idx[j * 4] = k; wt[j * 4] = 1 }
        geo.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4))
        geo.setAttribute('skinWeight', new Float32BufferAttribute(wt, 4))
        ;(p.glow ? glow : toon).push(geo)
        if (p.outline) lines.push(geo)
      }
    })
    // Thrown apart: out from the middle, up, and on along the blow.
    const mid = new Vector3()
    for (const p of pieces) mid.add(p.bone.position)
    mid.divideScalar(pieces.length)
    const force = opts.force ?? 4
    for (const p of pieces) {
      const out = _a.copy(p.bone.position).sub(mid)
      out.y = 0
      if (out.lengthSq() < 1e-4) out.set(r() - 0.5, 0, r() - 0.5)
      out.normalize()
      p.v.copy(out).multiplyScalar(force * (0.35 + 0.65 * r()))
      p.v.y = force * (0.35 + 0.55 * r())
      p.v.x += (opts.dirX ?? 0) * force * 0.35
      p.v.z += (opts.dirZ ?? 0) * force * 0.35
      p.w.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(3 + 6 * r())
    }

    // Its own copy of the machine's material: the hit's flash on the rig
    // stays on the rig; the parts start hot and cool to bare steel (`HOT_S`).
    const material = rig.material.clone()
    material.emissive.setRGB(HOT[0], HOT[1], HOT[2])
    let geometry: BufferGeometry
    let mats: Material | Material[]
    if (toon.length && glow.length) { geometry = merge([merge(toon), merge(glow)], true); mats = [material, rig.glowMaterial] }
    else if (glow.length) { geometry = merge(glow); mats = rig.glowMaterial }
    else { geometry = merge(toon); mats = material }
    const skeleton = new Skeleton(bones, binds)
    const mesh = new SkinnedMesh(geometry, mats)
    for (const b of bones) mesh.add(b)
    mesh.bind(skeleton, new Matrix4())
    mesh.frustumCulled = false
    const geos = [geometry]
    let outline: SkinnedMesh | null = null
    if (rig.outline && lines.length) {
      const og = lines.length === toon.length + glow.length && glow.length === 0 ? geometry : merge(lines)
      if (og !== geometry) geos.push(og)
      outline = new SkinnedMesh(og, rig.outline.material)
      outline.bind(skeleton, new Matrix4())
      outline.frustumCulled = false
      outline.renderOrder = -1
      this.group.add(outline)
    }
    for (const g of [...toon, ...glow]) g.dispose()
    this.group.add(mesh)
    this.wrecks.set(id, { mesh, outline, geos, pieces, material, t: 0, melt: -1 })
    return true
  }

  /** Step every wreck by `dt` (simulation seconds). */
  update(dt: number): void {
    if (dt <= 0) return
    for (const [id, w] of this.wrecks) {
      w.t += dt
      if (w.melt < 0 && w.t <= HOT_S + dt) {
        const k = Math.max(0, 1 - w.t / HOT_S)
        w.material.emissive.setRGB(HOT[0] * k, HOT[1] * k, HOT[2] * k)
      }
      if (w.melt >= 0) {
        w.melt += dt
        const k = Math.min(1, w.melt / MELT_S)
        // White-hot, sagging, gone: what is left is the slag the mission lays down.
        w.material.emissive.setRGB(1.2 * (1 - k * 0.5), 0.45 * (1 - k), 0.08 * (1 - k))
        for (const p of w.pieces) {
          const s = p.scale * Math.max(0.001, 1 - k)
          p.bone.scale.setScalar(s)
          p.bone.position.y -= dt * 0.35
        }
        if (k >= 1) this.clear(id)
        continue
      }
      for (const p of w.pieces) if (!p.asleep) this.step(p, dt, w.t)
    }
  }

  private step(p: Piece, dt: number, age: number): void {
    const b = p.bone
    const px = b.position.x
    const pz = b.position.z
    p.v.y -= GRAVITY * dt
    b.position.addScaledVector(p.v, dt)
    const rate = p.w.length()
    if (rate > 1e-4) {
      _q.setFromAxisAngle(_a.copy(p.w).divideScalar(rate), rate * dt)
      b.quaternion.premultiply(_q)
    }
    // Off the island: let it fall away, then stop thinking about it.
    if (b.position.y < -40) { p.asleep = true; b.scale.setScalar(0.0001); return }
    const floor = heightAt(this.grid, b.position.x, b.position.z)
    if (floor === VOID) return
    let low = Infinity
    for (const c of p.corners) low = Math.min(low, _v.copy(c).multiplyScalar(p.scale).applyQuaternion(b.quaternion).y)
    low += b.position.y
    // A wall: back out of it, bounced.
    if (floor > low + WALL) {
      b.position.x = px
      b.position.z = pz
      p.v.x *= -0.35
      p.v.z *= -0.35
      return
    }
    if (low < floor + REST_CLEAR) {
      b.position.y += floor + REST_CLEAR - low
      if (p.v.y < 0) p.v.y = -p.v.y * BOUNCE
      p.v.x *= FRICTION
      p.v.z *= FRICTION
      p.w.multiplyScalar(0.6)
      if (p.v.length() < SLEEP_V && p.w.length() < SLEEP_W) p.still += dt
      else p.still = 0
      if (p.still > SLEEP_S) { p.asleep = true; p.v.set(0, 0, 0); p.w.set(0, 0, 0) }
    }
    if (age > MAX_AWAKE_S) { p.asleep = true; p.v.set(0, 0, 0); p.w.set(0, 0, 0) }
  }

  /** The flamethrower takes this wreck: it glows, sags and is gone in `MELT_S`. */
  melt(id: number): void {
    const w = this.wrecks.get(id)
    if (w && w.melt < 0) w.melt = 0
  }

  /** Gone at once (a restored training dummy, the end of a mission). */
  clear(id: number): void {
    const w = this.wrecks.get(id)
    if (!w) return
    this.group.remove(w.mesh)
    if (w.outline) this.group.remove(w.outline)
    for (const g of w.geos) g.dispose()
    w.mesh.skeleton.dispose()
    w.material.dispose()
    this.wrecks.delete(id)
  }

  has(id: number): boolean { return this.wrecks.has(id) }

  /** A wreck's pieces as they lie (tests): position, and whether each has come to rest. */
  pieces(id: number): Array<{ x: number; y: number; z: number; asleep: boolean; low: number }> {
    const w = this.wrecks.get(id)
    if (!w) return []
    return w.pieces.map(p => {
      let low = Infinity
      for (const c of p.corners) low = Math.min(low, _v.copy(c).multiplyScalar(p.scale).applyQuaternion(p.bone.quaternion).y)
      return { x: p.bone.position.x, y: p.bone.position.y, z: p.bone.position.z, asleep: p.asleep, low: low + p.bone.position.y }
    })
  }

  dispose(): void {
    for (const id of [...this.wrecks.keys()]) this.clear(id)
  }
}
