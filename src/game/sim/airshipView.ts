import { AdditiveBlending, CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Scene } from 'three'
import { AIRSHIP_SOCKETS, ENGINE_AT, TURRET_AT, buildAirship } from '../models/airship'
import type { Rig } from '../models/kit'
import { Shatter } from '../fx/shatter'
import { VOID, heightAt, type Grid } from '../world/grid'
import { LAMP_R, flying, type Airship, type ShipRocket, type TurretId } from './airship'

/**
 * ─── The Airship on screen (#142) ────────────────────────────────────────────
 *
 * Its rig placed and posed from `airship.ts`: the fans turning (a lost engine's
 * stops), each turret swung onto the mech and its barrels kicking back with
 * each round, and, as it falls, the whole ship coming apart into its own parts
 * in the air (`fx/shatter.ts`). It reads its SOCKETS for the mission: the
 * world point at each barrel's and each tube's mouth, this frame (#142). Its
 * rockets in flight are drawn here too.
 */

const _v = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _up = new Vector3(0, 1, 0)
const _dir = new Vector3()
const WRECK = 0
/** Seconds into its fall that it breaks apart. */
const BREAK_AT_S = 1.8

export class AirshipView {
  readonly rig: Rig
  readonly group = new Group()
  private shatter: Shatter
  private broken = false
  private recoil: Record<TurretId, number> = { F: 0, B: 0 }
  private rocketGeo = new CylinderGeometry(0.16, 0.16, 1.1, 8)
  private noseGeo = new ConeGeometry(0.16, 0.35, 8)
  private rocketMat = new MeshBasicMaterial({ color: '#ff7a3d', toneMapped: false })
  private pool: Group[] = []
  /** Its searchlight: the pool on the ground and the beam down to it. */
  private spotMat = new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  private beamMat = new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.1, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
  private spot: Mesh
  private beam: Mesh

  constructor(scene: Scene, private grid: Grid) {
    this.rig = buildAirship()
    this.group.name = 'airship'
    this.group.add(this.rig.root)
    this.shatter = new Shatter(grid)
    this.group.add(this.shatter.group)
    this.spot = new Mesh(new CircleGeometry(LAMP_R, 28), this.spotMat)
    this.spot.rotation.x = -Math.PI / 2
    this.spot.renderOrder = 2
    const cone = new ConeGeometry(1, 1, 20, 1, true)
    cone.translate(0, -0.5, 0)
    this.beam = new Mesh(cone, this.beamMat)
    this.group.add(this.spot, this.beam)
    scene.add(this.group)
  }

  /** Pose it for this frame: `aim` is where the turrets look (the mech). */
  update(a: Airship, dt: number, aim: { x: number; y: number; z: number }, loud = false): void {
    const r = this.rig.root
    this.shatter.update(dt)
    if (this.broken) return
    r.visible = !a.gone
    r.position.set(a.x, a.y, a.z)
    _e.set(a.pitch, a.yaw, a.roll, 'YXZ')
    r.quaternion.setFromEuler(_e)
    for (let i = 0; i < 4; i++) {
      const fan = this.rig.bones[`fan${i}`]!
      if (a.engines[i]! > 0) fan.rotation.z += dt * 20
    }
    // The turrets swing onto the mech (in the hull's frame), the barrels pitch to it.
    r.updateMatrixWorld(true)
    _m.copy(r.matrixWorld).invert()
    for (const id of ['F', 'B'] as const) {
      const t = this.rig.bones[`turret${id}`]!
      const local = _v.set(aim.x, aim.y, aim.z).applyMatrix4(_m)
      const [tx, ty, tz] = TURRET_AT[id]
      const dx = local.x - tx
      const dy = local.y - ty
      const dz = local.z - tz
      const live = a.turrets[id] > 0 && flying(a)
      const yaw = live ? Math.atan2(dx, dz) : t.rotation.y
      t.rotation.y += (yaw - t.rotation.y) * Math.min(1, dt * 3)
      const barrels = this.rig.bones[`barrels${id}`]!
      const pitch = live ? -Math.atan2(dy, Math.hypot(dx, dz)) : 0.4
      barrels.rotation.x += (Math.max(-1.2, Math.min(1.2, pitch)) - barrels.rotation.x) * Math.min(1, dt * 3)
      this.recoil[id] = Math.max(0, this.recoil[id] - dt * 8)
      barrels.position.z = this.rig.rest[`barrels${id}`]!.p.z - 0.25 * this.recoil[id]
    }
    // Its searchlight's pool and beam: warm on a quiet base, out once it fights or falls.
    const lit = flying(a) && !loud
    this.spot.visible = this.beam.visible = lit
    if (lit) {
      const fl = heightAt(this.grid, a.lampX, a.lampZ)
      const gy = (fl === VOID ? 0 : fl) + 0.05
      this.spot.position.set(a.lampX, gy, a.lampZ)
      const lamp = this.rig.bones.lamp!.getWorldPosition(_v)
      const len = Math.max(1, lamp.y - gy)
      this.beam.position.copy(lamp)
      this.beam.scale.set(LAMP_R, len, LAMP_R)
      this.beam.quaternion.setFromUnitVectors(_up, _dir.set(a.lampX - lamp.x, gy - lamp.y, a.lampZ - lamp.z).normalize().negate())
      this.spotMat.opacity = 0.26 + 0.06 * Math.sin(a.time * 3)
      this.spotMat.color.set(a.seenT > 0 ? '#ffc04a' : '#fff3c4')
    }
    // Falling: in the air, it comes apart.
    if (a.crashT >= BREAK_AT_S && !this.broken) {
      r.updateMatrixWorld(true)
      this.broken = this.shatter.break(WRECK, this.rig, { dirX: Math.sin(a.yaw), dirZ: Math.cos(a.yaw), force: 6, seed: 0.42 })
      r.visible = false
    }
  }

