import { Color, DynamicDrawUsage, InstancedMesh, MeshToonMaterial, Object3D, Quaternion, Vector3, type BufferGeometry } from 'three'
import { rbox } from '../models/kit'
import { toonRamp } from '../models/toon'
import { VOID, heightAt, type Grid } from '../world/grid'
import { sceneQuality } from '../engine/quality'

/**
 * ─── Wreckage ────────────────────────────────────────────────────────────────
 *
 * What is left of a machine: torn metal (#64) that flies apart, bounces, rolls
 * to a stop and STAYS for the rest of the mission: bent plates, rods and
 * chunks of a hard-edged block, each piece its own proportions. They are the evidence a patrol
 * finds (the simulation treats the spot as a body), so they are never cleaned
 * up while the mission runs.
 *
 * One instanced mesh for every piece in the fortress: one draw call however
 * many machines have been taken apart. A piece that has come to rest costs
 * nothing: only the ones still moving are stepped, and the instance buffer
 * is uploaded only on frames where something moved.
 */

/** Pieces the buffer holds. Past it, the oldest resting pieces are reused. */
export const WRECK_CAPACITY = 260
const GRAVITY = 24
const BOUNCE = 0.34
const FRICTION = 0.62
const REST_SPEED = 0.35

export interface WreckSpec {
  /** Where the machine was: the pieces start spread through this box. */
  x: number
  y: number
  z: number
  /** Half extents of the body the pieces come from. */
  hx: number
  hy: number
  hz: number
  /** How many pieces, and their edge length range. */
  count: number
  size: [number, number]
  /** The body's colours; a piece takes one. */
  colors: readonly string[]
  /** How hard it comes apart, m/s. */
  force: number
  /** The push of whatever killed it (a unit vector, or 0, 0). */
  dirX: number
  dirZ: number
}

interface Piece {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  q: Quaternion
  /** Spin axis and rate. */
  ax: number; ay: number; az: number; spin: number
  s: number
  /** Its proportions: a plate, a rod or a chunk (#64). */
  sx: number; sy: number; sz: number
  awake: boolean
}

const _o = new Object3D()
const _axis = new Vector3()
const _dq = new Quaternion()
const _c = new Color()

/** Deterministic enough for a test, cheap enough for a burst. */
let seed = 1
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
/** Start the sequence over (tests). */
export const seedWreckage = (s: number): void => { seed = s >>> 0 }

export class Wreckage {
  readonly mesh: InstancedMesh
  private geo: BufferGeometry
  private pieces: Piece[] = []
  private next = 0
  private moving = 0

