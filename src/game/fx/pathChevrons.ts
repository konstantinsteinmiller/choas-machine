import { Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry } from 'three'
import { VOID, findPath, heightAt, smoothPath, toCell, type Grid, type MoveRule } from '../world/grid'

/**
 * ─── The way out, on the ground (jam build) ──────────────────────────────────
 *
 * Once nobody is left to stop the mech, gold chevrons on the floor lead from
 * it along a walkable path to where it has to go, a pulse running down them
 * toward the goal. Flat decals a hand's width over the floor, depth-write off
 * (never two coplanar faces fighting).
 */

/** Chevrons this far apart along the path (m), at most this many. */
const SPACING = 1.7
const MAX = 64
/** The first one this far ahead of the mech (m). */
const FIRST = 1.4
const GOLD = new Color('#ffb21f')
const GOLD_HI = new Color('#fff1a8')

/** How the mech gets about, for the path: a step or a pull-up, any drop; else with the hook. */
const LEGS: MoveRule = { up: 1.9, down: 100 }
const HOOKED: MoveRule = { up: 9.5, down: 100 }

export class PathChevrons {
  readonly mesh: InstancedMesh
  private dummy = new Object3D()
  private count = 0

  constructor() {
    const s = new Shape()
    // One chevron pointing along +z: an arrowhead with a notch.
    s.moveTo(-0.55, -0.25)
    s.lineTo(0, 0.3)
    s.lineTo(0.55, -0.25)
    s.lineTo(0.55, 0.05)
    s.lineTo(0, 0.6)
    s.lineTo(-0.55, 0.05)
    s.closePath()
    const geo = new ShapeGeometry(s)
    geo.rotateX(-Math.PI / 2)
    // rotateX(-π/2) maps shape +y to world −z: flip so it points along +z.
    geo.rotateY(Math.PI)
    // Opaque gold (an additive glow washed out to white on the pale decks), lifted off the floor by polygonOffset.
    const mat = new MeshBasicMaterial({ color: '#ffffff', depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    this.mesh = new InstancedMesh(geo, mat, MAX)
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.name = 'path-chevrons'
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, GOLD)
  }

  /** Lay the chevrons from (x, z) to (tx, tz) along a walkable path; none if there is no path. */
  route(g: Grid, x: number, z: number, tx: number, tz: number): void {
    let cells = findPath(g, toCell(x), toCell(z), toCell(tx), toCell(tz), LEGS, 6000)
    if (cells.length === 0) cells = findPath(g, toCell(x), toCell(z), toCell(tx), toCell(tz), HOOKED, 6000)
    if (cells.length === 0) { this.count = 0; this.mesh.count = 0; return }
    const pts = [{ x, z }, ...smoothPath(g, cells, HOOKED).slice(1), { x: tx, z: tz }]
    let n = 0
    let carry = FIRST
    for (let i = 1; i < pts.length && n < MAX; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len < 1e-3) continue
      const yaw = Math.atan2(b.x - a.x, b.z - a.z)
      let d = carry
      while (d <= len && n < MAX) {
        const px = a.x + ((b.x - a.x) * d) / len
        const pz = a.z + ((b.z - a.z) * d) / len
        const floor = heightAt(g, px, pz)
        if (floor !== VOID) {
          this.dummy.position.set(px, floor + 0.06, pz)
          this.dummy.rotation.set(0, yaw, 0)
          this.dummy.scale.setScalar(1)
          this.dummy.updateMatrix()
          this.mesh.setMatrixAt(n++, this.dummy.matrix)
        }
        d += SPACING
      }
      carry = d - len
    }
    this.count = n
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }

  hide(): void {
    this.count = 0
    this.mesh.count = 0
  }

  /** The pulse: a bright band running from the mech toward the goal, the rest glowing low. */
  update(time: number): void {
    if (this.count === 0) return
    const c = new Color()
    for (let i = 0; i < this.count; i++) {
      const wave = 0.5 + 0.5 * Math.sin(time * 5 - i * 0.7)
      c.copy(GOLD).multiplyScalar(0.55 + 0.25 * wave).lerp(GOLD_HI, wave * wave * wave)
      this.mesh.setColorAt(i, c)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
  }
}
