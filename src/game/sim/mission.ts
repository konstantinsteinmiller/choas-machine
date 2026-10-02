import { PerspectiveCamera, type Mesh } from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { consumeEdges, type Input } from '../engine/input'
import { input as sharedInput, inputClock } from '../engine/inputState'
import { emit } from '../bus'
import { hud, mirror, runHudTickers, threats, MAX_THREATS } from '../state/hud'
import { CELL, heightAt } from '../world/grid'
import type { Fortress } from '../world/fortress'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildDecor, type DecorMesh } from '../world/decor'
import { buildSky, type Sky } from '../world/sky'
import { makeBlobShadow } from '../fx/markers'
import type { Rig } from '../models/kit'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { makePlayer, stepPlayer, eyeHeight, angleDelta, type Player } from './player'
import { makeCam, lookCam, stepCam, placeCam, stickToWorld, type Cam } from './camera'
import type { WeaponId } from '../data/ids'
import { Vector3 } from 'three'
import { MECH_HEIGHT, MECH_HEIGHT_CROUCH } from '../models/mech'
import { alertSegments } from './alert'
import { drainEvents, headingTo, killUnit, makeGarrison, stepGarrison, type Garrison, type Target } from './garrison'
import { GarrisonView } from './garrisonView'

/**
 * ─── A mission ───────────────────────────────────────────────────────────────
 *
 * One infiltration of one fortress: the island, the mech on it, and the
 * camera on the mech. Logic runs in `update` on the fixed 60 Hz step; `render`
 * draws every frame, interpolating between the last two steps, and applies
 * the look drag (which must follow the hand at the display's rate, not the
 * simulation's).
 */

/** The sniper scope's field of view, in degrees. */
const SCOPE_FOV = 17

