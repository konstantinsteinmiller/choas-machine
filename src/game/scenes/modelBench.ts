import { CircleGeometry, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { getRenderer } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { buildSky, type Sky } from '../world/sky'
import { toon } from '../models/toon'
import type { Rig } from '../models/kit'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import {
  buildGuard, poseGuard, buildDrone, poseDrone, buildEnforcer, poseEnforcer, buildGoliath, poseGoliath
} from '../models/garrison'
import type { WeaponId } from '../data/ids'

/**
 * DEV ONLY (`?bench=models`): every rig on a pad, animated, for art iteration.
 *   m=mech|guard|commander|drone|enforcer|goliath|all   which rig(s)
 *   pose=idle|walk|crouch|aim|stab|climb|cable|air|dead|dormant
 *   weapon=sniper|minigun|rocket
 *   view=az,el,dist                                     the camera
 *   t=<seconds>                                         freeze time here
 */

interface Entry { rig: Rig; x: number; y: number; width: number; update: (t: number) => void }

export class ModelBench implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(40, 1, 0.1, 600)
  private sky: Sky
  private entries: Entry[] = []
  private t = 0
  private frozen: number | null
  private centre = new Vector3()
  private az: number
  private el: number
  private dist: number

  constructor(search: string) {
    const q = new URLSearchParams(search)
    const which = q.get('m') ?? 'all'
    const poseName = q.get('pose') ?? 'walk'
    const weapon = (q.get('weapon') ?? 'sniper') as WeaponId
    this.frozen = q.has('t') ? Number(q.get('t')) : null
    const [az, el, dist] = (q.get('view') ?? '').split(',').map(Number)
    this.sky = buildSky(this.scene, this.centre)

    const add = (rig: Rig, y: number, update: (t: number) => void, width = Math.max(1.6, rig.height * 0.9)): void => {
      this.entries.push({ rig, x: 0, y, width, update })
      this.scene.add(rig.root)
    }
    const all = which === 'all'
    const mechPose = (t: number): MechPose => {
      const p = restPose()
      p.time = t
      p.weapon = weapon
      p.spin = t * 20
      if (poseName === 'walk') { p.stride = t * 7; p.speed = 1 }
      if (poseName === 'crouch') { p.crouch = 1; p.stride = t * 5; p.speed = 0.6 }
      if (poseName === 'aim') { p.aim = 1; p.aimPitch = Math.sin(t) * 0.25; p.recoil = Math.max(0, 1 - (t % 1.5) * 4) }
      if (poseName === 'stab') { p.blade = 1; p.stab = (t % 1.2) / 0.5 <= 1 ? (t % 1.2) / 0.5 : 0 }
      if (poseName === 'climb') { p.climb = 1; p.climbPhase = t * 6 }
      if (poseName === 'cable') { p.cable = 1; p.stride = t * 4; p.speed = 0.5 }
      if (poseName === 'air') p.air = 1
      return p
    }
    if (all || which === 'mech') {
      const rig = buildMech()
      add(rig, 0, (t) => poseMech(rig, mechPose(t)))
    }
    for (const commander of [false, true]) {
      if (all || which === (commander ? 'commander' : 'guard')) {
        const rig = buildGuard(commander)
        add(rig, 0, (t) => poseGuard(rig, {
          time: t,
          stride: t * 8,
          speed: poseName === 'walk' ? 1 : 0,
          aim: poseName === 'aim' ? 1 : 0,
          wary: poseName === 'idle' ? 1 : 0,
          lookYaw: 0,
          dead: poseName === 'dead' ? Math.min(1, (t % 3) / 0.6) : 0,
          fallDir: -1
        }))
      }
    }
    if (all || which === 'drone') {
      const rig = buildDrone()
      add(rig, 2.2, (t) => poseDrone(rig, { time: t, spin: t * 40, pitch: 0.12, roll: Math.sin(t) * 0.1, eyeYaw: Math.sin(t * 0.8) * 0.6, eyePitch: 0.3 }))
    }
    if (all || which === 'enforcer') {
      const rig = buildEnforcer()
      add(rig, 0, (t) => poseEnforcer(rig, {
        time: t,
        stride: t * 4,
        speed: poseName === 'walk' ? 1 : 0,
        power: poseName === 'dormant' ? 0 : 1,
        aimYaw: poseName === 'aim' ? Math.sin(t) * 0.5 : 0,
        aimPitch: 0,
        recoilL: poseName === 'aim' ? Math.max(0, Math.sin(t * 12)) : 0,
        recoilR: poseName === 'aim' ? Math.max(0, -Math.sin(t * 12)) : 0,
        dead: poseName === 'dead' ? 1 : 0
      }))
    }
    if (all || which === 'goliath') {
      const rig = buildGoliath()
      add(rig, 0, (t) => poseGoliath(rig, {
        time: t,
        turretYaw: Math.sin(t * 0.6) * 0.8,
        barrelPitch: 0.1 + Math.sin(t) * 0.1,
        recoil: Math.max(0, 1 - (t % 2.5) * 3),
        rumble: 1,
        dead: poseName === 'dead' ? 1 : 0
      }), 6)
    }

    // Lay the rigs out in a row, each given room for its own width.
    const widths = this.entries.map(e => e.width)
    const total = widths.reduce((a, b) => a + b, 0)
    let x = -total / 2
    this.entries.forEach((e, i) => {
      e.x = x + widths[i]! / 2
      x += widths[i]!
      e.rig.root.position.set(e.x, e.y, 0)
    })
    const pad = new Mesh(new CircleGeometry(Math.max(4, total * 0.7), 40), toon('#9a8be0'))
    pad.rotation.x = -Math.PI / 2
    this.scene.add(pad)

    const tallest = Math.max(...this.entries.map(e => e.rig.height + e.y), 2)
    this.centre.set(0, tallest * 0.5, 0)
    this.az = Number.isFinite(az) ? az! : 25
    this.el = Number.isFinite(el) ? el! : 12
    this.dist = Number.isFinite(dist) ? dist! : Math.max(tallest * 2.4, total * 1.25)
  }

  enter(): void {
    this.camera.fov = 40
    this.camera.updateProjectionMatrix()
  }

  resize(): void {
    this.enter()
  }

  update(dt: number): void {
    this.t += dt
  }

  render(): void {
    const t = this.frozen ?? this.t
    for (const e of this.entries) e.update(t)
    const az = (this.az * Math.PI) / 180
    const el = (this.el * Math.PI) / 180
    this.camera.position.set(
      this.centre.x + Math.sin(az) * Math.cos(el) * this.dist,
      this.centre.y + Math.sin(el) * this.dist,
      this.centre.z + Math.cos(az) * Math.cos(el) * this.dist
    )
    this.camera.lookAt(this.centre)
    this.sky.update(this.camera.position, t)
    const r = getRenderer()
    r.info.reset()
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    this.sky.dispose()
    for (const e of this.entries) {
      e.rig.mesh.geometry.dispose()
      e.rig.material.dispose()
      e.rig.glowMaterial.dispose()
    }
  }
}