  constructor(private grid: Grid) {
    // A hard-edged block, barely rounded: scaled per piece into a torn plate,
    // a snapped rod or a chunk of housing, it reads as metal (#64).
    this.geo = rbox(1, 1, 1, 0.1, 4, 4)
    const mat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp() })
    const cap = sceneQuality() === 'low' ? Math.round(WRECK_CAPACITY * 0.6) : WRECK_CAPACITY
    this.mesh = new InstancedMesh(this.geo, mat, cap)
    this.mesh.name = 'wreckage'
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  }

  /** Pieces lying or flying right now. */
  get count(): number { return this.pieces.length }
  /** Pieces still in motion. */
  get awake(): number { return this.moving }
  get capacity(): number { return this.mesh.instanceMatrix.count }

  /** Take a machine apart. Returns how many pieces it made. */
  burst(w: WreckSpec): number {
    const cap = this.capacity
    let made = 0
    for (let k = 0; k < w.count; k++) {
      // Out from the middle, up, and along the blow.
      const a = rnd() * Math.PI * 2
      const up = 0.35 + rnd() * 0.65
      const out = (0.4 + rnd() * 0.6) * w.force
      const p: Piece = {
        x: w.x + (rnd() * 2 - 1) * w.hx,
        y: w.y + rnd() * w.hy * 2,
        z: w.z + (rnd() * 2 - 1) * w.hz,
        vx: Math.cos(a) * out * (1 - up * 0.5) + w.dirX * w.force * 0.6,
        vy: up * w.force * 0.9 + 1.5,
        vz: Math.sin(a) * out * (1 - up * 0.5) + w.dirZ * w.force * 0.6,
        q: new Quaternion().setFromAxisAngle(_axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), rnd() * Math.PI),
        ax: rnd() - 0.5, ay: rnd() - 0.5, az: rnd() - 0.5,
        spin: 4 + rnd() * 10,
        s: w.size[0] + rnd() * (w.size[1] - w.size[0]),
        sx: 1, sy: 1, sz: 1,
        awake: true
      }
      // Plates, rods and chunks.
      const shape = rnd()
      if (shape < 0.45) { p.sx = 1.2 + rnd() * 0.5; p.sy = 0.14 + rnd() * 0.1; p.sz = 0.8 + rnd() * 0.5 }
      else if (shape < 0.7) { p.sx = 0.22; p.sy = 0.22; p.sz = 1.3 + rnd() * 0.7 }
      else { p.sx = 0.8 + rnd() * 0.3; p.sy = 0.6 + rnd() * 0.4; p.sz = 0.8 + rnd() * 0.3 }
      const l = Math.hypot(p.ax, p.ay, p.az) || 1
      p.ax /= l; p.ay /= l; p.az /= l
      let i: number
      if (this.pieces.length < cap) {
        i = this.pieces.length
        this.pieces.push(p)
      } else {
        // Full: the oldest piece gives up its place.
        i = this.next
        this.next = (this.next + 1) % cap
        if (this.pieces[i]!.awake) this.moving--
        this.pieces[i] = p
      }
      this.moving++
      this.mesh.setColorAt(i, _c.set(w.colors[Math.floor(rnd() * w.colors.length)]!))
      this.write(i, p)
      made++
    }
    this.mesh.count = this.pieces.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    return made
  }

  private write(i: number, p: Piece): void {
    _o.position.set(p.x, p.y, p.z)
    _o.quaternion.copy(p.q)
    _o.scale.set(p.s * p.sx, p.s * p.sy, p.s * p.sz)
    _o.updateMatrix()
    this.mesh.setMatrixAt(i, _o.matrix)
  }

  /** Step the pieces that are still moving. */
  update(dt: number): void {
    if (this.moving === 0) return
    const g = this.grid
    const step = Math.min(dt, 1 / 30)
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i]!
      if (!p.awake) continue
      p.vy -= GRAVITY * step
      let nx = p.x + p.vx * step
      let nz = p.z + p.vz * step
      // Resting on its thinnest side, near enough.
      const half = p.s * 0.5 * Math.min(p.sx, p.sy, p.sz, 1)
      // A wall: anything standing higher than the piece is.
      const ahead = heightAt(g, nx, nz)
      if (ahead !== VOID && ahead > p.y - half + 0.25) {
        const hx = heightAt(g, nx, p.z)
        const hz = heightAt(g, p.x, nz)
        if (hx !== VOID && hx > p.y - half + 0.25) { p.vx = -p.vx * BOUNCE; nx = p.x }
        if (hz !== VOID && hz > p.y - half + 0.25) { p.vz = -p.vz * BOUNCE; nz = p.z }
      }
      p.x = nx
      p.z = nz
      p.y += p.vy * step
      const floor = heightAt(g, p.x, p.z)
      if (floor === VOID) {
        // Over the island's edge: it falls out of the world and is done.
        if (p.y < -40) { p.awake = false; this.moving-- }
      } else if (p.y - half <= floor) {
        p.y = floor + half
        if (p.vy < 0) p.vy = -p.vy * BOUNCE
        p.vx *= FRICTION
        p.vz *= FRICTION
        p.spin *= 0.6
        if (Math.abs(p.vy) < 1.2 && Math.hypot(p.vx, p.vz) < REST_SPEED) {
          p.vx = p.vy = p.vz = 0
          p.awake = false
          this.moving--
        }
      }
      if (p.awake) {
        _dq.setFromAxisAngle(_axis.set(p.ax, p.ay, p.az), p.spin * step)
        p.q.premultiply(_dq)
      }
      this.write(i, p)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Where a piece lies (tests, and the debug view). */
  at(i: number): { x: number; y: number; z: number; awake: boolean } | null {
    const p = this.pieces[i]
    return p ? { x: p.x, y: p.y, z: p.z, awake: p.awake } : null
  }

  dispose(): void {
    this.geo.dispose()
    ;(this.mesh.material as MeshToonMaterial).dispose()
    this.mesh.dispose()
  }
}
