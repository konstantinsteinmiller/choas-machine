import { CircleGeometry, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { buildRobodog, poseRobodog, DOG_STAND, BOARD_HOVER } from '../models/robodog'
import { getRenderer } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { buildSky, type Sky } from '../world/sky'
import { toon } from '../models/toon'
import type { Rig } from '../models/kit'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import {
  buildGuard, poseGuard, restGuardPose, buildDrone, poseDrone, buildEnforcer, poseEnforcer, buildGoliath, poseGoliath, buildRoomba, poseRoomba
} from '../models/garrison'
import type { WeaponId } from '../data/ids'
import { guardGaitRate } from '../sim/gait'
import { BACKSTAB_VARIANTS, VARIANTS, type BackstabVariant } from '../sim/backstab'
import { poseBackstabGuard, poseBackstabMech } from '../sim/backstabStage'

/**
 * DEV ONLY (`?bench=models`): every rig on a pad, animated, for art iteration.
 *   m=mech|guard|commander|drone|enforcer|goliath|all   which rig(s)
 *   m=takedown                                          the backstab, both bodies, looping (t from the close-in)
 *   v=neck|kneel|throat                                 which backstab (m=takedown)
 *   pose=idle|walk|run|wary|search|startle|crouch|aim|stab|climb|cable|air|dormant
 *        die|die-front|die-spin|die-thrown (with t=<seconds since>)|dead
 *   seed=0..1                                           a guard's own gait and fidgets
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
  /** The backstab's two place themselves (`m=takedown`). */
  private paired = false
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
      if (poseName === 'cable') { p.cable = 1; p.stride = t * 7.5; p.speed = 1 }
      if (poseName === 'air') p.air = 1
      // #148: one knee at a panel, braced on the flamethrower, a landing.
      if (poseName === 'activate') p.activate = 1
      if (poseName === 'brace') { p.brace = 1; p.stow = 1; p.aim = 1 }
      if (poseName === 'land') p.land = 0.5 + 0.5 * Math.cos(t * 2.5)
      return p
    }
    if (all || which === 'mech') {
      const rig = buildMech()
      add(rig, 0, (t) => poseMech(rig, mechPose(t)))
    }
    if (all || which === 'robodog') {
      // pose=run gallops; pose=fold lies down into the board and back up.
      const rig = buildRobodog()
      add(rig, 0, (t) => {
        const fold = poseName === 'fold' ? 0.5 - 0.5 * Math.cos(t * 1.6) : poseName === 'board' ? 1 : 0
        poseRobodog(rig, { time: t, stride: t * 12, run: poseName === 'run' ? 1 : 0, fold, thrust: 0.6 })
        rig.root.position.y = DOG_STAND + (BOARD_HOVER - DOG_STAND) * fold
      }, 2.4)
    }
    if (which === 'takedown') {
      // The backstab, both bodies, on the variant's own clock (`t` is seconds
      // from the mech closing in), looping once the body has fallen. The guard
      // stands at the middle facing +z; the mech is placed by the kill itself.
      const v = (BACKSTAB_VARIANTS as readonly string[]).includes(q.get('v') ?? '') ? q.get('v') as BackstabVariant : 'neck'
      const loop = VARIANTS[v].release + 1.6
      const mech = buildMech()
      const guard = buildGuard(false)
      add(mech, 0, (t) => {
        poseBackstabMech(mech, { ...restPose(), time: t, weapon }, v, t % loop, 0, 0, 0, 0)
      })
      add(guard, 0, (t) => {
        const g = { ...restGuardPose(), time: t, seed: 0.7 }
        guard.root.position.set(0, 0, 0)
        guard.root.rotation.y = poseBackstabGuard(g, v, t % loop, 0)
        poseGuard(guard, g)
      })
      this.paired = true
    }
    for (const commander of [false, true]) {
      if (all || which === (commander ? 'commander' : 'guard')) {
        const rig = buildGuard(commander, q.has('shield'))
        add(rig, 0, (t) => poseGuard(rig, {
          ...restGuardPose(),
          time: t,
          // A patrol's pace is 0.42 of a run (1.6 m/s), a run 3.9 m/s; the stride per metre follows the pace (#148).
          stride: poseName === 'run' || poseName === 'burn' ? t * 3.9 * guardGaitRate(1) : t * 1.6 * guardGaitRate(0.42),
          speed: poseName === 'walk' || poseName === 'wary' ? 0.42 : poseName === 'run' || poseName === 'burn' ? 1 : 0,
          inspect: poseName === 'kneel' ? 1 : 0,
          work: poseName === 'work' ? 1 : 0,
          burning: poseName === 'burn' ? 1 : 0,
          // A shield guard (`shield`, #151): up over his head, or (`peek`) looking out.
          shieldUp: q.has('shield') && poseName !== 'peek' ? 1 : 0,
          aim: poseName === 'aim' ? 1 : 0,
          wary: poseName === 'search' ? 1 : 0,
          caution: poseName === 'wary' || poseName === 'search' ? 1 : 0,
          startle: poseName === 'startle' ? Math.max(0, 1 - (t % 1.5) * 3.5) : 0,
          recoil: poseName === 'aim' ? Math.max(0, 1 - (t % 0.6) * 6) : 0,
          seed: Number(q.get('seed') ?? (commander ? 0.2 : 0.7)),
          proud: commander,
          deadT: poseName.startsWith('die') ? Math.max(1e-3, t) : 0,
          death: poseName === 'die-front' ? 'front' : poseName === 'die-spin' ? 'spin' : poseName === 'die-thrown' ? 'thrown' : 'back'
        }))
      }
    }
    // Round 4's defenders (#72 #90): the two Roombas, and the guard kits.
    if (all || which === 'roomba') {
      for (const shotgun of [false, true]) {
        const rig = buildRoomba(shotgun)
        add(rig, 0, (t) => poseRoomba(rig, { time: t, alarm: poseName === 'aim' ? 1 : 0, recoil: poseName === 'aim' ? Math.max(0, 1 - (t % 0.6) * 6) : 0, aimYaw: Math.sin(t) * 0.5, speed: poseName === 'walk' ? 1 : 0 }), 1.6)
      }
    }
    if (which === 'kits') {
      for (const [shield, kit] of [[true, null], [false, 'grenadier'], [false, 'marksman']] as const) {
        const rig = buildGuard(false, shield, false, kit)
        add(rig, 0, (t) => poseGuard(rig, { ...restGuardPose(), time: t, aim: poseName === 'aim' ? 1 : 0 }))
      }
    }
    if (all || which === 'drone') {
      const rig = buildDrone()
      add(rig, 2.2, (t) => poseDrone(rig, { time: t, spin: t * 40, pitch: 0.12, roll: Math.sin(t) * 0.1, eyeYaw: 0, eyePitch: 0.7, alarm: poseName === 'wary' ? 1 : 0, deadT: poseName === 'die' ? Math.max(1e-3, t) : 0, landed: poseName === 'die' && t > 0.8 }))
    }
    if (all || which === 'enforcer') {
      const rig = buildEnforcer(q.has('foreman'))
      add(rig, 0, (t) => poseEnforcer(rig, {
        time: t,
        stride: t * 4,
        speed: poseName === 'walk' ? 1 : 0,
        power: poseName === 'dormant' ? 0 : 1,
        aimYaw: poseName === 'aim' ? Math.sin(t) * 0.5 : 0,
        aimPitch: 0,
        recoilL: poseName === 'aim' ? Math.max(0, Math.sin(t * 12)) : 0,
        recoilR: poseName === 'aim' ? Math.max(0, -Math.sin(t * 12)) : 0,
        deadT: poseName === 'die' ? Math.max(1e-3, t) : 0
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
    // The backstab's two: the guard at the middle, the mech where the kill puts it.
    if (this.paired) for (const e of this.entries) e.update(this.frozen ?? 0)
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
