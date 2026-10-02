import { PerspectiveCamera, Sprite, SpriteMaterial, AdditiveBlending, Vector3, type Mesh } from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { consumeEdges, type Input } from '../engine/input'
import { input as sharedInput, inputClock } from '../engine/inputState'
import { emit } from '../bus'
import { gun, hud, mirror, runHudTickers, threats, MAX_THREATS } from '../state/hud'
import { CELL, VOID, heightAt } from '../world/grid'
import type { Fortress } from '../world/fortress'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildDecor, type DecorMesh } from '../world/decor'
import { buildSky, type Sky } from '../world/sky'
import { ringTexture } from '../world/textures'
import { makeBlobShadow } from '../fx/markers'
import { CombatFx } from '../fx/combatFx'
import type { Rig } from '../models/kit'
import { buildMech, poseMech, restPose, MECH_HEIGHT, MECH_HEIGHT_CROUCH, type MechPose } from '../models/mech'
import { PAL } from '../models/palette'
import { WEAPON_IDS, type WeaponId } from '../data/ids'
import { haptic } from '@/use/useHaptics'
import { getState } from '@/use/useGameState'
import { LOOK_SENS_KEY } from '@/keys'
import { makePlayer, stepPlayer, eyeHeight, angleDelta, type Player } from './player'
import { makeCam, lookCam, stepCam, placeCam, stickToWorld, camForward, type Cam } from './camera'
import { alertSegments } from './alert'
import {
  SPECS, drainEvents, headingTo, killUnit, damageUnit, makeGarrison, noiseAt, stepGarrison, alarmUnit,
  type Garrison, type Target
} from './garrison'
import { GarrisonView } from './garrisonView'
import { castShot, makeShotHit } from './hitscan'
import { blast, shotDamage } from './damage'
import { SPREAD, ammoOf, makeArsenal, stepArsenal, type Arsenal, type Trigger } from './weapons'
import { DECOYS_PER_MISSION, decoySpot, findStrike, stepDecoys, type Decoy, type Strike, type StrikeKind } from './melee'
import { fireRocket, stepRockets, type Rocket } from './rockets'

/**
 * ─── A mission ───────────────────────────────────────────────────────────────
 *
 * One infiltration of one fortress: the island, its garrison, the mech and
 * its weapons, and the camera on the mech. Logic runs in `update` on the
 * fixed 60 Hz step; `render` draws every frame, interpolating between the
 * last two steps, and applies the look drag (which must follow the hand at
 * the display's rate, not the simulation's).
 *
 * The rules themselves live in the pure modules beside this one; this class
 * is where they meet the input, the renderer, the HUD and the bus.
 */

/** The sniper scope's field of view, in degrees. */
const SCOPE_FOV = 17
/** How far a round flies. */
const SHOT_RANGE = 260
/** A sniper round that hits a wall is heard this far. */
const MISS_EARSHOT = 8
/** The scope's sway, radians: standing, and steadied in a crouch. */
const SWAY = 0.0034
const SWAY_CROUCH = 0.0012

/** A strike in progress: the mech is not the player's for its length. */
interface StrikeRun {
  id: number
  kind: StrikeKind
  t: number
  dur: number
  fx: number
  fy: number
  fz: number
  tx: number
  ty: number
  tz: number
  yaw: number
  landed: boolean
}

/** What the mission remembers for the tally. */
export interface MissionStats {
  time: number
  shots: number
  hits: number
  headshots: number
  kills: number
  bladeKills: number
  /** Times a defender was sure it saw the mech. */
  spotted: number
  bodiesFound: number
  /** The base reached full alert. */
  loud: boolean
}

export type KillBy = WeaponId | 'blade'

