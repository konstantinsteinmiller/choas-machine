import {
  PerspectiveCamera, Sprite, SpriteMaterial, AdditiveBlending, Vector3, Mesh, ConeGeometry, CylinderGeometry, MeshBasicMaterial, DoubleSide
} from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { app, newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { consumeEdges, type Input } from '../engine/input'
import { input as sharedInput, inputClock } from '../engine/inputState'
import { emit, on } from '../bus'
import { gun, hud, mirror, runHudTickers, setPhase, threats, vital, waypoint, MAX_THREATS } from '../state/hud'
import { CELL, VOID, heightAt , raycast } from '../world/grid'
import type { Fortress } from '../world/fortress'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildDecor, type DecorMesh } from '../world/decor'
import { buildSky, type Sky } from '../world/sky'
import { ringTexture } from '../world/textures'
import { FloorMarkers, makeBlobShadow } from '../fx/markers'
import { CombatFx } from '../fx/combatFx'
import type { Rig } from '../models/kit'
import { buildMech, poseMech, restPose, MECH_HEIGHT, MECH_HEIGHT_CROUCH, type MechPose , MECH_KNEEL_S, MECH_DOWN_S } from '../models/mech'
import { PAL } from '../models/palette'
import { WEAPON_IDS, type WeaponId } from '../data/ids'
import { haptic } from '@/use/useHaptics'
import { lookSensitivity } from '@/use/useLookSensitivity'
import { makePlayer, stepPlayer, eyeHeight, angleDelta, type Player } from './player'
import { makeCam, lookCam, stepCam, placeCam, stickToWorld, camForward, type Cam } from './camera'
import { alertSegments } from './alert'
import {
  SPECS, drainEvents, headingTo, killUnit, damageUnit, makeGarrison, noiseAt, hearAt, wonderAt, voidNoise, stepGarrison, alarmUnit, isLight,
  type Garrison, type Target
} from './garrison'
import { GarrisonView } from './garrisonView'
import {
  GRAPPLE_EARSHOT, cancelGrapple, canCancel, findGrapple, hookAt, startGrapple, stepGrapple, type GrappleRun, type GrappleSpot
} from './grapple'
import { sfx } from '../audio/sfx'
import { TAKEDOWN, TD_END, TD_HOLD, TD_IN, TD_PULL, takedownCam, takedownPose } from './takedown'
import { castShot, makeShotHit, HEAD_Y } from './hitscan'
import { blast, shotDamage } from './damage'
import { SPREAD, ammoOf, makeArsenal, stepArsenal, type Arsenal, type Trigger } from './weapons'
import { DECOYS_PER_MISSION, decoySpot, findStrike, stepDecoys, type Decoy, type Strike, type StrikeKind } from './melee'
import { fireRocket, stepRockets, type Rocket } from './rockets'
import { stepFire } from './chaos'
import { hurtArmor, makeArmor, stepArmor, type Armor } from './armor'
import { flow, finishMission, failMission } from '../flow'
import { BASE_LOADOUT, type Loadout } from '../data/upgrades'
import { makeKillCamState, wantsKillCam, type KillInfo } from './killcam'
import {
  DROP_LANDED, blendPose, bulletAt, bulletCam, bulletFlightS, dropHeight, introCam, liftHeight, makeCinePose, orbitCam, outroCam,
  type CinePose
} from './cine'
import { buildDropship, type Dropship } from '../models/dropship'
import { killCamsEnabled } from '@/use/useKillCam'
import { markSeen, profile, saveProfile } from '../state/profile'
import { HINTS, coachHelp, coachUse, makeCoach, stepCoach, type Coach, type CoachContext, type HintId } from './coach'

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

const UP = new Vector3(0, 1, 0)

/** How far a round flies. */
const SHOT_RANGE = 260
/** The scope's sway, radians: standing, and steadied in a crouch. */
const SWAY = 0.0022
const SWAY_CROUCH = 0.0008

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
  /** The choreographed takedown (`sim/takedown.ts`), not the quick lunge. */
  full: boolean
  /** The takedown's beats that have already fired. */
  drawn: boolean
  pulled: boolean
}

/** The scripted shot that is running, if one is. Timed in REAL seconds. */
type Cine =
  /** The drop-in. */
  | { kind: 'intro'; t: number; dur: number; landed: boolean }
  /** The takedown's own camera: it runs as long as the strike does. */
  | { kind: 'stab'; t: number; dur: number }
  /** The extraction. */
  | { kind: 'outro'; t: number; dur: number }
  /** The sniper's round in flight, then a moment on what it did. */
  | {
    kind: 'bullet'; t: number; dur: number; hit: boolean
    ox: number; oy: number; oz: number; hx: number; hy: number; hz: number
    nx: number; ny: number; nz: number
    id: number; damage: number; head: boolean; final: boolean; yaw: number
  }
  /** A slow turn round a kill made some other way. */
  | { kind: 'orbit'; t: number; dur: number; id: number; yaw: number; final: boolean }
  /** No camera move: time just dips for a beat. */
  | { kind: 'dip'; t: number; dur: number }