  /** A round left this turret's barrel: it kicks back. */
  fired(id: TurretId): void {
    this.recoil[id] = 1
  }

  /** The world point at a socket's mouth this frame (#142). */
  socket(name: keyof typeof AIRSHIP_SOCKETS, i: number, out = new Vector3()): Vector3 {
    const list = AIRSHIP_SOCKETS[name]
    const [bone, x, y, z] = list[i % list.length]!
    this.rig.root.updateMatrixWorld(true)
    return this.rig.bones[bone]!.localToWorld(out.set(x, y, z))
  }

  /** Which way a socket's barrel or tube points, in the world. */
  socketDir(name: keyof typeof AIRSHIP_SOCKETS, out = new Vector3()): Vector3 {
    const bone = AIRSHIP_SOCKETS[name][0]![0]
    this.rig.bones[bone]!.getWorldQuaternion(_q)
    return out.set(0, 0, 1).applyQuaternion(_q)
  }

  /** Each engine's middle, in the world. */
  engines(): Array<{ x: number; y: number; z: number }> {
    this.rig.root.updateMatrixWorld(true)
    return ENGINE_AT.map((_, i) => {
      const p = this.rig.bones[`engine${i}`]!.getWorldPosition(new Vector3())
      return { x: p.x, y: p.y, z: p.z }
    })
  }

  /** A turret's middle, in the world. */
  turret(id: TurretId): Vector3 {
    this.rig.root.updateMatrixWorld(true)
    return this.rig.bones[`turret${id}`]!.getWorldPosition(new Vector3())
  }

  /** The hull's frame: a world point in the hull's own coordinates. */
  toHull(x: number, y: number, z: number, out = new Vector3()): Vector3 {
    this.rig.root.updateMatrixWorld(true)
    return out.set(x, y, z).applyMatrix4(_m.copy(this.rig.root.matrixWorld).invert())
  }

  /** Its rockets in flight: a tube and a nose, along their way. */
  drawRockets(list: readonly ShipRocket[]): void {
    while (this.pool.length < list.length) {
      const g = new Group()
      const body = new Mesh(this.rocketGeo, this.rocketMat)
      body.rotation.x = Math.PI / 2
      const nose = new Mesh(this.noseGeo, this.rocketMat)
      nose.rotation.x = Math.PI / 2
      nose.position.z = 0.72
      g.add(body, nose)
      this.group.add(g)
      this.pool.push(g)
    }
    this.pool.forEach((g, i) => {
      const r = list[i]
      g.visible = !!r
      if (!r) return
      g.position.set(r.x, r.y, r.z)
      g.lookAt(r.x + r.vx, r.y + r.vy, r.z + r.vz)
    })
  }

  dispose(): void {
    this.rig.mesh.geometry.dispose()
    this.rig.outline?.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
    this.shatter.dispose()
    this.rocketGeo.dispose()
    this.noseGeo.dispose()
    this.rocketMat.dispose()
    this.spot.geometry.dispose()
    this.beam.geometry.dispose()
    this.spotMat.dispose()
    this.beamMat.dispose()
    this.group.removeFromParent()
  }
}