export class Mission implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(60, 1, 0.15, 900)
  readonly player: Player
  readonly cam: Cam
  readonly garrison: Garrison
  readonly arsenal: Arsenal = makeArsenal()
  readonly decoys: Decoy[] = []
  readonly rockets: Rocket[] = []
  readonly stats: MissionStats = { time: 0, shots: 0, hits: 0, headshots: 0, kills: 0, bladeKills: 0, spotted: 0, bodiesFound: 0, loud: false }
  decoysLeft = DECOYS_PER_MISSION
  /** The strike on offer right now. */
  offer: Strike | null = null
  private strike: StrikeRun | null = null
  private garrisonView!: GarrisonView
  private fx!: CombatFx
  private target: Target
  private mesh!: FortressMesh
  private decor!: DecorMesh
  private sky!: Sky
  private rig!: Rig
  private shadow!: Mesh
  private strikeMark!: Sprite
  private pose: MechPose = restPose()
  private time = 0
  private baseFov = 60
  private viewH = 720
  private centre = new Vector3()
  private hit = makeShotHit()
  private trigger: Trigger = { aimHeld: false, aimReleased: false, firePressed: false, fireHeld: false, touch: false, reload: false, select: null, cycle: false }
  /** Who and how, for the kills of the current step. */
  private killBy: KillBy = 'sniper'
  private killHead = false
  /** Camera shake: decays; added to the view. */
  private shake = 0
  /** Eased blade-out and stab values for the pose. */
  private bladeOut = 0
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
    await slice()
    m.fx = new CombatFx()
    m.strikeMark = new Sprite(new SpriteMaterial({
      map: ringTexture(), color: PAL.mechBlade, transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false
    }))
    m.strikeMark.renderOrder = 31
    m.strikeMark.visible = false
    m.scene.add(m.mesh.group, m.decor.group, m.rig.root, m.shadow, m.garrisonView.group, m.fx.group, m.strikeMark)
    onProgress(1)
    m.place(1, 0)
    return m
  }

  enter(): void {
    this.sensitivity = Math.min(2, Math.max(0.4, getState<number>(LOOK_SENS_KEY, 1) || 1))
    mirror('device', this.input.device)
    hud.alert = 0
    hud.chaos = false
    hud.watched = false
    threats.n = 0
    this.mirrorWeapons()
  }

  resize(w: number, h: number): void {
    this.baseFov = fovForAspect(w / Math.max(1, h))
    this.viewH = h
  }

  // ─── The step ──────────────────────────────────────────────────────────────

  update(dt: number): void {
    const i = this.input
    const p = this.player
    this.time += dt
    inputClock.tick()

    if (hud.phase === 'play') {
      this.stats.time += dt
      if (this.strike) {
        this.stepStrike(dt)
      } else {
        const dir = stickToWorld(this.cam, i.moveX, i.moveY)
        const wasCrouched = p.crouched
        const events = stepPlayer(p, this.fortress.grid, {
          mx: dir.x,
          mz: dir.z,
          crouch: i.crouchQueued,
          aiming: this.weaponUp(),
          aimYaw: this.cam.yaw
        }, dt)
        for (const e of events) {
          if (e.type === 'land') {
            emit('land', { drop: e.drop })
            if (e.drop > 2) { this.shake = Math.max(this.shake, 0.25); haptic('tap') }
          } else emit('traverse', { kind: e.type })
        }
        if (p.crouched !== wasCrouched) emit('crouch', { crouched: p.crouched })
        this.offer = findStrike(this.garrison, this.fortress.grid, p.x, p.y, p.z, this.cam.yaw, p.mode === 'ground')
        if (i.actQueued && this.offer) this.startStrike(this.offer)
        if (i.decoyQueued) this.throwDecoy()
      }
      this.stepWeapons(dt)
      this.stepRockets(dt)
      if (stepDecoys(this.decoys, this.garrison, this.fortress.grid, dt) > 0) mirror('decoys', this.decoysLeft)
      this.stepGarrison(dt)
    }

    this.shake = Math.max(0, this.shake - dt * 2.2)
    mirror('device', i.device)
    mirror('crouched', p.crouched)
    mirror('aiming', this.weaponUp())
    mirror('mode', p.mode)
    mirror('strike', this.strike ? '' : this.offer?.kind ?? '')
    consumeEdges(i)
  }

  // ─── Weapons ───────────────────────────────────────────────────────────────

  /**
   * The weapon is up: the aim is held, or (with a mouse) the trigger of a
   * weapon that is fired from the hip is.
   */
  private weaponUp(): boolean {
    const i = this.input
    if (this.strike || this.player.mode !== 'ground' || hud.phase !== 'play') return false
    return i.aimHeld || (i.fireHeld && i.device === 'mouse' && this.arsenal.current !== 'sniper')
  }

  private stepWeapons(dt: number): void {
    const i = this.input
    const a = this.arsenal
    const p = this.player
    const t = this.trigger
    // Hands are busy on a ladder, a cable, a ledge, or mid-strike.
    const free = p.mode === 'ground' && !this.strike
    t.touch = i.device === 'touch'
    t.aimHeld = free && i.aimHeld
    t.aimReleased = free && i.aimReleased
    t.firePressed = free && i.firePressed
    t.fireHeld = free && i.fireHeld
    t.reload = i.reloadQueued
    t.select = i.weaponQueued ? WEAPON_IDS[i.weaponQueued - 1]! : null
    t.cycle = i.cycleQueued
    const was = a.current
    const rounds = stepArsenal(a, t, dt)
    if (a.current !== was) emit('weapon', { weapon: a.current })
    for (let k = 0; k < rounds; k++) this.fireRound()
    this.mirrorWeapons()
  }

  private mirrorWeapons(): void {
    const a = this.arsenal
    mirror('weapon', a.current)
    mirror('ammo', ammoOf(a))
    mirror('reloading', a.current === 'sniper' ? a.reloading > 0 : a.current === 'rocket' && !a.rocketLoaded && a.rockets > 0)
    mirror('overheated', a.overheated)
    mirror('decoys', this.decoysLeft)
    gun.heat = a.heat
    gun.spool = a.spool
  }

  /** The line from the reticle into the world, and from the barrel to there. */
  private aimLine(spread: number): { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number } {
    const p = this.player
    const cam = this.cam
    const sway = this.swayNow()
    const yaw = cam.yaw + sway.yaw
    const pitch = cam.pitch + sway.pitch
    const c = Math.cos(pitch)
    let fx = Math.sin(yaw) * c
    let fy = Math.sin(pitch)
    let fz = Math.cos(yaw) * c
    // What the reticle is on: a ray from the camera, starting past the mech.
    const cp = this.camera.position
    const eyeY = p.y + eyeHeight(p)
    const skip = Math.max(0, (p.x - cp.x) * fx + (eyeY - cp.y) * fy + (p.z - cp.z) * fz)
    const h = castShot(this.fortress.grid, this.garrison.units, cp.x + fx * skip, cp.y + fy * skip, cp.z + fz * skip, fx, fy, fz, SHOT_RANGE, this.hit)
    // The barrel: at the mech's right shoulder (its right is −x when it faces +z).
    const ox = p.x - Math.cos(cam.yaw) * 0.42 + Math.sin(cam.yaw) * 0.5
    const oy = eyeY - 0.28
    const oz = p.z + Math.sin(cam.yaw) * 0.42 + Math.cos(cam.yaw) * 0.5
    const len = Math.hypot(h.x - ox, h.y - oy, h.z - oz)
    if (len > 1.5) {
      fx = (h.x - ox) / len
      fy = (h.y - oy) / len
      fz = (h.z - oz) / len
    }
    if (spread > 0) {
      // A cone round the line: two small turns.
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * spread
      const rx = -Math.cos(cam.yaw)
      const rz = Math.sin(cam.yaw)
      fx += rx * Math.cos(a) * r
      fz += rz * Math.cos(a) * r
      fy += Math.sin(a) * r
      const n = Math.hypot(fx, fy, fz)
      fx /= n
      fy /= n
      fz /= n
    }
    return { ox, oy, oz, dx: fx, dy: fy, dz: fz }
  }

  private swayNow(): { yaw: number; pitch: number } {
    if (this.arsenal.current !== 'sniper') return { yaw: 0, pitch: 0 }
    const k = this.cam.aim * (this.player.crouched ? SWAY_CROUCH : SWAY)
    const t = this.time
    return { yaw: (Math.sin(t * 1.13) + 0.5 * Math.sin(t * 2.71 + 1)) * k, pitch: (Math.sin(t * 0.87 + 2) + 0.5 * Math.sin(t * 2.2)) * k }
  }

  /** One round leaves the barrel of the weapon in hand. */
  private fireRound(): void {
    const w = this.arsenal.current
    const g = this.fortress.grid
    const gar = this.garrison
    const { ox, oy, oz, dx, dy, dz } = this.aimLine(SPREAD[w])
    this.stats.shots++
    this.fx.muzzle(ox, oy, oz, dx, dy, dz, w)
    haptic(w)
    emit('shot', { weapon: w })
    this.shake = Math.max(this.shake, w === 'sniper' ? 0.35 : w === 'rocket' ? 0.5 : 0.12)

    if (w === 'rocket') {
      fireRocket(this.rockets, ox, oy, oz, dx, dy, dz)
      this.goLoud()
      return
    }
    if (w === 'minigun') this.goLoud()

    const h = castShot(g, gar.units, ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit)
    this.fx.tracer(ox, oy, oz, h.x, h.y, h.z, w)
    if (h.kind === 'unit') {
      const u = gar.units[h.unit]!
      const soft = u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
      this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, soft, w)
      this.stats.hits++
      const head = h.zone === 'head' && soft
      if (head) this.stats.headshots++
      this.killBy = w
      this.killHead = head
      emit('hit', { id: u.id, weapon: w, zone: h.zone })
      if (!damageUnit(gar, u.id, shotDamage(w, u.kind, h.zone), ox, oz)) alarmUnit(gar, u.id, this.player.x, this.player.z)
    } else if (h.kind === 'world') {
      this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, false, w)
      // A silenced round is still heard where it lands.
      if (w === 'sniper') noiseAt(gar, this.target, h.x, h.z, MISS_EARSHOT, 'miss')
    }
    this.flushGarrison()
  }

  /** A weapon nobody can miss: the whole base hears it. */
  private goLoud(): void {
    if (this.garrison.alert.chaos) return
    noiseAt(this.garrison, this.target, this.player.x, this.player.z, 1e4, 'loud')
    this.flushGarrison()
  }

  private stepRockets(dt: number): void {
    if (this.rockets.length === 0) return
    const g = this.fortress.grid
    for (const b of stepRockets(this.rockets, g, this.garrison.units, dt)) {
      const floor = heightAt(g, b.x, b.z)
      this.fx.explosion(b.x, b.y, b.z, floor === VOID ? b.y - 1 : floor)
      this.killBy = 'rocket'
      this.killHead = false
      const res = blast(this.garrison, g, b.x, b.y, b.z, b.direct)
      if (res.kills.length + res.hurt.length > 0) this.stats.hits++
      for (const id of res.hurt) alarmUnit(this.garrison, id, this.player.x, this.player.z)
      emit('blast', { x: b.x, y: b.y, z: b.z, weak: res.weakHit })
      haptic('blast')
      // The nearer the blast, the harder the picture shakes.
      const d = Math.hypot(b.x - this.player.x, b.z - this.player.z)
      this.shake = Math.max(this.shake, Math.max(0.2, 1.1 - d / 40))
      this.flushGarrison()
    }
  }

  // ─── The blade and the decoy ───────────────────────────────────────────────

  private startStrike(s: Strike): void {
    const p = this.player
    const u = this.garrison.units[s.id]!
    const away = Math.hypot(p.x - u.x, p.z - u.z) || 1
    // End a blade's length from the target, on the side the mech came from.
    const tx = u.x + ((p.x - u.x) / away) * 0.85
    const tz = u.z + ((p.z - u.z) / away) * 0.85
    this.strike = {
      id: s.id, kind: s.kind, t: 0, dur: s.kind === 'drop' ? 0.5 : 0.34,
      fx: p.x, fy: p.y, fz: p.z, tx, ty: u.y, tz, yaw: headingTo(p.x, p.z, u.x, u.z), landed: false
    }
    p.vx = 0
    p.vz = 0
    p.speed01 = 0
    this.offer = null
    emit('strike', { kind: s.kind, id: s.id })
  }

  private stepStrike(dt: number): void {
    const s = this.strike!
    const p = this.player
    p.px = p.x
    p.py = p.y
    p.pz = p.z
    p.pyaw = p.yaw
    s.t += dt
    const k = Math.min(1, s.t / s.dur)
    // Fast out, settle in: the lunge.
    const e = 1 - (1 - k) * (1 - k)
    p.x = s.fx + (s.tx - s.fx) * e
    p.z = s.fz + (s.tz - s.fz) * e
    p.y = s.fy + (s.ty - s.fy) * (s.kind === 'drop' ? k * k : e) + (s.kind === 'drop' ? Math.sin(k * Math.PI) * 0.9 : 0)
    p.yaw += angleDelta(p.yaw, s.yaw) * Math.min(1, dt * 20)
    p.mode = s.kind === 'drop' && k < 1 ? 'air' : 'ground'
    if (!s.landed && k >= 0.62) {
      s.landed = true
      const u = this.garrison.units[s.id]!
      this.killBy = 'blade'
      this.killHead = false
      this.fx.slash(p.x, p.y, p.z, s.yaw)
      killUnit(this.garrison, s.id, p.x, p.z)
      // A knife in the back drops him forward, away from the mech.
      if (s.kind !== 'strike') u.fallDir = 1
      this.stats.bladeKills++
      haptic('blade')
      this.shake = Math.max(this.shake, s.kind === 'drop' ? 0.6 : 0.3)
      this.flushGarrison()
    }
    if (k >= 1 && s.t >= s.dur + 0.12) {
      p.y = s.ty
      p.vy = 0
      p.airFrom = p.y
      p.mode = 'ground'
      if (s.kind === 'drop') emit('land', { drop: s.fy - s.ty })
      this.strike = null
    }
  }

  private throwDecoy(): void {
    if (this.decoysLeft <= 0 || this.player.mode !== 'ground') return
    const p = this.player
    // Thrown ahead; with a wall in the face, dropped at the mech's feet.
    const spot = decoySpot(this.fortress.grid, p.x, p.y, p.z, this.cam.yaw) ?? { x: p.x, y: p.y, z: p.z }
    this.decoysLeft--
    // It faces back at the mech: a mech-shaped light looking at the guards
    // who come round the corner after it.
    this.decoys.push({ ...spot, yaw: this.cam.yaw + Math.PI, t: 0, pulse: 0 })
    this.fx.decoyPop(spot.x, spot.y, spot.z)
    haptic('tap')
    emit('decoy', { x: spot.x, y: spot.y, z: spot.z })
    mirror('decoys', this.decoysLeft)
  }

  // ─── The garrison ──────────────────────────────────────────────────────────

  /** The defenders' turn: what they see of the mech, and what they do about it. */
  private stepGarrison(dt: number): void {
    const p = this.player
    const t = this.target
    t.x = p.x
    t.y = p.y
    t.z = p.z
    t.height = MECH_HEIGHT + (MECH_HEIGHT_CROUCH - MECH_HEIGHT) * p.crouch
    t.crouched = p.crouched
    stepGarrison(this.garrison, this.fortress.grid, t, dt)
    this.flushGarrison()
  }

  /** Turn what the garrison did into effects, bus events and HUD state. */
  private flushGarrison(): void {
    const gar = this.garrison
    for (const e of drainEvents(gar)) {
      if (e.type === 'chaos') {
        this.stats.loud = true
        haptic('alarm')
        emit('chaos', {})
      } else if (e.type === 'calm') {
        emit('calm', { id: e.id })
      } else if (e.type === 'body') {
        this.stats.bodiesFound++
        emit('body', { id: e.id, corpse: e.corpse })
      } else if (e.type === 'kill') {
        const u = gar.units[e.id]!
        this.stats.kills++
        this.fx.kill(u.x, u.y, u.z, u.kind)
        emit('kill', {
          id: e.id, kind: u.kind, by: this.killBy, head: this.killHead,
          dist: Math.hypot(u.x - this.player.x, u.z - this.player.z)
        })
      } else {
        if (e.type === 'spotted') this.stats.spotted++
        emit(e.type, { id: e.id, kind: gar.units[e.id]!.kind })
      }
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

  /** Take a defender out directly (the test probe's hand). */
  kill(id: number): void {
    this.killBy = 'blade'
    this.killHead = false
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

  // ─── The frame ─────────────────────────────────────────────────────────────

  /** Put the mech, its shadow and the camera where they are this frame. */
  private place(alpha: number, dt: number): void {
    const p = this.player
    const i = this.input
    const g = this.fortress.grid
    const a = this.arsenal
    const x = p.px + (p.x - p.px) * alpha
    const y = p.py + (p.y - p.py) * alpha
    const z = p.pz + (p.z - p.pz) * alpha
    const yaw = p.pyaw + angleDelta(p.pyaw, p.yaw) * alpha
    const playing = hud.phase === 'play'
    const aiming = playing && this.weaponUp()

    // The look: applied here, at the display's rate, and consumed here.
    lookCam(this.cam, i.lookDX, i.lookDY, i.turn, dt, this.sensitivity, this.camera.fov, this.baseFov)
    i.lookDX = 0
    i.lookDY = 0
    stepCam(this.cam, aiming, dt)
    // The scope breathes, and a shot kicks the picture.
    const sway = this.swayNow()
    const kick = a.recoil * (a.current === 'sniper' ? 0.02 : a.current === 'rocket' ? 0.03 : 0.004)
    const jx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.03 : 0
    const jy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.03 : 0
    this.cam.yaw += sway.yaw + jx
    this.cam.pitch += sway.pitch + kick + jy
    const view = placeCam(this.cam, g, x, y, z, eyeHeight(p), a.current, this.baseFov, SCOPE_FOV, dt)
    this.cam.yaw -= sway.yaw + jx
    this.cam.pitch -= sway.pitch + kick + jy

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
    const striking = this.strike
    this.bladeOut += (((striking || this.offer) ? 1 : 0) - this.bladeOut) * Math.min(1, dt * 14)
    const s = this.pose
    s.time = this.time
    s.stride = p.stride
    s.speed = p.mode === 'ground' ? p.speed01 : 0
    s.crouch = p.crouch
    s.aim = striking ? 0 : this.cam.aim
    s.aimPitch = this.cam.pitch
    s.weapon = a.current
    s.recoil = a.recoil
    s.spin = a.spin
    s.blade = this.bladeOut
    s.stab = striking ? Math.min(1, (striking.t / striking.dur) * 0.9 + 0.05) : 0
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

    // The mark on whoever the blade can reach.
    const offer = playing && !striking ? this.offer : null
    this.strikeMark.visible = !!offer
    if (offer) {
      const u = this.garrison.units[offer.id]!
      const pulse = 1 + Math.sin(this.time * 9) * 0.12
      const d = Math.hypot(view.x - u.x, view.y - u.y, view.z - u.z)
      const size = Math.max(0.9, d * 0.09) * pulse
      this.strikeMark.position.set(u.x, u.y + SPECS[u.kind].height * 0.62, u.z)
      this.strikeMark.scale.set(size, size, 1)
    }

    this.garrisonView.update(alpha, dt, this.time, view.x, view.y, view.z)
    this.fx.update(dt, alpha, this.rockets, this.decoys, this.viewH, this.camera.fov)
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
    this.fx.dispose()
    this.strikeMark.material.dispose()
    this.rig.mesh.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
  }
}