/** How slow the world runs while a kill-cam holds on its kill. */
const KILLCAM_SLOW = 0.16
/** How near the pad the mech must be for the line to take it. */
const EXTRACT_RADIUS = 1.9
/** How far running feet are heard, in metres. */
export const SPRINT_EARSHOT = 9

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
  readonly arsenal: Arsenal
  readonly armor: Armor
  readonly decoys: Decoy[] = []
  readonly rockets: Rocket[] = []
  readonly stats: MissionStats = { time: 0, shots: 0, hits: 0, headshots: 0, kills: 0, bladeKills: 0, spotted: 0, bodiesFound: 0, loud: false }
  decoysLeft = DECOYS_PER_MISSION
  /** The threat level this mission is played at, 1 … 5. */
  readonly level: number
  /** What the mech is fitted with (the Armory, the Chassis Bay, the Forge). */
  readonly loadout: Loadout
  /** DEV: is a strike or a cutscene moving the mech right now (`game/preview.ts`)? */
  get busy(): boolean { return !!this.strike || !!this.cine || !!this.grapple }
  /** DEV: the next kill gets the kill-cam (`game/preview.ts`). */
  forceKillcam = false
  /** The strike on offer right now. */
  offer: Strike | null = null
  private strike: StrikeRun | null = null
  private garrisonView!: GarrisonView
  private fx!: CombatFx
  private markers = new FloorMarkers()
  /** Seconds since the mech went down. */
  private downT = 0
  private tdPose = { grab: 0, draw: 0, plunge: 0, blade: 0 }
  /** What the mission wants next. */
  objective: 'target' | 'extract' | 'done' = 'target'
  private cine: Cine | null = null
  private cinePose = makeCinePose()
  private followPose = makeCinePose()
  private killcam = makeKillCamState()
  private ship!: Dropship
  private beacon!: Mesh
  private line!: Mesh
  /** The grappling hook's line and its head. */
  private rope!: Mesh
  private hook!: Mesh
  /** The wall the hook could take from here, and the throw in progress. */
  private hookSpot: GrappleSpot | null = null
  private grapple: GrappleRun | null = null
  private hookPos = { x: 0, y: 0, z: 0 }
  private ropeDir = new Vector3()
  /** How far above its feet the mech is drawn (the drop, the lift). */
  private lift = 0
  /** Seconds until the Goliath answers the Commander's death; < 0 when not armed. */
  private finaleT = -1
  /** The control lessons. */
  private coach: Coach = makeCoach('desk')
  private coachCtx: CoachContext = {
    playing: false, walked: 0, turned: 0, enemies: true, aiming: false, chaos: false, threat: 0, guardNear: false,
    strike: false, nearLadder: false, nearCable: false, decoys: 0
  }
  private lastYaw = 0
  private lastPitch = 0
  private wasAiming = false
  private lastStep = 0
  private offHelp: (() => void) | null = null
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
  private proj = new Vector3()

  private constructor(readonly fortress: Fortress, private input: Input, level: number, loadout: Loadout) {
    const g = fortress.grid
    const { x, z, facing } = fortress.insert
    this.level = level
    this.loadout = loadout
    this.arsenal = makeArsenal(loadout.rockets, loadout.heatSeconds, loadout.coolRate)
    this.armor = makeArmor(loadout.armor)
    this.player = makePlayer(x, heightAt(g, x, z), z, facing)
    this.player.speedMul = loadout.speed
    this.cam = makeCam(facing)
    this.garrison = makeGarrison(fortress, level)
    this.garrison.lures = this.decoys
    this.markers.floorY = (mx, mz) => heightAt(g, mx, mz)
    this.target = { x, y: this.player.y, z, height: MECH_HEIGHT, crouched: false, visible: true }
    this.centre.set((g.w * CELL) / 2, 0, (g.d * CELL) / 2)
  }

  static async create(
    fortress: Fortress, input: Input = sharedInput, slice: Slice = noSlice, onProgress: (p01: number) => void = () => {},
    level = 1, loadout: Loadout = BASE_LOADOUT
  ): Promise<Mission> {
    const m = new Mission(fortress, input, level, loadout)
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
    await slice()
    m.ship = buildDropship()
    m.ship.group.visible = false
    // The way out: a column of light on the pad, lit once the target is down.
    const column = new CylinderGeometry(1.5, 1.5, 1, 20, 1, true)
    column.translate(0, 0.5, 0)
    m.beacon = new Mesh(column, new MeshBasicMaterial({
      color: PAL.glowGreen, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    }))
    m.beacon.position.set(fortress.extract.x, heightAt(fortress.grid, fortress.extract.x, fortress.extract.z), fortress.extract.z)
    m.beacon.scale.set(1, 40, 1)
    m.beacon.visible = false
    // The grapple line: a unit rod, stretched between the ship and the mech.
    const rod = new CylinderGeometry(0.035, 0.035, 1, 6)
    rod.translate(0, 0.5, 0)
    m.line = new Mesh(rod, new MeshBasicMaterial({ color: PAL.glowCyan, toneMapped: false }))
    m.line.visible = false
    // The hook's own line (thinner, steel) and a small three-pronged head.
    m.rope = new Mesh(rod, new MeshBasicMaterial({ color: '#d8ccff', toneMapped: false }))
    m.rope.visible = false
    m.hook = new Mesh(new ConeGeometry(0.16, 0.34, 3), new MeshBasicMaterial({ color: PAL.glowCyan, toneMapped: false }))
    m.hook.visible = false
    m.scene.add(m.rope, m.hook)
    m.scene.add(
      m.mesh.group, m.decor.group, m.rig.root, m.shadow, m.garrisonView.group, m.fx.group, m.markers.root, m.strikeMark,
      m.ship.group, m.beacon, m.line
    )
    onProgress(1)
    m.place(1, 0)
    return m
  }

  enter(): void {
    mirror('device', this.input.device)
    hud.alert = 0
    hud.chaos = false
    hud.watched = false
    threats.n = 0
    vital.armor = 1
    vital.hitAge = 9
    mirror('armorLow', false)
    mirror('cine', false)
    mirror('objective', 'target')
    this.newCoach()
    this.lastYaw = this.cam.yaw
    this.lastPitch = this.cam.pitch
    this.offHelp?.()
    this.offHelp = on('help', () => coachHelp(this.coach))
    this.mirrorWeapons()
    // The drop-in: five seconds the first time, three once it has been seen.
    this.cine = { kind: 'intro', t: 0, dur: profile.seen.includes('intro') ? 3 : 5, landed: false }
    this.lift = dropHeight(0)
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

    // Any press skips a scripted shot (once it has had a moment to register).
    // (A takedown needs a later press: the one that started it is still going down.)
    if (this.cine && i.anyPressed && this.cine.t > (this.cine.kind === 'stab' ? 0.7 : 0.3)) this.skipCine()
    // The bullet in flight: the world holds its breath.
    if (this.cine?.kind === 'bullet' && !this.cine.hit) {
      consumeEdges(i)
      return
    }

    if (hud.phase === 'intro' || hud.phase === 'outro') {
      // The base goes about its night; nothing in it can see the mech yet.
      this.target.visible = false
      stepGarrison(this.garrison, this.fortress.grid, this.target, dt)
      drainEvents(this.garrison)
    } else if (hud.phase === 'play') {
      this.target.visible = !this.strike?.full
      this.stats.time += dt
      if (this.strike) {
        this.stepStrike(dt)
      } else if (this.grapple) {
        this.stepHook(dt)
      } else {
        const dir = stickToWorld(this.cam, i.moveX, i.moveY)
        const wasCrouched = p.crouched
        const events = stepPlayer(p, this.fortress.grid, {
          mx: dir.x,
          mz: dir.z,
          crouch: i.crouchQueued,
          sprint: i.sprintHeld,
          aiming: this.weaponUp(),
          aimYaw: this.cam.yaw
        }, dt)
        for (const e of events) {
          if (e.type === 'land') {
            emit('land', { drop: e.drop })
            if (e.drop > 2) { this.shake = Math.max(this.shake, 0.25); haptic('tap') }
          } else {
            emit('traverse', { kind: e.type })
            if (e.type === 'ladder') this.learn('climb')
            else if (e.type === 'cable') this.learn('cable')
          }
        }
        // A footfall each half stride.
        if (p.mode === 'ground' && p.speed01 > 0.2 && Math.floor(p.stride / Math.PI) !== this.lastStep) {
          this.lastStep = Math.floor(p.stride / Math.PI)
          emit('step', { sprint: p.sprinting })
          // Running feet carry: whoever is near turns to see what that was.
          if (p.sprinting) hearAt(this.garrison, p.x, p.z, SPRINT_EARSHOT)
        }
        if (p.crouched !== wasCrouched) {
          emit('crouch', { crouched: p.crouched })
          if (p.crouched) this.learn('crouch')
        }
        this.offer = findStrike(this.garrison, this.fortress.grid, p.x, p.y, p.z, this.cam.yaw, p.mode === 'ground')
        if (i.actQueued && this.offer) this.startStrike(this.offer)
        // A wall too high to pull up onto, straight ahead: the hook can take it.
        this.hookSpot = p.mode === 'ground' && !this.strike ? findGrapple(this.fortress.grid, p.x, p.y, p.z, p.yaw) : null
        if (i.grappleQueued && this.hookSpot && !this.strike) this.throwHook(this.hookSpot)
        if (i.decoyQueued) this.throwDecoy()
        // On the pad with the job done: the line comes down.
        if (this.objective === 'extract' && p.mode === 'ground') {
          const e = this.fortress.extract
          if (Math.hypot(p.x - e.x, p.z - e.z) < EXTRACT_RADIUS) this.startOutro()
        }
      }
      this.stepWeapons(dt)
      this.stepRockets(dt)
      if (stepDecoys(this.decoys, this.garrison, this.fortress.grid, dt) > 0) mirror('decoys', this.decoysLeft)
      if (this.finaleT >= 0 && (this.finaleT -= dt) < 0) {
        // The finale: the base goes loud and the Goliath powers up.
        this.goLoud()
        emit('finale', {})
      }
      this.stepGarrison(dt)
      stepArmor(this.armor, dt)
      this.stepCoach(dt)
      vital.armor = this.armor.hp / this.armor.max
      mirror('armorLow', vital.armor < 0.3)
    } else if (hud.phase === 'dead') {
      // A beat to see it happen, then the screen that says so.
      const was = this.downT
      this.downT += dt
      const p2 = this.player
      // Sparks as the knees go; a thud, dust and a few plates as it lands.
      if (was < 0.2 && this.downT >= 0.2) this.fx.particles.orbBurst(p2.x, p2.y + 1.0, p2.z, PAL.mechEye, 0.7)
      const landAt = MECH_KNEEL_S + 0.5
      if (was < landAt && this.downT >= landAt) {
        const fx = Math.sin(p2.yaw)
        const fz = Math.cos(p2.yaw)
        this.garrisonView.wreckage.burst({
          x: p2.x + fx * 0.6, y: p2.y + 0.3, z: p2.z + fz * 0.6, hx: 0.3, hy: 0.15, hz: 0.3,
          count: 7, size: [0.1, 0.22], colors: [PAL.mechArmor, PAL.mechArmorDeep, PAL.mechSuit, PAL.mechCore], force: 3.6, dirX: fx, dirZ: fz
        })
        this.shake = Math.max(this.shake, 0.5)
        haptic('blast')
        emit('land', { drop: 3 })
      }
      // The screen waits until it has stopped moving.
      if (this.downT > MECH_DOWN_S + 0.7 && flow.modal === '') flow.modal = 'defeat'
    }
    vital.hitAge += dt

    this.shake = Math.max(0, this.shake - dt * 2.2)
    mirror('device', i.device)
    mirror('crouched', p.crouched)
    mirror('sprinting', p.sprinting)
    mirror('aiming', this.weaponUp())
    mirror('mode', p.mode)
    mirror('strike', this.strike ? '' : this.offer?.kind ?? '')
    mirror('grapple', !this.grapple && !!this.hookSpot && hud.phase === 'play')
    mirror('grappling', !this.grapple ? '' : canCancel(this.grapple) ? 'up' : 'over')
    mirror('grappleHeard', this.grapple?.heard ?? 0)
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
    if (a.current !== was) {
      emit('weapon', { weapon: a.current })
      this.learn('weapon')
    }
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
    this.learn('fire')
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
    if (h.kind === 'unit') {
      const u = gar.units[h.unit]!
      const soft = u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
      this.stats.hits++
      const head = h.zone === 'head' && soft
      if (head) this.stats.headshots++
      this.killBy = w
      this.killHead = head
      const damage = shotDamage(w, u.kind, h.zone, this.loadout.damage[w])
      // A sniper round that is going to kill may be given the kill-cam: then
      // it has not landed yet, and the camera rides it in.
      if (w === 'sniper' && u.hp - damage <= 0) {
        const final = this.isLastTarget(u.id)
        if (this.rollKillcam({ by: 'sniper', head, final, time: this.stats.time })) {
          const dist = Math.hypot(h.x - ox, h.y - oy, h.z - oz)
          this.cine = {
            kind: 'bullet', t: 0, dur: bulletFlightS(dist), hit: false,
            ox, oy, oz, hx: h.x, hy: h.y, hz: h.z, nx: h.nx, ny: h.ny, nz: h.nz,
            id: u.id, damage, head, final, yaw: Math.atan2(ox - h.x, oz - h.z)
          }
          mirror('cine', true)
          emit('killcam', { kind: 'bullet', final })
          return
        }
      }
      this.fx.tracer(ox, oy, oz, h.x, h.y, h.z, w)
      this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, soft, w)
      emit('hit', { id: u.id, weapon: w, zone: h.zone })
      if (!damageUnit(gar, u.id, damage, ox, oz, w === 'minigun' ? 'spray' : 'shot')) alarmUnit(gar, u.id, this.player.x, this.player.z)
    } else if (h.kind === 'world') {
      this.fx.tracer(ox, oy, oz, h.x, h.y, h.z, w)
      this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, false, w)
      // A silenced round is still heard where it lands.
      if (w === 'sniper') noiseAt(gar, this.target, h.x, h.z, this.loadout.missEarshot, 'miss')
    } else {
      this.fx.tracer(ox, oy, oz, h.x, h.y, h.z, w)
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
      const res = blast(this.garrison, g, b.x, b.y, b.z, b.direct, this.loadout.blastRadius, this.loadout.damage.rocket)
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
    // From behind or from above, and with kill-cams on, it is the whole
    // takedown: the mech ends square behind the target, facing its way.
    const full = s.kind !== 'strike' && killCamsEnabled.value
    // Otherwise: a blade's length from the target, on the side the mech came from.
    const tx = full ? u.x - Math.sin(u.yaw) * TAKEDOWN.reach : u.x + ((p.x - u.x) / away) * 0.85
    const tz = full ? u.z - Math.cos(u.yaw) * TAKEDOWN.reach : u.z + ((p.z - u.z) / away) * 0.85
    this.strike = {
      id: s.id, kind: s.kind, t: 0, dur: s.kind === 'drop' ? 0.5 : full ? 0.3 : 0.34,
      fx: p.x, fy: p.y, fz: p.z, tx, ty: u.y, tz, yaw: full ? u.yaw : headingTo(p.x, p.z, u.x, u.z), landed: false,
      full, drawn: false, pulled: false
    }
    if (full) {
      // The target is the mech's from this moment: it will not turn round.
      u.gripped = true
      p.crouched = false
      this.cine = { kind: 'stab', t: 0, dur: 999 }
      mirror('cine', true)
      emit('killcam', { kind: 'stab', final: false })
    }
    p.vx = 0
    p.vz = 0
    p.speed01 = 0
    this.offer = null
    this.learn('blade')
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
    if (s.full) { this.stepTakedown(s); return }
    if (!s.landed && k >= 0.62) {
      s.landed = true
      const u = this.garrison.units[s.id]!
      this.killBy = 'blade'
      this.killHead = false
      this.fx.slash(p.x, p.y, p.z, s.yaw)
      killUnit(this.garrison, s.id, p.x, p.z, 'blade')
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

  /** The blade goes in: the kill, its effects, and the slow time that follows. */
  private landTakedown(s: StrikeRun): void {
    if (s.landed) return
    s.landed = true
    const p = this.player
    const u = this.garrison.units[s.id]!
    this.killBy = 'blade'
    this.killHead = false
    killUnit(this.garrison, s.id, p.x, p.z, 'blade')
    // It stays up on the blade until the blade is out.
    u.hold = TD_HOLD
    u.fallDir = 1
    this.stats.bladeKills++
    haptic('blade')
    this.shake = Math.max(this.shake, s.kind === 'drop' ? 0.6 : 0.4)
    this.garrisonView.flash(s.id, PAL.mechBlade, 0.45)
    // Where the tip comes out: the target's stomach, on its far side.
    this.fx.stabThrough(u.x + Math.sin(u.yaw) * 0.2, u.y + 1.05, u.z + Math.cos(u.yaw) * 0.2, u.yaw)
    emit('takedown', { beat: 'stab', id: s.id })
    this.flushGarrison()
    app.setTimeScale(TAKEDOWN.slow)
  }

  /** The takedown's beats, once the mech has closed in. */
  private stepTakedown(s: StrikeRun): void {
    const p = this.player
    const t = s.t - s.dur
    if (t < 0) return
    p.x = s.tx
    p.z = s.tz
    p.y = s.ty
    p.mode = 'ground'
    if (!s.drawn && t >= TAKEDOWN.draw * 0.45) {
      s.drawn = true
      emit('takedown', { beat: 'draw', id: s.id })
      if (s.kind === 'drop') emit('land', { drop: s.fy - s.ty })
    }
    if (t >= TD_IN) this.landTakedown(s)
    if (!s.pulled && t >= TD_PULL) {
      s.pulled = true
      app.setTimeScale(1)
      emit('takedown', { beat: 'pull', id: s.id })
    }
    if (t >= TD_END) this.endTakedown()
  }

  /** The takedown is over (or was skipped): the mech is the player's again. */
  private endTakedown(): void {
    const s = this.strike
    if (!s || !s.full) return
    this.landTakedown(s)
    const u = this.garrison.units[s.id]!
    // Skipped while the target was still on the blade: it drops now.
    if (!s.pulled) u.hold = Math.min(u.hold, u.deadT)
    const p = this.player
    p.x = s.tx
    p.z = s.tz
    p.y = s.ty
    p.vy = 0
    p.airFrom = p.y
    p.mode = 'ground'
    this.strike = null
    if (this.cine?.kind === 'stab') this.endCine()
    else app.setTimeScale(1)
  }

  // ─── The grappling hook ────────────────────────────────────────────────────

  private throwHook(spot: GrappleSpot): void {
    this.grapple = startGrapple(this.player, spot)
    this.hookSpot = null
    this.offer = null
    emit('grapple', { beat: 'throw', heard: 0 })
    haptic('tap')
  }

  private stepHook(dt: number): void {
    const r = this.grapple!
    const p = this.player
    // Asked again while it can still be taken back: the hook comes off the
    // wall, the mech drops, and whoever was wondering finds nothing to find.
    if (this.input.grappleQueued && cancelGrapple(r)) {
      voidNoise(this.garrison, r.noise)
      emit('grapple', { beat: 'recall', heard: r.heard })
    }
    for (const e of stepGrapple(r, p, dt)) {
      if (e.type === 'bite') {
        const s = r.spot
        const heard = wonderAt(this.garrison, s.edge.x, s.edge.z, GRAPPLE_EARSHOT)
        r.noise = heard.token
        r.heard = heard.heard
        this.fx.particles.sparks(s.edge.x, s.edge.y + 0.05, s.edge.z, '#fff1c9', 10, 3, 0.25)
        this.shake = Math.max(this.shake, 0.15)
        haptic('tap')
        emit('grapple', { beat: 'bite', heard: r.heard })
        sfx('hookReel')
        this.flushGarrison()
      } else if (e.type === 'top') {
        emit('grapple', { beat: 'top', heard: r.heard })
        emit('traverse', { kind: 'mantle' })
      } else if (e.type === 'landed') {
        emit('land', { drop: e.drop })
        if (e.drop > 2) { this.shake = Math.max(this.shake, 0.25); haptic('tap') }
      }
    }
    if (r.phase === 'done') this.grapple = null
  }

  private throwDecoy(): void {
    if (this.decoysLeft <= 0 || this.player.mode !== 'ground') return
    const p = this.player
    // Thrown ahead; with a wall in the face, dropped at the mech's feet.
    const spot = decoySpot(this.fortress.grid, p.x, p.y, p.z, this.cam.yaw) ?? { x: p.x, y: p.y, z: p.z }
    this.decoysLeft--
    // It faces back at the mech: a mech-shaped light looking at the guards
    // who come round the corner after it.
    this.decoys.push({ ...spot, yaw: this.cam.yaw + Math.PI, t: 0, life: this.loadout.decoySeconds, pulse: 0 })
    this.fx.decoyPop(spot.x, spot.y, spot.z)
    haptic('tap')
    this.learn('decoy')
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
    t.moving = p.mode === 'ground' ? p.speed01 : 0.6
    stepGarrison(this.garrison, this.fortress.grid, t, dt)
    stepFire(this.garrison, this.fortress.grid, t, dt)
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
        // Apart, in pieces that stay where they land.
        if (e.death === 'burst') {
          this.garrisonView.burst(e.id)
          this.shake = Math.max(this.shake, u.kind === 'goliath' ? 0.9 : 0.3)
        }
        emit('kill', {
          id: e.id, kind: u.kind, by: this.killBy, head: this.killHead,
          dist: Math.hypot(u.x - this.player.x, u.z - this.player.z)
        })
        const final = this.objective === 'target' && this.targetsLeft() === 0
        if (final) this.openExtraction()
        // The Commander is down and the tank is still asleep: not for long.
        else if (u.kind === 'commander' && gar.units.some(o => o.kind === 'goliath' && o.state === 'dormant')) this.finaleT = 2.2
        // The sniper's kill-cam was decided when the round was fired.
        if (this.killBy !== 'sniper' && !this.cine && hud.phase === 'play') {
          const info = { by: this.killBy, head: false, final, time: this.stats.time }
          if (this.rollKillcam(info)) {
            // The blade and the last kill get the camera; a burst or a blast
            // in the middle of a fight only gets the slow beat.
            if (this.killBy === 'blade' || final) {
              this.cine = { kind: 'orbit', t: 0, dur: final ? 2.4 : 1.5, id: e.id, yaw: this.cam.yaw + Math.PI * 0.75, final }
              mirror('cine', true)
              emit('killcam', { kind: 'orbit', final })
            } else {
              this.cine = { kind: 'dip', t: 0, dur: 0.75 }
              emit('killcam', { kind: 'dip', final })
            }
            app.setTimeScale(KILLCAM_SLOW)
          }
        }
      } else if (e.type === 'fire') {
        this.incoming(e.id, e.damage)
      } else if (e.type === 'telegraph') {
        this.markers.spawn(e.x, e.z, e.radius, e.dur)
        emit('telegraph', { x: e.x, z: e.z, radius: e.radius, dur: e.dur })
      } else if (e.type === 'shell') {
        const u = gar.units[e.id]!
        this.fx.muzzle(u.x + Math.sin(u.yaw + u.look) * 3.4, u.y + 2.1, u.z + Math.cos(u.yaw + u.look) * 3.4, Math.sin(u.yaw + u.look), 0.1, Math.cos(u.yaw + u.look), 'rocket')
        this.fx.explosion(e.x, e.y + 0.4, e.z, e.y)
        const d = Math.hypot(e.x - this.player.x, e.z - this.player.z)
        this.shake = Math.max(this.shake, Math.max(0.25, 1.2 - d / 30))
        haptic('blast')
        emit('blast', { x: e.x, y: e.y, z: e.z, weak: false })
        if (e.damage > 0) this.hurt(e.damage, e.x, e.z)
      } else if (e.type === 'wave') {
        emit('wave', { n: e.n })
      } else if (e.type === 'wake') {
        const u = gar.units[e.id]!
        this.fx.particles.riseRing(u.x, u.y + 0.2, u.z, PAL.glowRed, SPECS[u.kind].radius * 1.4, 20)
        emit('wake', { id: e.id, kind: u.kind })
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

  /** A round comes the mech's way: the flash, the line, and what it costs. */
  private incoming(id: number, damage: number): void {
    const u = this.garrison.units[id]!
    const p = this.player
    const spec = SPECS[u.kind]
    const ox = u.x + Math.sin(u.yaw) * (spec.radius + 0.5)
    const oy = u.y + spec.eye * 0.85
    const oz = u.z + Math.cos(u.yaw) * (spec.radius + 0.5)
    // A hit ends on the mech's chest; a miss goes past it, wide and high or low.
    let tx = p.x
    let ty = p.y + eyeHeight(p) * 0.6
    let tz = p.z
    if (damage <= 0) {
      const a = Math.random() * Math.PI * 2
      const r = 0.8 + Math.random() * 1.4
      tx += Math.cos(a) * r
      ty += (Math.random() - 0.3) * 1.6
      tz += Math.sin(a) * r
    }
    const len = Math.hypot(tx - ox, ty - oy, tz - oz) || 1
    const dx = (tx - ox) / len
    const dy = (ty - oy) / len
    const dz = (tz - oz) / len
    this.fx.muzzle(ox, oy, oz, dx, dy, dz, 'minigun')
    // A miss flies on behind the mech.
    const over = damage > 0 ? 0 : 6
    this.fx.tracer(ox, oy, oz, tx + dx * over, ty + dy * over, tz + dz * over, 'minigun')
    emit('incoming', { id, kind: u.kind, hit: damage > 0 })
    if (damage > 0) {
      this.fx.impact(tx, ty, tz, -dx, -dy, -dz, false, 'minigun')
      this.hurt(damage, u.x, u.z)
    }
  }

  /** The mech takes damage from the direction of (fromX, fromZ). */
  private hurt(amount: number, fromX: number, fromZ: number): void {
    // A takedown is the mech's moment: nothing lands on it until it is over.
    if (this.strike?.full) return
    if (hud.phase !== 'play') return
    const p = this.player
    const down = hurtArmor(this.armor, amount)
    vital.armor = this.armor.hp / this.armor.max
    vital.hitAngle = angleDelta(this.cam.yaw, headingTo(p.x, p.z, fromX, fromZ))
    vital.hitAge = 0
    this.shake = Math.max(this.shake, Math.min(0.9, 0.2 + amount / 50))
    haptic('hurt')
    emit('hurt', { amount, hp: this.armor.hp })
    if (down) {
      this.downT = 0
      this.fx.particles.orbBurst(p.x, p.y + 1.4, p.z, PAL.mechCore, 1.4)
      this.shake = 1
      this.offer = null
      this.strike = null
      setPhase('dead')
      failMission(this.stats)
      emit('defeat', {})
    }
  }

  // ─── The control lessons ───────────────────────────────────────────────────

  private family(): 'touch' | 'desk' {
    return this.input.device === 'touch' ? 'touch' : 'desk'
  }

  private newCoach(): void {
    const family = this.family()
    this.coach = makeCoach(family, profile.lessons[family])
    hud.hints = []
  }

  /** The player did a thing the coach teaches. */
  private learn(id: HintId): void {
    if (!coachUse(this.coach, id)) return
    // Retired for this input family, for good.
    profile.lessons[this.coach.family][id] = HINTS[id].goal
    saveProfile()
  }

  private stepCoach(dt: number): void {
    const p = this.player
    const gar = this.garrison
    const g = this.fortress.grid
    // A phone player who plugs a mouse in is a new pupil.
    if (this.coach.family !== this.family()) this.newCoach()
    const c = this.coachCtx
    c.playing = !this.cine && !this.strike
    c.walked = p.mode === 'ground' ? Math.hypot(p.x - p.px, p.z - p.pz) : 0
    c.turned = Math.abs(angleDelta(this.lastYaw, this.cam.yaw)) + Math.abs(this.cam.pitch - this.lastPitch)
    this.lastYaw = this.cam.yaw
    this.lastPitch = this.cam.pitch
    const aiming = this.weaponUp()
    if (aiming && !this.wasAiming) this.learn('scope')
    this.wasAiming = aiming
    c.aiming = aiming
    c.chaos = gar.alert.chaos
    c.strike = !!this.offer
    c.decoys = this.decoysLeft
    let threat = 0
    let near = false
    let enemies = false
    for (const u of gar.units) {
      if (u.state === 'dead' || u.state === 'reserve' || u.state === 'dormant') continue
      enemies = true
      if (u.detect > threat) threat = u.detect
      if (!isLight(u) && u.state === 'patrol' && Math.hypot(u.x - p.x, u.z - p.z) < 24 && Math.abs(u.y - p.y) < 3) near = true
    }
    c.enemies = enemies
    c.threat = threat
    c.guardNear = near
    // A ladder or a cable within a few steps, on the mech's own storey.
    const cx = p.x / CELL - 0.5
    const cz = p.z / CELL - 0.5
    c.nearLadder = p.mode === 'ground' && g.ladders.some(l =>
      (Math.hypot(l.cx - cx, l.cz - cz) < 1.8 && Math.abs(heightAt(g, (l.cx + 0.5) * CELL, (l.cz + 0.5) * CELL) - p.y) < 1))
    c.nearCable = p.mode === 'ground' && g.cables.some(k =>
      (Math.hypot(k.ax - cx, k.az - cz) < 1.8 && Math.abs(heightAt(g, (k.ax + 0.5) * CELL, (k.az + 0.5) * CELL) - p.y) < 1)
      || (Math.hypot(k.bx - cx, k.bz - cz) < 1.8 && Math.abs(heightAt(g, (k.bx + 0.5) * CELL, (k.bz + 0.5) * CELL) - p.y) < 1))
    const views = stepCoach(this.coach, c, dt)
    if (views) hud.hints = views
  }

  // ─── The objective and the scripted shots ──────────────────────────────────

  /** The mission's targets still standing: the Commander, the Goliath. */
  private targetsLeft(): number {
    let n = 0
    for (const u of this.garrison.units) if ((u.kind === 'commander' || u.kind === 'goliath') && u.state !== 'dead') n++
    return n
  }

  /** Would killing this unit complete the objective? */
  private isLastTarget(id: number): boolean {
    const u = this.garrison.units[id]!
    return this.objective === 'target' && (u.kind === 'commander' || u.kind === 'goliath') && this.targetsLeft() === 1
  }

  private openExtraction(): void {
    if (this.objective !== 'target') return
    this.objective = 'extract'
    this.beacon.visible = true
    mirror('objective', 'extract')
    emit('objective', { state: 'extract' })
  }

  /** Ask the director whether this kill is shown. */
  private rollKillcam(info: KillInfo): boolean {
    if (this.forceKillcam) {
      // The preview recorder's call: this one is shown, whatever the dice say.
      this.forceKillcam = false
      return wantsKillCam(this.killcam, { ...info, final: true }, 0, true)
    }
    return wantsKillCam(this.killcam, info, Math.random(), killCamsEnabled.value)
  }

  /** End the drop-in now (the preview recorder, which opens on the action). */
  endIntro(): void {
    if (this.cine?.kind === 'intro') this.skipCine()
  }

  /** DEV cheat: the job is done, the line comes down now (`game/cheats.ts`). */
  cheatExtract(): void {
    if (hud.phase !== 'play') return
    this.openExtraction()
    this.startOutro()
  }

  private startOutro(): void {
    if (hud.phase !== 'play') return
    const p = this.player
    this.strike = null
    this.offer = null
    p.vx = 0
    p.vz = 0
    p.speed01 = 0
    this.cine = { kind: 'outro', t: 0, dur: 4.4 }
    this.objective = 'done'
    this.beacon.visible = false
    mirror('objective', 'done')
    setPhase('outro')
    emit('extracting', {})
  }

  /** The kill-cam's round arrives: now it does what it was always going to. */
  private landBullet(c: Extract<Cine, { kind: 'bullet' }>): void {
    const gar = this.garrison
    const u = gar.units[c.id]!
    c.hit = true
    c.t = 0
    c.dur = c.final ? 2.0 : 1.15
    this.fx.hideBullet()
    this.fx.impact(c.hx, c.hy, c.hz, c.nx, c.ny, c.nz, true, 'sniper')
    this.garrisonView.flash(c.id, PAL.glowCyan, 0.6)
    // The plate sits on the head itself, not on the point of entry.
    if (c.head) this.fx.showXray(u.x, u.y + HEAD_Y, u.z, 1.05)
    this.shake = Math.max(this.shake, 0.5)
    haptic('blast')
    this.killBy = 'sniper'
    this.killHead = c.head
    emit('hit', { id: u.id, weapon: 'sniper', zone: c.head ? 'head' : 'body' })
    damageUnit(gar, c.id, c.damage, c.ox, c.oz)
    this.flushGarrison()
    app.setTimeScale(KILLCAM_SLOW)
  }

  private endCine(): void {
    const c = this.cine
    if (!c) return
    this.cine = null
    this.fx.hideBullet()
    app.setTimeScale(1)
    mirror('cine', false)
    if (c.kind === 'intro') {
      this.lift = 0
      this.ship.group.visible = false
      markSeen('intro')
      setPhase('play')
      emit('deployed', {})
    } else if (c.kind === 'outro') {
      this.line.visible = false
      setPhase('done')
      finishMission(this.stats)
      emit('extracted', {})
    }
  }

  /** A press during a scripted shot: cut to its end. */
  private skipCine(): void {
    const c = this.cine
    if (!c) return
    if (c.kind === 'intro') {
      if (!c.landed) { c.landed = true; emit('land', { drop: 4 }) }
    } else if (c.kind === 'bullet' && !c.hit) {
      this.landBullet(c)
    } else if (c.kind === 'stab') {
      this.endTakedown()
      return
    } else if (c.kind === 'outro') {
      // The way out is not skipped half-way: it jumps to the end of the lift.
      c.t = c.dur
      return
    }
    this.endCine()
  }

  /**
   * Run the scripted shot by `dt` REAL seconds and fill the camera for it.
   * Returns false when there is none (the follow camera is used).
   */
  private stepCine(dt: number, follow: CinePose, x: number, y: number, z: number): boolean {
    const c = this.cine
    if (!c) return false
    const out = this.cinePose
    const f = this.fortress
    // Nothing scripted plays under the loader or the veil.
    if (!flow.curtain && !flow.loading) c.t += dt
    const k = Math.min(1, c.t / c.dur)
    if (c.kind === 'intro') {
      this.lift = dropHeight(k)
      const py = heightAt(f.grid, f.insert.x, f.insert.z)
      introCam(out, k, f.insert.x, py, f.insert.z, f.insert.facing, this.centre.x, this.centre.z, follow)
      // The ship hangs over the perch, lets the mech go, and leaves.
      const leave = Math.max(0, k - DROP_LANDED)
      this.ship.group.visible = k < 0.98
      this.ship.group.position.set(
        f.insert.x - Math.sin(f.insert.facing) * leave * 50, py + 17.5 + leave * leave * 90, f.insert.z - Math.cos(f.insert.facing) * leave * 50
      )
      this.ship.group.rotation.set(-leave * 0.5, f.insert.facing, Math.sin(this.time * 1.7) * 0.03)
      if (!c.landed && k >= DROP_LANDED) {
        c.landed = true
        this.fx.rings.spawn(f.insert.x, py + 0.08, f.insert.z, 3.4, PAL.glowCyan, 0.55)
        this.fx.particles.sparks(f.insert.x, py + 0.2, f.insert.z, '#d9ccff', 16, 5, 0.2)
        this.shake = Math.max(this.shake, 0.7)
        haptic('blast')
        emit('land', { drop: 16 })
      }
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'outro') {
      this.lift = liftHeight(k)
      const py = heightAt(f.grid, f.extract.x, f.extract.z)
      outroCam(out, k, x, py, z, this.player.yaw, this.baseFov)
      // The ship comes down over the pad, drops the line, and takes the mech up.
      const down = Math.min(1, k / 0.3)
      const shipY = py + 16 + (1 - down) * (1 - down) * 40 + Math.max(0, k - 0.45) * 26
      this.ship.group.visible = true
      this.ship.group.position.set(x, shipY, z)
      this.ship.group.rotation.set(0, this.player.yaw, Math.sin(this.time * 1.7) * 0.03)
      const top = shipY + 0.7
      const bottom = py + this.lift + 2.2
      const reach = Math.min(1, Math.max(0, (k - 0.12) / 0.18))
      this.line.visible = reach > 0
      this.line.position.set(x, top - (top - bottom) * reach, z)
      this.line.scale.set(1, (top - bottom) * reach, 1)
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'bullet') {
      if (!c.hit) {
        bulletCam(out, k, c.ox, c.oy, c.oz, c.hx, c.hy, c.hz, this.baseFov)
        const b = bulletAt(k, c.ox, c.oy, c.oz, c.hx, c.hy, c.hz)
        const len = Math.hypot(c.hx - c.ox, c.hy - c.oy, c.hz - c.oz) || 1
        this.fx.showBullet(b.x, b.y, b.z, (c.hx - c.ox) / len, (c.hy - c.oy) / len, (c.hz - c.oz) / len)
        if (k >= 1) this.landBullet(c)
        return true
      }
      // On the target: a slow turn round it as it goes down.
      const u = this.garrison.units[c.id]!
      orbitCam(out, c.t, u.x, u.y + 1.2, u.z, c.yaw, 3.3, 0.5, 0.55, this.baseFov * 0.62)
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'stab') {
      const st = this.strike
      if (!st || !st.full) { this.endCine(); return false }
      const u = this.garrison.units[st.id]!
      takedownCam(out, st.t - st.dur, u.x, u.y, u.z, u.yaw, this.baseFov)
      // Never from inside a wall: pull the camera in along its own line.
      const dx = out.x - out.tx
      const dy = out.y - out.ty
      const dz = out.z - out.tz
      const len = Math.hypot(dx, dy, dz)
      const hit = raycast(this.fortress.grid, out.tx, out.ty, out.tz, dx / len, dy / len, dz / len, len + 0.3)
      if (hit.hit) {
        const k2 = Math.max(0.25, (hit.t - 0.3) / len)
        out.x = out.tx + dx * k2
        out.y = out.ty + dy * k2
        out.z = out.tz + dz * k2
      }
      // Out of the follow camera at the start, back into it at the end.
      const tt = st.t - st.dur
      const edge = Math.min(1, (st.t) / 0.22, (TD_END - tt) / 0.28)
      if (edge < 1) blendPose(out, follow, out, Math.max(0, edge))
      return true
    }
    if (c.kind === 'orbit') {
      const u = this.garrison.units[c.id]!
      orbitCam(out, c.t, u.x, u.y + 1.1, u.z, c.yaw, 4.2, 1.1, 0.7, this.baseFov * 0.7)
      // In and out of the follow camera, so the cut is a move.
      const edge = Math.min(1, c.t / 0.25, (c.dur - c.t) / 0.3)
      if (edge < 1) blendPose(out, follow, out, Math.max(0, edge))
      if (k >= 1) this.endCine()
      return true
    }
    // dip: time only.
    if (k >= 1) this.endCine()
    return false
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
    lookCam(this.cam, i.lookDX, i.lookDY, i.turn, dt, lookSensitivity.value, this.camera.fov, this.baseFov)
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
    const follow = placeCam(this.cam, g, x, y, z, eyeHeight(p), a.current, this.baseFov, this.loadout.scopeFov, dt)
    this.cam.yaw -= sway.yaw + jx
    this.cam.pitch -= sway.pitch + kick + jy

    // A scripted shot takes the camera; otherwise it follows the mech.
    const fp = this.followPose
    fp.x = follow.x; fp.y = follow.y; fp.z = follow.z
    fp.tx = follow.tx; fp.ty = follow.ty; fp.tz = follow.tz
    fp.fov = follow.fov
    const scripted = this.stepCine(dt, fp, x, y, z)
    const view = scripted ? this.cinePose : fp
    const inside = scripted ? 0 : follow.inside
    if (scripted && this.shake > 0) {
      view.x += (Math.random() - 0.5) * this.shake * 0.12
      view.y += (Math.random() - 0.5) * this.shake * 0.12
    }
    this.camera.position.set(view.x, view.y, view.z)
    this.camera.lookAt(view.tx, view.ty, view.tz)
    if (Math.abs(this.camera.fov - view.fov) > 0.01) {
      this.camera.fov = view.fov
      this.camera.updateProjectionMatrix()
    }
    mirror('scoped', inside > 0.6)

    // The body.
    this.rig.root.position.set(x, y + this.lift, z)
    this.rig.root.rotation.y = yaw
    this.rig.root.visible = inside < 0.6
    const striking = this.strike
    this.bladeOut += (((striking || this.offer) ? 1 : 0) - this.bladeOut) * Math.min(1, dt * 14)
    const s = this.pose
    s.time = this.time
    s.stride = p.stride
    s.speed = p.mode === 'ground' ? p.speed01 : 0
    // Down: it folds where it stands.
    s.crouch = this.armor.down ? Math.min(1, Math.max(p.crouch, this.downT / MECH_KNEEL_S)) : p.crouch
    s.down = this.armor.down ? Math.max(1e-3, this.downT) : 0
    s.sprint = p.mode === 'ground' ? p.sprint : 0
    s.aim = striking || this.armor.down ? 0 : this.cam.aim
    s.aimPitch = this.cam.pitch
    s.weapon = a.current
    s.recoil = a.recoil
    s.spin = a.spin
    s.blade = this.bladeOut
    if (striking?.full) {
      const td = takedownPose(striking.t - striking.dur, this.tdPose)
      s.stab = 0
      s.grab = td.grab
      s.draw = td.draw
      s.plunge = td.plunge
      // Hidden until it springs: that is the moment.
      s.blade = td.blade
      s.crouch = 0
    } else {
      s.stab = striking ? Math.min(1, (striking.t / striking.dur) * 0.9 + 0.05) : 0
      s.grab = s.draw = s.plunge = 0
    }
    s.climb = p.mode === 'ladder' || p.mode === 'mantle' ? 1 : 0
    s.climbPhase = p.climbPhase
    s.cable = p.mode === 'cable' ? 1 : 0
    s.air = p.mode === 'air' || this.lift > 0.05 ? 1 : 0
    poseMech(this.rig, s)

    // The hook's line: from the mech's raised hand to the hook.
    const gr = this.grapple
    const lineOn = !!gr && gr.hook > 0.01 && gr.phase !== 'over'
    this.rope.visible = lineOn
    this.hook.visible = lineOn
    if (gr && lineOn) {
      const h = hookAt(gr, this.hookPos)
      const hx = x + Math.sin(yaw) * 0.25
      const hy = y + this.lift + 2.05
      const hz = z + Math.cos(yaw) * 0.25
      const dx = h.x - hx
      const dy = h.y - hy
      const dz = h.z - hz
      const len = Math.max(0.05, Math.hypot(dx, dy, dz))
      this.rope.position.set(hx, hy, hz)
      this.rope.scale.set(0.6, len, 0.6)
      this.rope.quaternion.setFromUnitVectors(UP, this.ropeDir.set(dx / len, dy / len, dz / len))
      this.hook.position.set(h.x, h.y, h.z)
      this.hook.rotation.y = yaw
    }

    // A soft shadow on whatever is under the mech, fading with its height.
    const floor = heightAt(g, x, z)
    this.shadow.position.set(x, floor + 0.03, z)
    this.shadow.visible = floor > -100
    const lift = Math.max(0, y + this.lift - floor)
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

    // The beacon breathes.
    if (this.beacon.visible) (this.beacon.material as MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(this.time * 3)
    this.garrisonView.update(alpha, dt, this.time, view.x, view.y, view.z)
    this.markers.update(dt, this.time)
    this.fx.update(dt, alpha, this.rockets, this.decoys, this.viewH, this.camera.fov)
    this.writeThreats(x, z)
    this.writeWaypoint(x, z, playing && !scripted)
  }

  /** Where the objective is on screen, for the HUD's marker. */
  private writeWaypoint(x: number, z: number, show: boolean): void {
    let wx = 0
    let wy = 0
    let wz = 0
    let has = false
    if (this.objective === 'extract') {
      const e = this.fortress.extract
      wx = e.x
      wy = heightAt(this.fortress.grid, e.x, e.z) + 1.2
      wz = e.z
      has = true
    } else if (this.objective === 'target') {
      // The nearest target still standing.
      let best = Infinity
      for (const u of this.garrison.units) {
        if ((u.kind !== 'commander' && u.kind !== 'goliath') || u.state === 'dead') continue
        const d = Math.hypot(u.x - x, u.z - z)
        if (d < best) { best = d; wx = u.x; wy = u.y + SPECS[u.kind].height + 0.9; wz = u.z; has = true }
      }
    }
    waypoint.on = show && has && !hud.scoped
    if (!waypoint.on) return
    const p = this.proj.set(wx, wy, wz)
    // In front of the camera or behind it, before the projection folds that away.
    this.camera.updateMatrixWorld()
    const behind = p.clone().applyMatrix4(this.camera.matrixWorldInverse).z > 0
    p.project(this.camera)
    waypoint.x = p.x * 0.5 + 0.5
    waypoint.y = -p.y * 0.5 + 0.5
    waypoint.behind = behind
    waypoint.dist = Math.hypot(wx - x, wz - z)
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
    this.offHelp?.()
    hud.hints = []
    app.setTimeScale(1)
    this.ship.dispose()
    this.beacon.geometry.dispose()
    ;(this.beacon.material as MeshBasicMaterial).dispose()
    this.hook.geometry.dispose()
    ;(this.hook.material as MeshBasicMaterial).dispose()
    ;(this.rope.material as MeshBasicMaterial).dispose()
    this.line.geometry.dispose()
    ;(this.line.material as MeshBasicMaterial).dispose()
    this.rig.mesh.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
  }
}