export class Mission implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(60, 1, 0.15, 900)
  readonly player: Player
  readonly cam: Cam
  readonly garrison: Garrison
  private garrisonView!: GarrisonView
  private target: Target
  private mesh!: FortressMesh
  private decor!: DecorMesh
  private sky!: Sky
  private rig!: Rig
  private shadow!: Mesh
  private pose: MechPose = restPose()
  private time = 0
  private weapon: WeaponId = 'sniper'
  private baseFov = 60
  private centre = new Vector3()
  /** Look sensitivity multiplier (the player's setting). */
  sensitivity = 1

  private constructor(readonly fortress: Fortress, private input: Input) {
    const g = fortress.grid
    const { x, z, facing } = fortress.insert
    this.player = makePlayer(x, heightAt(g, x, z), z, facing)
    this.cam = makeCam(facing)
    this.garrison = makeGarrison(fortress)
    this.target = { x, y: this.player.y, z, height: MECH_HEIGHT, crouched: false, visible: true }
    this.centre.set((g.w * CELL) / 2, 0, (g.d * CELL) / 2)
  }

  static async create(
    fortress: Fortress, input: Input = sharedInput, slice: Slice = noSlice, onProgress: (p01: number) => void = () => {}
  ): Promise<Mission> {
    const m = new Mission(fortress, input)
    m.sky = buildSky(m.scene, m.centre)
    m.mesh = await buildFortressMesh(fortress, undefined, slice, p => onProgress(p * 0.8))
    m.decor = buildDecor(fortress.decor)
    await slice()
    m.rig = buildMech()
    m.shadow = makeBlobShadow(0.7)
    await slice()
    m.garrisonView = new GarrisonView(m.garrison, fortress.grid)
    m.scene.add(m.mesh.group, m.decor.group, m.rig.root, m.shadow, m.garrisonView.group)
    onProgress(1)
    m.place(1, 0)
    return m
  }

  enter(): void {
    mirror('device', this.input.device)
    mirror('weapon', this.weapon)
    hud.alert = 0
    hud.chaos = false
    hud.watched = false
    threats.n = 0
  }

  resize(w: number, h: number): void {
    this.baseFov = fovForAspect(w / Math.max(1, h))
  }

  update(dt: number): void {
    const i = this.input
    const p = this.player
    this.time += dt
    inputClock.tick()

    if (hud.phase === 'play') {
      const dir = stickToWorld(this.cam, i.moveX, i.moveY)
      const wasCrouched = p.crouched
      const events = stepPlayer(p, this.fortress.grid, {
        mx: dir.x,
        mz: dir.z,
        crouch: i.crouchQueued,
        aiming: i.aimHeld,
        aimYaw: this.cam.yaw
      }, dt)
      for (const e of events) {
        if (e.type === 'land') emit('land', { drop: e.drop })
        else emit('traverse', { kind: e.type })
      }
      if (p.crouched !== wasCrouched) emit('crouch', { crouched: p.crouched })
      this.stepGarrison(dt)
    }

    mirror('device', i.device)
    mirror('crouched', p.crouched)
    mirror('aiming', i.aimHeld)
    mirror('mode', p.mode)
    consumeEdges(i)
  }

  /** The defenders' turn: what they see of the mech, and what they do about it. */
  private stepGarrison(dt: number): void {
    const p = this.player
    const gar = this.garrison
    const t = this.target
    t.x = p.x
    t.y = p.y
    t.z = p.z
    t.height = MECH_HEIGHT + (MECH_HEIGHT_CROUCH - MECH_HEIGHT) * p.crouch
    t.crouched = p.crouched
    stepGarrison(gar, this.fortress.grid, t, dt)
    this.flushGarrison()
  }

  /** Turn what the garrison did into bus events and HUD state. */
  private flushGarrison(): void {
    const gar = this.garrison
    for (const e of drainEvents(gar)) {
      if (e.type === 'chaos') emit('chaos', {})
      else if (e.type === 'calm') emit('calm', { id: e.id })
      else if (e.type === 'body') emit('body', { id: e.id, corpse: e.corpse })
      else emit(e.type, { id: e.id, kind: gar.units[e.id]!.kind })
    }
    const seg = alertSegments(gar.alert)
    if (seg !== hud.alert) {
      const prev = hud.alert
      hud.alert = seg
      emit('alert', { segments: seg, prev })
    }
    mirror('chaos', gar.alert.chaos)
    let watched = false
    for (const u of gar.units) if (u.state === 'combat' && u.sees) { watched = true; break }
    mirror('watched', watched)
  }

  /** Take a defender out (the weapons call this; so does the test probe). */
  kill(id: number): void {
    killUnit(this.garrison, id, this.player.x, this.player.z)
    this.flushGarrison()
  }

  /** The defenders nearest to noticing the mech, for the HUD's arcs. */
  private writeThreats(x: number, z: number): void {
    let n = 0
    for (const u of this.garrison.units) {
      if (u.state === 'dead' || u.state === 'dormant') continue
      const hot = u.state === 'combat'
      const level = hot ? 1 : u.state === 'search' || (u.state === 'suspicious' && !u.lured) ? Math.max(u.detect, 0.45) : u.detect
      if (level < 0.06) continue
      // Keep the strongest few: replace the weakest once the list is full.
      let slot = n
      if (n === MAX_THREATS) {
        slot = 0
        for (let k = 1; k < MAX_THREATS; k++) if (threats.level[k]! < threats.level[slot]!) slot = k
        if (threats.level[slot]! >= level) continue
      } else {
        n++
      }
      threats.angle[slot] = angleDelta(this.cam.yaw, headingTo(x, z, u.x, u.z))
      threats.level[slot] = level
      threats.hot[slot] = hot ? 1 : 0
    }
    threats.n = n
  }

  /** Put the mech, its shadow and the camera where they are this frame. */
  private place(alpha: number, dt: number): void {
    const p = this.player
    const i = this.input
    const g = this.fortress.grid
    const x = p.px + (p.x - p.px) * alpha
    const y = p.py + (p.y - p.py) * alpha
    const z = p.pz + (p.z - p.pz) * alpha
    const yaw = p.pyaw + angleDelta(p.pyaw, p.yaw) * alpha

    // The look: applied here, at the display's rate, and consumed here.
    lookCam(this.cam, i.lookDX, i.lookDY, i.turn, dt, this.sensitivity, this.camera.fov, this.baseFov)
    i.lookDX = 0
    i.lookDY = 0
    stepCam(this.cam, i.aimHeld && hud.phase === 'play', dt)
    const view = placeCam(this.cam, g, x, y, z, eyeHeight(p), this.weapon, this.baseFov, SCOPE_FOV, dt)

    this.camera.position.set(view.x, view.y, view.z)
    this.camera.lookAt(view.tx, view.ty, view.tz)
    if (Math.abs(this.camera.fov - view.fov) > 0.01) {
      this.camera.fov = view.fov
      this.camera.updateProjectionMatrix()
    }
    mirror('scoped', view.inside > 0.6)

    // The body.
    this.rig.root.position.set(x, y, z)
    this.rig.root.rotation.y = yaw
    this.rig.root.visible = view.inside < 0.6
    const s = this.pose
    s.time = this.time
    s.stride = p.stride
    s.speed = p.mode === 'ground' ? p.speed01 : 0
    s.crouch = p.crouch
    s.aim = this.cam.aim
    s.aimPitch = this.cam.pitch
    s.weapon = this.weapon
    s.climb = p.mode === 'ladder' || p.mode === 'mantle' ? 1 : 0
    s.climbPhase = p.climbPhase
    s.cable = p.mode === 'cable' ? 1 : 0
    s.air = p.mode === 'air' ? 1 : 0
    poseMech(this.rig, s)

    // A soft shadow on whatever is under the mech, fading with its height.
    const floor = heightAt(g, x, z)
    this.shadow.position.set(x, floor + 0.03, z)
    this.shadow.visible = floor > -100
    const lift = Math.max(0, y - floor)
    this.shadow.scale.setScalar(0.7 / (1 + lift * 0.25))

    this.garrisonView.update(alpha, dt, this.time, view.x, view.y, view.z)
    this.writeThreats(x, z)
  }

  render(alpha: number, dt: number): void {
    this.place(alpha, dt)
    this.sky.update(this.camera.position, this.time)
    runHudTickers(dt)
    const r = getRenderer()
    r.info.reset()
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    this.mesh.dispose()
    this.decor.dispose()
    this.sky.dispose()
    this.garrisonView.dispose()
    this.rig.mesh.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
  }
}
