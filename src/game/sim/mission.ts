import {
  PerspectiveCamera, Sprite, SpriteMaterial, AdditiveBlending, Vector3, Mesh, ConeGeometry, CylinderGeometry, MeshBasicMaterial, DoubleSide, Group
} from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { app, newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { consumeEdges, type Input } from '../engine/input'
import { input as sharedInput, inputClock } from '../engine/inputState'
import { emit, on } from '../bus'
import { gun, hud, mirror, runHudTickers, setPhase, threats, vital, waypoint, MAX_THREATS, callouts, MAX_CALLOUTS, prompt, bars, MAX_BARS, uplinks, MAX_UPLINKS, type PromptKind } from '../state/hud'
import { CELL, VOID, ceilingAt, heightAt, raycast, hasLineOfSight, toCell, inGrid, cellKind, cellHeight, CellKind, shadeAt, Shade } from '../world/grid'
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
import { lookSensitivity, scopeSensitivity } from '@/use/useLookSensitivity'
import { makePlayer, stepPlayer, eyeHeight, angleDelta, type Player } from './player'
import { makeCam, lookCam, stepCam, placeCam, stickToWorld, camForward, type Cam } from './camera'
import { alertSegments } from './alert'
import {
  SPECS, SUSPECT_AT, sabotageBeacon, searchForShooter, noteChange, tagUnit, cutRig, helmetPops, isAlive, stepFallen, estimateShot, shotPassed, IMPACT_M, UPLINK_S, drainEvents, headingTo, killUnit, damageUnit, makeGarrison, noiseAt, hearAt, wonderAt, voidNoise, stepGarrison, alarmUnit, startleUnit, isLight,
  type Garrison, type Target, type Unit, type Change
} from './garrison'
import { GarrisonView } from './garrisonView'
import { SALVAGE_EARSHOT, SALVAGE_S, makePiles, nearestPile, pileInReach, salvageNeed, type Pile } from './salvage'
import { SalvageView } from '../world/salvageView'
import {
  GRAPPLE_EARSHOT, cancelGrapple, canCancel, findGrapple, findGrappleAimed, hookAt, startGrapple, stepGrapple, type GrappleRun, type GrappleSpot
} from './grapple'
import { sfx } from '../audio/sfx'
import { TAKEDOWN, TD_END, TD_HOLD, TD_IN, TD_PULL, takedownCam, takedownPose } from './takedown'
import { castShot, makeShotHit, HEAD_Y } from './hitscan'
import { blast, shotDamage } from './damage'
import { SNIPER_MAG, SPREAD, ammoOf, isDry, makeArsenal, reloadProgress, reserveOf, stepArsenal, type Arsenal, type Trigger } from './weapons'
import { decoySpot, findStrike, stepDecoys, type Decoy, type Strike, type StrikeKind } from './melee'
import { fireRocket, stepRockets, type Rocket } from './rockets'
import { blastRagdoll, nearRay, push, wake as wakeRagdoll } from './ragdoll'
import { MARKSMAN_AIM_S, stepFire } from './chaos'
import { hurtArmor, makeArmor, stepArmor, type Armor } from './armor'
import { flow, finishMission, failMission, finishTraining } from '../flow'
import { TrainingDirector } from './trainingDirector'
import { roomAt } from './training'
import { TRAINING_ID, TRAINING_ROOMS } from '../data/fortresses/training'
import { COVER_H } from '../world/fortress'
import { BASE_LOADOUT, type Loadout } from '../data/upgrades'
import { camKind, camZone, chooseKillCam, makeKillCamState, type CamCut, type KillInfo } from './killcam'
import {
  DROP_LANDED, blendPose, bulletAt, bulletCam, bulletFlightS, dropHeight, introCam, liftHeight, makeCinePose, orbitCam, outroCam,
  type CinePose
} from './cine'
import { buildRobodog, poseRobodog, restDogPose, type DogPose } from '../models/robodog'
import { buildDisguise, disposeDisguise, morphDisguise } from '../models/disguises'
import { supplyUnderfoot, take, wants, type Supply } from './supplies'
import { findRopeShot, type RopeShot } from './ropes'
import { makeFlameMaterial, setFlame } from '../fx/flameCone'
import { themeOf } from '../data/themes'
import { BARREL_EARSHOT, BARREL_POWER, BARREL_RADIUS, barrelAt, barrelHurt, ignite, stepBarrels, type Barrel } from './barrels'
import { SupplyView } from '../fx/supplyView'
import { buildBeacon, disposeBeacon, poseBeacon, BEACON_TOP, type BeaconView } from '../models/beacon'
import { findApproach, introFrame, makeDogFrame, makeRiderFrame, outroFrame, RIDER_JUMP } from './robodog'
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
/** The flamethrower (#99): how near the body must be, and how long a burn takes. */
const BURN_REACH = 2.4
const BURN_S = 2
/** A jump is heard this near (#95). */
const JUMP_EARSHOT = 6
/** The silenced rifle is heard this near its muzzle (#68). */
const RIFLE_EARSHOT_M = 4
/** From the shoulder point `aimLine` traces from out to each weapon's muzzle (m). */
const MUZZLE_REACH: Readonly<Record<WeaponId, number>> = { sniper: 1.75, minigun: 1.45, rocket: 1.3 }
/**
 * Where each weapon's nose is on its bone (the bone's local frame: the barrel
 * runs down −y). The round's flash, trail and rocket leave from here, once
 * the weapon is up and pointing where the mech looks.
 */
const MUZZLE_TIP: Readonly<Record<WeaponId, readonly [string, number, number, number]>> = {
  sniper: ['sniper', 0, -1.42, 0.02], minigun: ['minigunBarrels', 0, -0.66, 0], rocket: ['rocket', 0, -0.95, 0.06]
}
/** How long the mech takes to fold into its disguise, or out of it (#111). */
const MORPH_S = 0.8
/** The weapon is ready when the body faces the aim this closely, and the aim pose is this far up. */
const READY_YAW = 0.16
const READY_AIM = 0.8
/** A press waits this long for the mech to turn and bring the weapon up, then lapses. */
const FIRE_INTENT_S = 0.8
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
  | { kind: 'intro'; t: number; dur: number; landed: boolean; jumped: boolean }
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
  | { kind: 'orbit'; t: number; dur: number; id: number; yaw: number; final: boolean; boss?: boolean }
  /** No camera move: time just dips for a beat. */
  | { kind: 'dip'; t: number; dur: number }

/** How long a shouted line stays over a defender's head. */
const CALLOUT_S = 2.4
/** How slow the world runs while a kill-cam holds on its kill. */
const KILLCAM_SLOW = 0.16
/** Health bars (#74): within this, a defender shows one when near, hurt, tagged or fighting; this near, always. */
const BAR_FAR_M = 40
const BAR_NEAR_M = 25
/** Kill-cam seconds the round is still seen flying on out of the target (#77). */
const EXIT_S = 0.3
/** A short bullet cam joins the round this far into its flight; a boss's orbit lasts this long. */
const SHORT_FROM = 0.55
const BOSS_ORBIT_S = 3.6
/** The profile's mark: the first headshot cam of a life has been shown. */
const FIRST_HEADSHOT_CAM = 'firstHeadshotCam'
/** How near the pad the mech must be for the line to take it. */
const EXTRACT_RADIUS = 1.9
/** How far running feet are heard, in metres. */
export const SPRINT_EARSHOT = 9
/** The scope's zoom notches: the loadout's field of view divided by these. */
export const SCOPE_ZOOMS = [1, 1.7, 2.6] as const
/** A rifle kill this near the insertion point counts as one from the perch. */
const PERCH_M = 7
/** The bosses: how far a generator or a servo is reached; a jammed Foreman's joints and an overheated Goliath's vents take this much more; the glint's flash. */
const RIG_REACH = 2.6
const JAMMED_JOINTS = 1.5
const OPEN_VENTS = 2
const GLINT_FLASH_S = 0.7
/** Seconds the scope must rest on a unit to tag it. */
const TAG_S = 2
/** How near a body must be to grab it, and how far behind the mech it drags. */
const DRAG_REACH = 2.2
const DRAG_BEHIND = 1.5
/** Dragging a body: the mech walks at this share of its pace. */
export const DRAG_SLOW = 0.5
/** How far the shoot lesson looks for a defender in clear sight. */
const MARK_M = 60
/** A mini-gun kill on a person takes it apart this often (#64). */
const MINIGUN_APART = 0.18
/** A guard's ammo pouch lies where it fell (#76); at most this many lie about at once. */
const MAX_POUCHES = 24
/** How near a beacon the mech must be to sabotage it, and how long it takes. */
const SABOTAGE_REACH = 1.9
const SABOTAGE_S = 1.4

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
  /** Salvage carried out, and piles stripped. */
  salvage: number
  piles: number
  /** The Commander (and his tank, where there is one) went down. */
  bossDown: boolean
  /** Habits the base remembers (R26). */
  boxUses: number
  perchKills: number
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
  readonly stats: MissionStats = { time: 0, shots: 0, hits: 0, headshots: 0, kills: 0, bladeKills: 0, spotted: 0, bodiesFound: 0, loud: false, salvage: 0, piles: 0, bossDown: false, boxUses: 0, perchKills: 0 }
  /** Seconds until the next decoy is ready (#114: no count, a cooldown). */
  decoyCool = 0
  /** The threat level this mission is played at, 1 … 5. */
  readonly level: number
  /** What the mech is fitted with (the Armory, the Chassis Bay, the Forge). */
  readonly loadout: Loadout
  /** DEV: is a strike or a cutscene moving the mech right now (`game/preview.ts`)? */
  get busy(): boolean { return !!this.strike || !!this.cine || !!this.grapple || !!this.looting || !!this.sabotaging || !!this.burning }
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
  objective: 'salvage' | 'extract' | 'done' = 'salvage'
  private cine: Cine | null = null
  private cinePose = makeCinePose()
  private followPose = makeCinePose()
  private killcam = makeKillCamState()
  /** The alarm beacons, drawn; the one within reach to sabotage, and the sabotage under way. */
  private beaconViews: BeaconView[] = []
  private beaconOffer = -1
  private sabotaging: { beacon: number; t: number; rig?: number } | null = null
  /** A generator or a servo within reach, unseen (−1 none). */
  private rigOffer = -1
  /** The hide box, and whether the mech was under it last step. */
  private hideBox!: Group
  private wasBoxed = false
  /** The ride in and out: the robo dog, which folds into a jet board. */
  private dog!: Rig
  private dogPose: DogPose = restDogPose()
  private dogAt = makeDogFrame()
  private riderAt = makeRiderFrame()
  /** The mech's place relative to its own while it rides. */
  private rideX = 0
  private rideZ = 0
  private riding = false
  private beacon!: Mesh
  /** The grappling hook's line and its head. */
  private rope!: Mesh
  private hook!: Mesh
  /** The wall the hook could take from here, and the throw in progress. */
  private hookSpot: GrappleSpot | null = null
  /** A wall top under the mech's look the hook could take (#102), and where a rope would go (#94). */
  private hookAim: GrappleSpot | null = null
  private ropeAim: RopeShot | null = null
  private ropesLeft = 0
  /** The ropes the mech has shot this raid, drawn. */
  private ropeMeshes: Mesh[] = []
  private grapple: GrappleRun | null = null
  private hookPos = { x: 0, y: 0, z: 0 }
  /** The raid's salvage, how much of it is needed, and the pile being stripped. */
  readonly piles: Pile[]
  readonly salvageNeed: number
  private salvageView!: SalvageView
  private lootOffer: Pile | null = null
  private wasSprinting = false
  /** Metres to the waypoint, as last drawn. */
  private waypointDist = 0
  private looting: { pile: Pile; t: number } | null = null
  /** The flamethrower (#99): the body or wreck under it, and how far through. */
  private burning: { id: number; t: number; seen: number } | null = null
  private burnOffer = -1
  private burnChange: Change | null = null
  private fuelLeft = 0
  private flame!: Mesh
  private flameMat = makeFlameMaterial({ core: '#fff4c2', mid: '#ff9a3d', edge: '#c8202f' })
  private lasers: Array<{ id: number; mesh: Mesh }> = []
  private muzzleTmp = new Vector3()
  private flyTo = new Vector3()
  /** 0 the mech … 1 folded into its disguise (#111). */
  private morph = 0
  /** The board's way in to the perch (#105). */
  private approach: { approach: number; high: number; reach: number } | null = null
  private laserGeo = new CylinderGeometry(0.035, 0.035, 1, 5)
  private laserMat = new MeshBasicMaterial({ color: '#ff2a3a', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false })
  /** What a burn leaves: ash for a person, slag for a machine. */
  private residues: Mesh[] = []
  private ashGeo = new CylinderGeometry(0.75, 0.9, 0.08, 10)
  private ashMat = new MeshBasicMaterial({ color: '#2b2438' })
  private slagMat = new MeshBasicMaterial({ color: '#8a4a2a' })
  private sparkleT = 0
  private smokeT = 0
  /** The boss whose bar is up: the last one hit. */
  private bossFocus = -1
  private ropeDir = new Vector3()
  /** How far above its feet the mech is drawn (the drop, the lift). */
  private lift = 0
  /** Seconds until the Goliath answers the Commander's death; < 0 when not armed. */
  private finaleT = -1
  /** The control lessons. */
  private coach: Coach = makeCoach('desk')
  private coachCtx: CoachContext = {
    playing: false, walked: 0, turned: 0, enemies: true, aiming: false, chaos: false, threat: 0, guardNear: false,
    strike: false, nearLadder: false, nearCable: false, decoys: 0, loot: false, hook: false, seeking: false, far: false, boxed: false, sabotage: false
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
    this.piles = makePiles(fortress.salvage)
    this.salvageNeed = salvageNeed(level, this.piles.length)
    this.arsenal = makeArsenal(loadout.rockets, loadout.heatSeconds, loadout.coolRate, loadout.rifleReserve, loadout.belt)
    this.ropesLeft = loadout.ropes
    this.fuelLeft = loadout.fuel
    this.supplies = (fortress.supplies ?? []).map(s => ({ ...s, taken: false }))
    this.barrels = (fortress.barrels ?? []).map(b => ({ ...b, live: true, fuse: -1 }))
    // Level I is gentler: half again the armour (the curve comes from more
    // defenders at the higher levels, not from rounds that hurt more).
    this.armor = makeArmor(loadout.armor * (level === 1 ? 1.5 : 1))
    this.player = makePlayer(x, heightAt(g, x, z), z, facing)
    this.player.speedMul = loadout.speed
    this.cam = makeCam(facing)
    this.garrison = makeGarrison(fortress, level)
    // The training ground's defenders are a drill: no alarm, no voices.
    if (fortress.id === TRAINING_ID) this.garrison.drill = true
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
    const look = themeOf(fortress.theme)
    m.sky = buildSky(m.scene, m.centre, look.sky, { w: fortress.grid.w * CELL, d: fortress.grid.d * CELL })
    m.mesh = await buildFortressMesh(fortress, look.mesh, slice, p => onProgress(p * 0.8))
    m.decor = buildDecor(fortress.decor)
    await slice()
    m.rig = buildMech()
    // The last known position: a ghost of the mech where it was last seen,
    // there while anybody is out looking for it.
    m.ghost = buildMech()
    // One glowing, see-through material for the whole silhouette.
    m.ghostMat = new MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    m.ghost.mesh.material = m.ghostMat
    if (m.ghost.outline) m.ghost.outline.visible = false
    m.ghost.root.visible = false
    m.scene.add(m.ghost.root)
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
    for (const b of m.garrison.beacons) {
      const v = buildBeacon()
      v.group.position.set(b.x, b.y, b.z)
      m.scene.add(v.group)
      m.beaconViews.push(v)
    }
    // What comes down over the mech when it hides: the disguise it wears (#97).
    m.hideBox = buildDisguise(profile.cosmetics.worn)
    m.scene.add(m.hideBox)
    m.supplyView = new SupplyView(m.supplies, m.barrels)
    m.scene.add(m.supplyView.group)
    m.flame = new Mesh(new CylinderGeometry(0.85, 0.08, 1, 14, 1, true), m.flameMat)
    m.flame.visible = false
    m.flame.renderOrder = 4
    m.scene.add(m.flame)
    // A marksman's laser sight (#90): a red line that draws on the mech before the round.
    for (const u of m.garrison.units) {
      if (u.role !== 'marksman') continue
      const l = new Mesh(m.laserGeo, m.laserMat)
      l.visible = false
      l.renderOrder = 5
      m.scene.add(l)
      m.lasers.push({ id: u.id, mesh: l })
    }
    m.dog = buildRobodog()
    m.dog.root.visible = false
    // The way out: a column of light on the pad, lit once the target is down.
    const column = new CylinderGeometry(1.5, 1.5, 1, 20, 1, true)
    column.translate(0, 0.5, 0)
    m.beacon = new Mesh(column, new MeshBasicMaterial({
      color: PAL.glowGreen, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false
    }))
    m.beacon.position.set(fortress.extract.x, heightAt(fortress.grid, fortress.extract.x, fortress.extract.z), fortress.extract.z)
    m.beacon.scale.set(1, 40, 1)
    m.beacon.visible = false
    // A unit rod, stretched from the mech's hand to the hook.
    const rod = new CylinderGeometry(0.035, 0.035, 1, 6)
    rod.translate(0, 0.5, 0)
    // The hook's own line (thinner, steel) and a small three-pronged head.
    m.rope = new Mesh(rod, new MeshBasicMaterial({ color: '#d8ccff', toneMapped: false }))
    m.rope.visible = false
    m.hook = new Mesh(new ConeGeometry(0.16, 0.34, 3), new MeshBasicMaterial({ color: PAL.glowCyan, toneMapped: false }))
    m.hook.visible = false
    m.scene.add(m.rope, m.hook)
    if (fortress.id === TRAINING_ID) {
      m.training = new TrainingDirector(m.scene, fortress, m.garrison)
      // The flamethrower room's guard is already down (#113): its lesson is the burning.
      const room = TRAINING_ROOMS.findIndex(r => r.lesson === 'burn')
      for (const u of m.garrison.units) {
        if (roomAt(u.homeX) !== room) continue
        killUnit(m.garrison, u.id, u.x, u.z - 1, 'blade')
        u.death = 'front'
        u.rag = null
        u.hold = 0
        u.deadT = 30
        u.thud = true
        u.found = false
      }
      drainEvents(m.garrison)
    }
    m.salvageView = new SalvageView(m.piles)
    m.scene.add(m.salvageView.group)
    m.scene.add(
      m.mesh.group, m.decor.group, m.rig.root, m.shadow, m.garrisonView.group, m.fx.group, m.markers.root, m.strikeMark,
      m.dog.root, m.beacon
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
    mirror('objective', 'salvage')
    hud.training.on = !!this.training
    hud.training.room = -1
    this.scopeZoom = 0
    mirror('zoom', 1)
    mirror('salvageGot', 0)
    mirror('salvageNeed', this.salvageNeed)
    this.newCoach()
    this.lastYaw = this.cam.yaw
    this.lastPitch = this.cam.pitch
    this.offHelp?.()
    this.offHelp = on('help', () => coachHelp(this.coach))
    this.offReplay?.()
    this.offReplay = on('trainingReplay', () => { this.training?.replay() })
    this.offZoom?.()
    this.offZoom = on('zoom', () => this.zoomStep(1, true))
    this.mirrorWeapons()
    // The drop-in: five seconds the first time, three once it has been seen.
    this.cine = { kind: 'intro', t: 0, dur: profile.seen.includes('intro') ? 3.4 : 5, landed: false, jumped: false }
    this.lift = 1.6
    // A retry skips it: straight onto the perch, or back beside the pile.
    this.quickStart = flow.quick
    flow.quick = false
    const cp = flow.resume ? flow.checkpoint : null
    flow.resume = false
    if (cp && cp.level === this.level) {
      // The piles already stripped stay stripped and count toward the job;
      // their scrap was banked when the mech went down, so it is not paid again.
      for (const id of cp.piles) {
        const q = this.piles[id]
        if (!q || q.taken) continue
        q.taken = true
        this.salvageView.take(q.id)
        this.stats.piles++
      }
      mirror('salvageGot', this.stats.piles)
      this.checkpoint = { x: cp.x, y: cp.y, z: cp.z, yaw: cp.yaw }
      this.resumeAt = this.checkpoint
    }
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
    if (this.quickStart) {
      this.quickStart = false
      if (this.cine?.kind === 'intro') this.endCine()
      const r = this.resumeAt
      if (r) {
        this.resumeAt = null
        p.x = p.px = r.x
        p.y = p.py = r.y
        p.z = p.pz = r.z
        p.yaw = p.pyaw = r.yaw
        this.cam.yaw = r.yaw
        if (this.objective === 'salvage' && this.stats.piles >= this.salvageNeed) this.openExtraction()
      }
    }

    // Any press skips a scripted shot (once it has had a moment to register).
    // (A takedown needs a later press: the one that started it is still going down.)
    // The press that skips is spent on the skip: Space must not also jump (#95).
    if (this.cine && i.anyPressed && this.cine.t > (this.cine.kind === 'stab' ? 0.7 : 0.3)) { this.skipCine(); consumeEdges(i) }
    // The bullet in flight: the world holds its breath. After it lands, and
    // through any kill-cam, nothing moves but the fallen (#91).
    if (this.cine?.kind === 'bullet' && !this.cine.hit) {
      consumeEdges(i)
      return
    }
    if (hud.phase === 'play' && this.killcamOn()) {
      stepFallen(this.garrison, this.fortress.grid, dt)
      consumeEdges(i)
      return
    }

    if (hud.phase === 'intro' || hud.phase === 'outro') {
      // The base goes about its night; nothing in it can see the mech yet.
      this.target.visible = false
      stepGarrison(this.garrison, this.fortress.grid, this.target, dt)
      drainEvents(this.garrison)
    } else if (hud.phase === 'play') {
      this.target.visible = !this.strike?.full && !this.opening
      this.stats.time += dt
      if (this.strike) {
        this.stepStrike(dt)
      } else if (this.grapple) {
        this.stepHook(dt)
      } else if (this.burning) {
        this.stepBurn(dt)
      } else if (this.looting) {
        this.stepLoot(dt)
      } else if (this.sabotaging) {
        this.stepSabotage(dt)
      } else if (this.opening && this.stepOpening(dt)) {
        // The opening has the mech (#104).
      } else {
        const dir = stickToWorld(this.cam, i.moveX, i.moveY)
        const wasCrouched = p.crouched
        const events = stepPlayer(p, this.fortress.grid, {
          mx: dir.x,
          mz: dir.z,
          crouch: i.crouchQueued,
          box: i.hideQueued,
          sprint: i.sprintHeld,
          jump: i.jumpQueued,
          aiming: this.weaponUp(),
          aimYaw: this.cam.yaw
        }, dt)
        for (const e of events) {
          if (e.type === 'jump') {
            // A hop is heard close by, like a sprinting step (#95).
            hearAt(this.garrison, p.x, p.z, JUMP_EARSHOT)
            emit('hop', {})
          }
          if (e.type === 'jump') continue
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
          if (p.sprinting) hearAt(this.garrison, p.x, p.z, this.loadout.sprintEarshot)
        }
        if (p.crouched !== wasCrouched) {
          emit('crouch', { crouched: p.crouched })
          if (p.crouched) this.learn('crouch')
        }
        this.offer = findStrike(this.garrison, this.fortress.grid, p.x, p.y, p.z, this.cam.yaw, p.mode === 'ground')
        if (i.actQueued && this.offer) this.startStrike(this.offer)
        // An alarm beacon within reach while nobody is looking: the act key
        // puts it out of action (Odyssey's trapped brazier).
        this.beaconOffer = p.mode === 'ground' && !this.offer && !this.strike ? this.beaconInReach() : -1
        if (i.actQueued && !this.offer && this.beaconOffer >= 0 && !this.strike) { this.startSabotage(this.beaconOffer); i.actQueued = false }
        // The Warden's generator, the Foreman's servo: the same act, unseen.
        this.rigOffer = p.mode === 'ground' && !this.offer && !this.strike && this.beaconOffer < 0 ? this.rigInReach() : -1
        if (i.actQueued && !this.offer && this.rigOffer >= 0 && !this.strike) { this.startSabotage(-1, this.rigOffer); i.actQueued = false }
        // A pile within reach (and no blade on offer): the same key strips it.
        this.lootOffer = p.mode === 'ground' && !this.offer && !this.strike ? pileInReach(this.piles, p.x, p.y, p.z) : null
        if (i.actQueued && !this.offer && this.lootOffer && !this.strike) this.startLoot(this.lootOffer)
        // A body (or a wreck) at the mech's feet: E burns it to ash (#99); F drags it.
        else if (i.actQueued && !this.offer && !this.strike && this.burnOffer >= 0) { this.startBurn(this.burnOffer); i.actQueued = false }
        if (i.dragQueued && !this.offer && !this.strike && (this.dragId >= 0 || this.dragOffer >= 0)) this.actDrag()
        // A wall too high to pull up onto, straight ahead: the hook can take it.
        // Under a roof the hook has no sky to fly into (#96).
        const roofed = ceilingAt(this.fortress.grid, p.x, p.z, p.y) < Infinity
        this.hookSpot = p.mode === 'ground' && !this.strike && !roofed ? findGrapple(this.fortress.grid, p.x, p.y, p.z, p.yaw, this.loadout.hookReach, this.loadout.hookMax) : null
        this.aimGear()
        // At the foot of a wall the hook goes straight up it; otherwise at the wall top the mech looks at.
        const hook = this.hookSpot ?? this.hookAim
        if (i.grappleQueued && hook && !this.strike) this.throwHook(hook)
        if (i.ropeQueued && this.ropeAim && !this.strike) this.shootRope(this.ropeAim)
        this.burnOffer = p.mode === 'ground' && !this.strike && this.fuelLeft > 0 && this.dragId < 0 ? this.burnInReach() : -1
        if (i.burnQueued && this.burnOffer >= 0) this.startBurn(this.burnOffer)
        if (i.decoyQueued) this.throwDecoy()
        // On the pad with the job done: the line comes down.
        if (this.objective === 'extract' && p.mode === 'ground') {
          const e = this.fortress.extract
          if (Math.hypot(p.x - e.x, p.z - e.z) < EXTRACT_RADIUS) this.startOutro()
        }
      }
      this.stepWeapons(dt)
      this.stepRockets(dt)
      stepDecoys(this.decoys, this.garrison, this.fortress.grid, dt)
      if (this.decoyCool > 0) this.decoyCool = Math.max(0, this.decoyCool - dt)
      mirror('decoys', this.decoyCool <= 0 ? 1 : 0)
      mirror('decoyCool', Math.ceil(this.decoyCool))
      if (this.finaleT >= 0 && (this.finaleT -= dt) < 0) {
        // The finale: the base goes loud and the Goliath powers up.
        this.goLoud()
        emit('finale', {})
      }
      this.stepGarrison(dt)
      this.stepTraining(dt)
      stepArmor(this.armor, dt)
      this.stepSupplies()
      this.stepBarrels(dt)
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
    mirror('grapple', !this.grapple && !!(this.hookSpot ?? this.hookAim) && hud.phase === 'play')
    mirror('rope', !this.grapple && !!this.ropeAim && hud.phase === 'play')
    mirror('ropes', this.ropesLeft)
    mirror('burn', !this.burning && this.burnOffer >= 0 && hud.phase === 'play')
    mirror('fuel', this.fuelLeft)
    mirror('burning', this.burning ? Math.min(1, this.burning.t / BURN_S) : 0)
    mirror('grappling', !this.grapple ? '' : canCancel(this.grapple) ? 'up' : 'over')
    mirror('grappleHeard', this.grapple?.heard ?? 0)
    mirror('loot', !this.looting && !!this.lootOffer && hud.phase === 'play')
    mirror('boxed', this.player.boxed)
    const rig = this.rigOffer >= 0 ? this.garrison.rigs[this.rigOffer]!.kind : ''
    mirror('sabotage', this.sabotaging || hud.phase !== 'play' ? '' : this.beaconOffer >= 0 ? 'beacon' : rig)
    mirror('sabotaging', this.sabotaging ? Math.min(1, this.sabotaging.t / SABOTAGE_S) : 0)
    {
      const gar = this.garrison
      const r = gar.runner >= 0 ? gar.units[gar.runner] : undefined
      const b = r && r.runner >= 0 ? gar.beacons[r.runner] : undefined
      mirror('alarm', gar.alert.chaos && gar.beacons.some(x => x.state === 'lit') ? 3 : b?.state === 'lighting' ? 2 : r ? 1 : 0)
      mirror('alarmLit', b ? b.lit : gar.alert.chaos ? 1 : 0)
    }
    const boss = this.bossFocus >= 0 ? this.garrison.units[this.bossFocus] : undefined
    if (boss && boss.boss) {
      mirror('bossKind', boss.boss)
      mirror('bossHp', Math.max(0, boss.hp) / boss.maxHp)
      mirror('bossShield', boss.shield)
    } else mirror('bossKind', '')
    mirror('looting', this.looting ? Math.min(1, this.looting.t / SALVAGE_S) : 0)
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
    // A press of the trigger brings the weapon up and turns the body to the aim first.
    return i.aimHeld || this.fireIntent > 0 || (i.fireHeld && i.device === 'mouse' && this.arsenal.current !== 'sniper')
  }

  /** A shot waiting for the weapon to come up; the time a press keeps the weapon wanted. */
  private pendingRounds = 0
  private fireIntent = 0

  /**
   * The weapon is up and on the line: the body faces where the camera looks
   * and the aim pose is (nearly) all the way up. Only then does a round leave.
   */
  private aimReady(): boolean {
    const p = this.player
    return p.mode === 'ground' && Math.abs(angleDelta(p.yaw, this.cam.yaw)) < READY_YAW && this.cam.aim >= READY_AIM
  }

  /** The weapon's nose in the world, from the posed rig (last frame's pose). */
  private muzzleAt(w: WeaponId, out: Vector3): Vector3 | null {
    const [bone, x, y, z] = MUZZLE_TIP[w]
    const b = this.rig?.bones[bone]
    if (!b) return null
    return b.localToWorld(out.set(x, y, z))
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
    // A press is an intent: the body turns and the weapon comes up, and only
    // then is the round let go (#110). The mini-gun spins up once it is on the line.
    const ready = free && this.aimReady()
    if (free && (i.firePressed || i.fireHeld || i.aimReleased)) this.fireIntent = FIRE_INTENT_S
    else this.fireIntent = Math.max(0, this.fireIntent - dt)
    if (!free) { this.pendingRounds = 0; this.fireIntent = 0 }
    t.firePressed = free && i.firePressed
    t.fireHeld = free && i.fireHeld
    t.ready = ready
    t.reload = i.reloadQueued
    t.select = i.weaponQueued ? WEAPON_IDS[i.weaponQueued - 1]! : null
    // The wheel: on the scope it zooms; off it, it changes weapon.
    if (i.wheelQueued !== 0 && hud.scoped) this.zoomStep(i.wheelQueued < 0 ? 1 : -1)
    t.cycle = i.cycleQueued || (i.wheelQueued !== 0 && !hud.scoped)
    const was = a.current
    const rounds = stepArsenal(a, t, dt)
    if (a.overheated && !this.wasHot) this.overheats++
    this.wasHot = a.overheated
    if (a.current !== was) {
      emit('weapon', { weapon: a.current })
      this.learn('weapon')
    }
    // Rounds wait for the weapon to be on the line (one at most: the rifle and the launcher fire singly).
    this.pendingRounds = Math.min(a.current === 'minigun' ? 4 : 1, this.pendingRounds + rounds)
    if (this.pendingRounds > 0 && (ready || this.aimReady())) {
      for (let k = 0; k < this.pendingRounds; k++) this.fireRound()
      this.pendingRounds = 0
    } else if (this.pendingRounds > 0 && this.fireIntent <= 0) this.pendingRounds = 0
    this.mirrorWeapons()
  }

  private mirrorWeapons(): void {
    const a = this.arsenal
    mirror('weapon', a.current)
    mirror('ammo', ammoOf(a))
    mirror('reserve', reserveOf(a))
    mirror('dry', isDry(a))
    mirror('ammoMax', a.current === 'rocket' ? this.loadout.rockets : a.current === 'sniper' ? SNIPER_MAG : 0)
    gun.reload = reloadProgress(a)
    mirror('reloading', gun.reload > 0)
    mirror('overheated', a.overheated)
    mirror('decoys', this.decoyCool <= 0 ? 1 : 0)
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
    // The barrel: at the mech's right shoulder (its right is −x when it faces +z),
    // on the body's own heading: the weapon is where the mech points it.
    const ox = p.x - Math.cos(p.yaw) * 0.42 + Math.sin(p.yaw) * 0.5
    const oy = eyeY - 0.28
    const oz = p.z + Math.sin(p.yaw) * 0.42 + Math.cos(p.yaw) * 0.5
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
    if (this.arsenal.current !== 'sniper' || this.opening) return { yaw: 0, pitch: 0 }
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
    // The flash and the trail start at the weapon's own muzzle, out along the
    // aimed arm (#81); the round itself is traced from the shoulder, so a
    // barrel poking through a wall never shoots from the far side of it.
    const reach = Math.min(MUZZLE_REACH[w], Math.max(0, castShot(g, gar.units, ox, oy, oz, dx, dy, dz, MUZZLE_REACH[w], this.hit).t - 0.2))
    let mx = ox + dx * reach
    let my = oy + dy * reach
    let mz = oz + dz * reach
    // The weapon's own nose, when nothing stands between the shoulder and it (#110).
    const nose = this.muzzleAt(w, this.muzzleTmp)
    if (nose) {
      const nl = Math.hypot(nose.x - ox, nose.y - oy, nose.z - oz)
      if (nl > 0.05 && nl < 3 && !raycast(g, ox, oy, oz, (nose.x - ox) / nl, (nose.y - oy) / nl, (nose.z - oz) / nl, nl).hit) {
        mx = nose.x
        my = nose.y
        mz = nose.z
      }
    }
    this.fx.muzzle(mx, my, mz, dx, dy, dz, w)
    haptic(w)
    emit('shot', { weapon: w })
    this.shake = Math.max(this.shake, w === 'sniper' ? 0.35 : w === 'rocket' ? 0.5 : 0.12)

    if (w === 'rocket') {
      fireRocket(this.rockets, mx, my, mz, dx, dy, dz)
      this.rocketsFired++
      this.goLoud()
      return
    }
    if (w === 'minigun') this.goLoud()

    const h = castShot(g, gar.units, ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit)
    // A rifle round is quiet, not unnoticed (#68, #70): whoever it lands near,
    // or passes close to, turns to where the base guesses it came from.
    const p0 = this.player
    const from = w === 'sniper' ? estimateShot(gar, p0.x, p0.y, p0.z, h.x, h.z) : null
    if (from) {
      const hitId = h.kind === 'unit' ? h.unit : -1
      shotPassed(gar, this.target, from, ox, oy, oz, h.x, h.y, h.z, h.kind === 'world' ? Math.max(IMPACT_M, this.loadout.missEarshot) : IMPACT_M, RIFLE_EARSHOT_M, hitId, h.kind === 'world' ? 'miss' : null)
    }
    // Minigun rounds into a body on the ground keep shoving it (#64).
    if (w === 'minigun') {
      for (const d of gar.units) {
        if (!d.rag || d.state !== 'dead' || d.hidden || d.deadT < d.hold) continue
        const j = nearRay(d.rag, ox, oy, oz, h.x, h.y, h.z, 0.5)
        if (j >= 0) push(d.rag, j, dx * 4, 1.2, dz * 4, 1 / 60)
      }
    }
    if (h.kind === 'unit') {
      const u = gar.units[h.unit]!
      const soft = u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander'
      this.stats.hits++
      const head = h.zone === 'head' && soft
      if (head) this.stats.headshots++
      this.killBy = w
      this.killHead = head
      // A helmet comes off in pieces; the round still goes through (#77).
      const zone = h.zone
      if (helmetPops(u, zone)) {
        this.fx.particles.sparks(h.x, h.y, h.z, '#d8ccff', 12, 4, 0.2)
        this.garrisonView.popHelmet(u.id, h.nx, h.nz)
        emit('helmet', { id: u.id })
      }
      const damage = shotDamage(w, u.kind, zone, this.loadout.damage[w], u.maxHp)
        * (u.jammed && h.zone === 'joint' ? JAMMED_JOINTS : 1) * (u.overheat > 0 && h.zone === 'weak' ? OPEN_VENTS : 1)
      if (u.boss) emit('bossHit', { amount: Math.round(Math.min(damage, Math.max(0, u.hp))) })
      // A sniper round that is going to kill may be given the kill-cam: then
      // it has not landed yet, and the camera rides it in.
      if (w === 'sniper' && u.hp - damage <= 0) {
        const final = this.isLastTarget(u.id)
        const cut = this.rollKillcam({
          by: 'sniper', head: zone === 'head', final, time: this.stats.time, dist: Math.hypot(u.x - this.player.x, u.z - this.player.z),
          moving: u.speed01, zone: camZone(zone), boss: !!u.boss, kind: camKind(u.kind), stealth: this.quietRaid()
        })
        if (cut === 'full' || cut === 'short') {
          const dist = Math.hypot(h.x - ox, h.y - oy, h.z - oz)
          const dur = bulletFlightS(dist)
          this.cine = {
            kind: 'bullet', t: cut === 'short' ? dur * SHORT_FROM : 0, dur, hit: false,
            ox, oy, oz, hx: h.x, hy: h.y, hz: h.z, nx: h.nx, ny: h.ny, nz: h.nz,
            id: u.id, damage, head, final, yaw: Math.atan2(ox - h.x, oz - h.z)
          }
          mirror('cine', true)
          emit('killcam', { kind: 'bullet', final })
          return
        }
        if (cut === 'boss') {
          // The boss's own orbit comes with the kill, once it has landed.
          this.bossCam = true
        }
      }
      this.fx.tracer(mx, my, mz, h.x, h.y, h.z, w)
      this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, soft, w)
      emit('hit', { id: u.id, weapon: w, zone: h.zone })
      // A boss hit is a boss told: the whole base comes.
      if (u.boss) { this.bossFocus = u.id; this.goLoud() }
      if (u.shield && h.zone === 'armor') this.fx.particles.sparks(h.x, h.y, h.z, '#ffe98f', 14, 5, 0.25)
      if (!damageUnit(gar, u.id, damage, ox, oz, w === 'minigun' ? 'spray' : 'shot')) {
        // A silenced round in a drone's shell: it does not know what hit it.
        if (u.kind === 'drone' && w === 'sniper') startleUnit(gar, u.id, from?.x ?? this.player.x, from?.z ?? this.player.z)
        else {
          // It knows it was shot, and about where from (#70); the loud weapons give the place away.
          const at = from ?? { x: this.player.x, z: this.player.z }
          alarmUnit(gar, u.id, at.x, at.z)
          // A guard who took a round and lives: those near it go to look for the shooter (#60).
          if (w === 'sniper') searchForShooter(gar, u.id, at.x, at.z)
        }
      }
    } else if (h.kind === 'world') {
      const b = barrelAt(this.barrels, toCell(h.x + dx * 0.05), toCell(h.z + dz * 0.05))
      if (b) ignite(b, 0)
      this.fx.tracer(mx, my, mz, h.x, h.y, h.z, w)
      this.fx.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, false, w)
    } else {
      this.fx.tracer(mx, my, mz, h.x, h.y, h.z, w)
    }
    this.flushGarrison()
  }

  /** A weapon nobody can miss: the whole base hears it. */
  private goLoud(): void {
    // The training ground has no alarm.
    if (this.garrison.alert.chaos || this.garrison.drill) return
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
      for (const o of this.barrels) if (o.live && Math.hypot(o.x - b.x, o.z - b.z) < this.loadout.blastRadius) ignite(o, 0.08)
      // The dead fly too (#64).
      for (const d of this.garrison.units) {
        if (d.rag && d.state === 'dead' && !d.hidden && d.deadT >= d.hold) blastRagdoll(d.rag, b.x, b.y, b.z, this.loadout.blastRadius * 1.3, 1 / 60)
      }
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

  // ─── The alarm beacons ─────────────────────────────────────────────────────

  /** The nearest working beacon within reach, if nobody can see the mech; −1 otherwise. */
  private beaconInReach(): number {
    const p = this.player
    const gar = this.garrison
    if (gar.units.some(u => u.sees)) return -1
    let best = -1
    let bestD = SABOTAGE_REACH
    for (let k = 0; k < gar.beacons.length; k++) {
      const b = gar.beacons[k]!
      if (b.state !== 'ready' || Math.abs(b.y - p.y) > 1) continue
      const d = Math.hypot(b.x - p.x, b.z - p.z)
      if (d < bestD) { bestD = d; best = k }
    }
    return best
  }

  /** The nearest generator or servo within reach, while nobody is looking. */
  private rigInReach(): number {
    const p = this.player
    const gar = this.garrison
    if (gar.units.some(u => u.sees)) return -1
    let best = -1
    let bestD = RIG_REACH
    gar.rigs.forEach((r, k) => {
      if (r.cut || Math.abs(r.y - p.y) > 1.2) return
      // A servo is jammed while its machine still sleeps.
      if (r.kind === 'servo' && gar.units[r.unit]?.state !== 'dormant') return
      const d = Math.hypot(r.x - p.x, r.z - p.z)
      if (d < bestD) { bestD = d; best = k }
    })
    return best
  }

  private startSabotage(k: number, rig?: number): void {
    const p = this.player
    const b = rig !== undefined ? this.garrison.rigs[rig]! : this.garrison.beacons[k]!
    this.sabotaging = { beacon: k, t: 0, rig }
    this.beaconOffer = -1
    this.rigOffer = -1
    p.vx = p.vz = 0
    p.speed01 = 0
    p.boxed = false
    p.yaw = headingTo(p.x, p.z, b.x, b.z)
    emit('sabotage', { beat: 'start', beacon: k })
  }

  /** Working at a generator or a servo; done, it is cut (`cutRig`). */
  private stepCut(k: number, dt: number): void {
    const s = this.sabotaging!
    const r = this.garrison.rigs[k]!
    if (Math.floor(s.t / 0.25) !== Math.floor((s.t - dt) / 0.25)) this.fx.particles.sparks(r.x, r.y + 1, r.z, '#ffd23f', 6, 3, 0.18)
    if (s.t < SABOTAGE_S) return
    this.sabotaging = null
    if (cutRig(this.garrison, k)) {
      this.fx.particles.sparks(r.x, r.y + 1.2, r.z, '#ffffff', 18, 4, 0.3)
      haptic('reward')
      emit('sabotage', { beat: 'done', beacon: -1 })
      this.learn('sabotage')
    }
  }

  private stepSabotage(dt: number): void {
    const s = this.sabotaging!
    const p = this.player
    const i = this.input
    p.px = p.x; p.py = p.y; p.pz = p.z; p.pyaw = p.yaw
    if (Math.hypot(i.moveX, i.moveY) > 0.5) {
      this.sabotaging = null
      emit('sabotage', { beat: 'stop', beacon: s.beacon })
      return
    }
    s.t += dt
    if (s.rig !== undefined) { this.stepCut(s.rig, dt); return }
    const b = this.garrison.beacons[s.beacon]!
    if (Math.floor(s.t / 0.25) !== Math.floor((s.t - dt) / 0.25)) this.fx.particles.sparks(b.x + 0.2, b.y + 1.25, b.z + 0.3, '#7ff4ff', 6, 3, 0.18)
    if (s.t < SABOTAGE_S) return
    this.sabotaging = null
    if (sabotageBeacon(this.garrison, s.beacon)) {
      this.sabotaged++
      this.fx.particles.sparks(b.x, b.y + BEACON_TOP, b.z, '#ffffff', 18, 4, 0.3)
      haptic('reward')
      emit('sabotage', { beat: 'done', beacon: s.beacon })
      this.learn('sabotage')
    }
  }

  // ─── Salvage ───────────────────────────────────────────────────────────────

  private startLoot(pile: Pile): void {
    const p = this.player
    p.boxed = false
    this.looting = { pile, t: 0 }
    this.lootOffer = null
    p.vx = p.vz = 0
    p.speed01 = 0
    p.yaw = headingTo(p.x, p.z, pile.x, pile.z)
    emit('salvage', { beat: 'start', got: this.stats.piles, need: this.salvageNeed, amount: 0 })
    this.learn('loot')
  }

  private stepLoot(dt: number): void {
    const l = this.looting!
    const p = this.player
    const i = this.input
    p.px = p.x
    p.py = p.y
    p.pz = p.z
    p.pyaw = p.yaw
    // Walking away leaves the pile as it was.
    if (Math.hypot(i.moveX, i.moveY) > 0.5) {
      this.looting = null
      emit('salvage', { beat: 'stop', got: this.stats.piles, need: this.salvageNeed, amount: 0 })
      return
    }
    l.t += dt
    // Sparks and clatter while it works: a little noise, close by.
    if (Math.floor(l.t / 0.3) !== Math.floor((l.t - dt) / 0.3)) {
      this.fx.particles.sparks(l.pile.x, l.pile.y + 0.5, l.pile.z, '#ffb14a', 5, 2.5, 0.2)
      if (l.t < SALVAGE_S - 0.2) hearAt(this.garrison, l.pile.x, l.pile.z, SALVAGE_EARSHOT)
    }
    if (l.t < SALVAGE_S) return
    // Stripped.
    const pile = l.pile
    pile.taken = true
    // The first pile is the checkpoint: a downed raid can pick up here.
    if (!this.checkpoint) this.checkpoint = { x: p.x, y: p.y, z: p.z, yaw: p.yaw }
    this.looting = null
    this.salvageView.take(pile.id)
    this.stats.salvage += pile.amount
    this.stats.piles++
    noteChange(this.garrison, pile.x, pile.y, pile.z, 'pile')
    this.fx.particles.riseRing(pile.x, pile.y + 0.2, pile.z, '#ffb14a', pile.big ? 1.3 : 0.9, 18)
    haptic('reward')
    mirror('salvageGot', this.stats.piles)
    emit('salvage', { beat: 'taken', got: this.stats.piles, need: this.salvageNeed, amount: pile.amount })
    if (this.objective === 'salvage' && this.stats.piles >= this.salvageNeed) this.openExtraction()
  }

  /** DEV: strip every pile the raid still needs, where they lie (tests, the preview recorder). */
  cheatSalvage(): void {
    for (const pile of this.piles) {
      if (this.stats.piles >= this.salvageNeed) break
      if (pile.taken) continue
      pile.taken = true
      this.salvageView.take(pile.id)
      this.stats.salvage += pile.amount
      this.stats.piles++
    }
    mirror('salvageGot', this.stats.piles)
    if (this.objective === 'salvage' && this.stats.piles >= this.salvageNeed) this.openExtraction()
  }

  // ─── The grappling hook ────────────────────────────────────────────────────

  private throwHook(spot: GrappleSpot): void {
    this.learn('grapple')
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

  /**
   * What the hook and the rope gun could take along the camera's line (#102,
   * #94): a wall top the hook reaches, a spot below for a rope. Only on the
   * ground, with the hands free and the weapon down.
   */
  private aimGear(): void {
    this.hookAim = null
    this.ropeAim = null
    const p = this.player
    if (p.mode !== 'ground' || this.strike || this.grapple || this.weaponUp()) return
    if (ceilingAt(this.fortress.grid, p.x, p.z, p.y) < Infinity) return
    const f = camForward(this.cam)
    const cp = this.camera.position
    // From the camera, starting past the mech, as the reticle does.
    const eyeY = p.y + eyeHeight(p)
    const skip = Math.max(0, (p.x - cp.x) * f.x + (eyeY - cp.y) * f.y + (p.z - cp.z) * f.z)
    const ox = cp.x + f.x * skip
    const oy = cp.y + f.y * skip
    const oz = cp.z + f.z * skip
    const hit = raycast(this.fortress.grid, ox, oy, oz, f.x, f.y, f.z, 46)
    if (!hit.hit) return
    const hx = ox + f.x * hit.t
    const hy = oy + f.y * hit.t
    const hz = oz + f.z * hit.t
    this.hookAim = findGrappleAimed(this.fortress.grid, { x: p.x, y: p.y, z: p.z }, { x: hx, y: hy, z: hz }, { x: hit.nx, y: hit.ny, z: hit.nz }, this.loadout.hookMax)
    if (this.ropesLeft > 0 && !this.hookAim) this.ropeAim = findRopeShot(this.fortress.grid, p.x, p.y, p.z, hx, hy, hz, hit.ny)
  }

  /** The first raid's opening (#104): which beat, how long into it, who. */
  private opening: { stage: 'sneak' | 'stab' | 'aim' | 'fired'; t: number; guard: number; target: number } | null = null

  private startOpening(): void {
    const p = this.player
    // The guard in front of the landing: the nearest person.
    let best = -1
    let bestD = 30
    for (const u of this.garrison.units) {
      if (!isAlive(u) || (u.kind !== 'guard' && u.kind !== 'sentry')) continue
      const d = Math.hypot(u.x - p.x, u.z - p.z)
      if (d < bestD && Math.abs(u.y - p.y) < 1.5) { bestD = d; best = u.id }
    }
    if (best < 0) { markSeen('opening'); return }
    this.opening = { stage: 'sneak', t: 0, guard: best, target: -1 }
  }

  private endOpening(): void {
    this.opening = null
    this.input.aimHeld = false
    markSeen('opening')
  }

  /**
   * The opening, one step: it walks the mech up behind the guard, crouched,
   * and takes it; then the rifle comes up onto the nearest person in sight
   * and fires. A press after the first second hands the mech to the player.
   * True while the opening has the mech.
   */
  private stepOpening(dt: number): boolean {
    const o = this.opening!
    const p = this.player
    const g = this.fortress.grid
    o.t += dt
    if (o.t > 1 && this.input.anyPressed && o.stage !== 'fired') { this.endOpening(); return false }
    if (o.stage === 'sneak') {
      const u = this.garrison.units[o.guard]!
      if (!isAlive(u) || o.t > 10) { o.stage = 'stab'; o.t = 0; return true }
      const tx = u.x - Math.sin(u.yaw) * 1.5
      const tz = u.z - Math.cos(u.yaw) * 1.5
      const d = Math.hypot(tx - p.x, tz - p.z)
      p.crouched = true
      const mx = d > 0.2 ? (tx - p.x) / d : 0
      const mz = d > 0.2 ? (tz - p.z) / d : 0
      stepPlayer(p, g, { mx, mz, crouch: false, aiming: false, aimYaw: this.cam.yaw }, dt)
      this.cam.yaw += angleDelta(this.cam.yaw, headingTo(p.x, p.z, u.x, u.z)) * Math.min(1, dt * 3)
      const offer = findStrike(this.garrison, g, p.x, p.y, p.z, headingTo(p.x, p.z, u.x, u.z), true)
      if (offer && offer.id === o.guard) {
        this.startStrike(offer)
        o.stage = 'stab'
        o.t = 0
      }
      return true
    }
    if (o.stage === 'stab') {
      // The takedown is over (it ran as any other): find the shot.
      const eye = p.y + 2.25 + (1.4 - 2.25) * p.crouch
      let best = -1
      let bestD = 70
      for (const u of this.garrison.units) {
        if (!isAlive(u) || u.id === o.guard || (u.kind !== 'guard' && u.kind !== 'sentry')) continue
        const d = Math.hypot(u.x - p.x, u.z - p.z)
        if (d < bestD && hasLineOfSight(g, p.x, eye, p.z, u.x, u.y + 1.54, u.z)) { bestD = d; best = u.id }
      }
      if (best < 0) { this.endOpening(); return false }
      o.target = best
      o.stage = 'aim'
      o.t = 0
      if (this.arsenal.current !== 'sniper') this.arsenal.current = 'sniper'
      return true
    }
    if (o.stage === 'aim') {
      const u = this.garrison.units[o.target]!
      if (!isAlive(u)) { this.endOpening(); return false }
      this.input.aimHeld = true
      const eye = p.y + 2.25 + (1.4 - 2.25) * p.crouch
      const yaw = headingTo(p.x, p.z, u.x, u.z)
      const pitch = Math.atan2(u.y + 1.54 - eye, Math.hypot(u.x - p.x, u.z - p.z))
      const k = Math.min(1, dt * 5)
      this.cam.yaw += angleDelta(this.cam.yaw, yaw) * k
      this.cam.pitch += (pitch - this.cam.pitch) * k
      p.yaw += angleDelta(p.yaw, yaw) * k
      if (o.t >= 1.4) {
        this.cam.yaw = yaw
        this.cam.pitch = pitch
        this.fireRound()
        o.stage = 'fired'
        o.t = 0
      }
      return true
    }
    // The round is away: a beat, then the mech is the player's.
    if (o.t >= 1.2) { this.endOpening(); return false }
    return true
  }

  /**
   * The marksmen's lasers (#90): while one draws on the mech the line runs
   * from its rifle to the mech's chest, brighter as the round comes.
   */
  private drawLasers(): void {
    const p = this.player
    for (const l of this.lasers) {
      const u = this.garrison.units[l.id]!
      const on = isAlive(u) && u.state === 'combat' && u.sees && u.aimT < MARKSMAN_AIM_S && hud.phase === 'play'
      l.mesh.visible = on
      if (!on) continue
      const ax = u.x + Math.sin(u.yaw) * 0.6
      const ay = u.y + 1.35
      const az = u.z + Math.cos(u.yaw) * 0.6
      const bx = p.x
      const by = p.y + 1.4
      const bz = p.z
      const len = Math.max(0.1, Math.hypot(bx - ax, by - ay, bz - az))
      l.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
      l.mesh.scale.set(1, len, 1)
      l.mesh.quaternion.setFromUnitVectors(UP, new Vector3(bx - ax, by - ay, bz - az).normalize())
      ;(l.mesh.material as MeshBasicMaterial).opacity = 0.45 + 0.5 * (u.aimT / MARKSMAN_AIM_S)
    }
  }

  /** A body or a wreck at the mech's feet the flamethrower can take (#99), or −1. */
  private burnInReach(): number {
    const p = this.player
    let best = -1
    let bestD = BURN_REACH
    for (const u of this.garrison.units) {
      if (u.state !== 'dead' || u.hidden || u.kind === 'searchlight' || u.deadT < u.hold + 0.8) continue
      if (Math.abs(u.y - p.y) > 1.5) continue
      const d = Math.hypot(u.x - p.x, u.z - p.z)
      if (d < bestD) { bestD = d; best = u.id }
    }
    return best
  }

  private startBurn(id: number): void {
    const p = this.player
    const u = this.garrison.units[id]!
    p.boxed = false
    p.vx = p.vz = 0
    p.speed01 = 0
    p.yaw = headingTo(p.x, p.z, u.x, u.z)
    this.burning = { id, t: 0, seen: 0 }
    this.burnOffer = -1
    // The fire glows: while it burns it is a thing out of place for whoever sees it.
    noteChange(this.garrison, u.x, u.y, u.z, 'fire')
    this.burnChange = this.garrison.changes[this.garrison.changes.length - 1] ?? null
    this.fuelLeft--
    this.flame.visible = true
    emit('burn', { beat: 'start' })
  }

  /**
   * Burning (#99): the jet on the body for BURN_S. The fire glows: while it
   * burns, a defender that sees it notices a thing out of place and comes to
   * look. Walking away stops it (the fuel is spent).
   */
  private stepBurn(dt: number): void {
    const b = this.burning!
    const p = this.player
    const u = this.garrison.units[b.id]!
    p.px = p.x
    p.py = p.y
    p.pz = p.z
    p.pyaw = p.yaw
    if (Math.hypot(this.input.moveX, this.input.moveY) > 0.5 || u.hidden) {
      this.endBurn()
      return
    }
    b.t += dt
    // The jet: from the mech's hand to the body.
    const hx = p.x + Math.sin(p.yaw) * 0.8
    const hz = p.z + Math.cos(p.yaw) * 0.8
    const hy = p.y + 1.25
    const tx = u.x
    const ty = u.y + 0.35
    const tz = u.z
    const len = Math.max(0.5, Math.hypot(tx - hx, ty - hy, tz - hz))
    this.flame.position.set((hx + tx) / 2, (hy + ty) / 2, (hz + tz) / 2)
    this.flame.scale.set(1, len, 1)
    this.flame.quaternion.setFromUnitVectors(UP, new Vector3(tx - hx, ty - hy, tz - hz).normalize())
    setFlame(this.flameMat, 0.9, this.time)
    if (Math.floor(b.t / 0.06) !== Math.floor((b.t - dt) / 0.06)) {
      // Flames licking up off the body, and the jet's own sparks.
      for (let k = 0; k < 3; k++) {
        this.fx.particles.emit({
          x: u.x + (Math.random() - 0.5) * 0.9, y: u.y + 0.2, z: u.z + (Math.random() - 0.5) * 0.9,
          vx: (Math.random() - 0.5) * 0.6, vy: 2.2 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 0.6,
          color: k === 0 ? '#fff1a8' : k === 1 ? '#ff9a3d' : '#ff4a2a', size: 0.7, sizeEnd: 0.1, life: 0.55, drag: 0.8
        })
      }
      this.fx.particles.sparks(hx + (tx - hx) * 0.5, hy + (ty - hy) * 0.5, hz + (tz - hz) * 0.5, '#ffd27a', 2, 2.5, 0.2)
    }
    if (b.t < BURN_S) return
    // Gone: ash for a person, slag for a machine; nobody will find it now.
    const human = camKind(u.kind) === 'human'
    u.hidden = true
    if (u.rag) u.rag.pin = null
    this.garrisonView.wreckage.clearNear(u.x, u.z, 3)
    const r = new Mesh(this.ashGeo, human ? this.ashMat : this.slagMat)
    const floor = heightAt(this.fortress.grid, u.x, u.z)
    r.position.set(u.x, (floor === VOID ? u.y : floor) + 0.04, u.z)
    r.scale.set(human ? 1 : 1.3, 1, human ? 1 : 1.3)
    this.scene.add(r)
    this.residues.push(r)
    this.fx.particles.sparks(u.x, u.y + 0.3, u.z, human ? '#6f6488' : '#ffb061', 16, 3, 0.3)
    this.burnsDone++
    this.endBurn()
    emit('burn', { beat: 'done' })
  }

  private endBurn(): void {
    // Burnt out: the glow is gone, and with it the thing to notice (unless somebody already did).
    const c = this.burnChange
    if (c && !c.found) this.garrison.changes.splice(this.garrison.changes.indexOf(c), 1)
    this.burnChange = null
    this.burning = null
    this.flame.visible = false
    setFlame(this.flameMat, 0, this.time)
  }

  /** The rope gun (#94): a line from here to there, walked at once like any cable. */
  private shootRope(r: RopeShot): void {
    const g = this.fortress.grid
    g.cables.push(r.cable)
    this.ropesLeft--
    this.ropesShot++
    this.ropeAim = null
    const len = Math.hypot(r.bx - r.ax, r.by - r.ay, r.bz - r.az)
    const mesh = new Mesh(this.ropeGeo, this.ropeMat)
    mesh.position.set((r.ax + r.bx) / 2, (r.ay + r.by) / 2 + 0.75, (r.az + r.bz) / 2)
    mesh.scale.set(1, len, 1)
    mesh.quaternion.setFromUnitVectors(UP, new Vector3(r.bx - r.ax, r.by - r.ay, r.bz - r.az).normalize())
    this.scene.add(mesh)
    this.ropeMeshes.push(mesh)
    this.fx.particles.sparks(r.bx, r.by + 0.75, r.bz, '#fff1c9', 10, 3, 0.25)
    // A line strung across the base is a thing out of place for whoever sees it.
    noteChange(this.garrison, (r.ax + r.bx) / 2, (r.ay + r.by) / 2 + 0.5, (r.az + r.bz) / 2, 'rope')
    emit('rope', {})
    haptic('tap')
  }

  private throwDecoy(): void {
    if (this.decoyCool > 0 || this.player.mode !== 'ground') return
    const p = this.player
    // Thrown ahead; with a wall in the face, dropped at the mech's feet.
    const spot = decoySpot(this.fortress.grid, p.x, p.y, p.z, this.cam.yaw) ?? { x: p.x, y: p.y, z: p.z }
    this.decoyCool = this.loadout.decoyCooldown
    // It faces back at the mech: a mech-shaped light looking at the guards
    // who come round the corner after it.
    this.decoys.push({ ...spot, yaw: this.cam.yaw + Math.PI, t: 0, life: this.loadout.decoySeconds, pulse: 0 })
    this.fx.decoyPop(spot.x, spot.y, spot.z)
    haptic('tap')
    this.learn('decoy')
    emit('decoy', { x: spot.x, y: spot.y, z: spot.z })
    mirror('decoys', 0)
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
    // Under the box: still is a box; creeping is a box that moves.
    // A disguise counts once the mech has folded all the way into it (#111).
    t.box = p.boxed && p.box > 0.9 && this.morph > 0.97 ? (Math.hypot(p.vx, p.vz) > 0.35 ? 'creep' : 'still') : undefined
    t.moving = p.mode === 'ground' ? p.speed01 : 0.6
    // Shadow and thickets underfoot (`Shade`).
    const sh = p.mode === 'ground' ? shadeAt(this.fortress.grid, p.x, p.z) : 0
    t.shadow = (sh & Shade.Shadow) !== 0
    t.brush = (sh & Shade.Brush) !== 0 && p.crouched && !p.sprinting
    mirror('concealed', t.brush ? 2 : t.shadow ? 1 : 0)
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
        if (this.killBy === 'sniper') {
          this.sniperKills++
          // From the perch: the base will remember that (R26).
          const ins = this.fortress.insert
          const pb = this.player
          if (Math.hypot(pb.x - ins.x, pb.z - ins.z) < PERCH_M && Math.abs(pb.y - heightAt(this.fortress.grid, ins.x, ins.z)) < 1.5) this.stats.perchKills++
        }
        // A person drops its ammo pouch where it falls (#76).
        if ((u.kind === 'guard' || u.kind === 'sentry' || u.kind === 'commander') && !this.training) this.dropPouch(u.x, u.y, u.z)
        this.fx.kill(u.x, u.y, u.z, u.kind)
        // Apart, in pieces that stay where they land.
        if (e.death === 'burst') {
          this.garrisonView.burst(e.id)
          // A machine tears apart in a shower of sparks (#64).
          if (u.kind !== 'guard' && u.kind !== 'sentry' && u.kind !== 'commander') {
            const big = u.kind === 'goliath' || u.kind === 'enforcer'
            this.fx.particles.sparks(u.x, u.y + (big ? 1.6 : 0.6), u.z, '#ffd88a', big ? 30 : 14, big ? 9 : 6, 0.35)
          }
          this.shake = Math.max(this.shake, u.kind === 'goliath' ? 0.9 : 0.3)
        }
        emit('kill', {
          id: e.id, kind: u.kind, by: this.killBy, head: this.killHead,
          dist: Math.hypot(u.x - this.player.x, u.z - this.player.z)
        })
        // The Commander (and his tank) are not the job any more, but their
        // fall is still the raid's big moment: it always gets the camera.
        const final = (u.kind === 'commander' || u.kind === 'goliath') && this.targetsLeft() === 0
        if (final) this.stats.bossDown = true
        // The Commander is down and the tank is still asleep: not for long.
        if (u.kind === 'commander' && gar.units.some(o => o.kind === 'goliath' && o.state === 'dormant')) this.finaleT = 2.2
        // The sniper's kill-cam was decided when the round was fired.
        const bossLast = !!u.boss && final
        if ((this.killBy !== 'sniper' || (bossLast && this.bossCam)) && !this.cine && hud.phase === 'play') {
          this.bossCam = false
          const info: KillInfo = {
            by: this.killBy, head: false, final, time: this.stats.time, dist: Math.hypot(u.x - this.player.x, u.z - this.player.z),
            moving: u.speed01, zone: 'other', boss: !!u.boss, kind: camKind(u.kind), stealth: this.quietRaid()
          }
          const cut = this.killBy === 'sniper' ? 'boss' : this.rollKillcam(info)
          // A mini-gun burst now and then takes a person apart even without a
          // camera (#64: kill-cams are for stealth headshots now, #85).
          if (cut === 'none' && this.killBy === 'minigun' && u.rag && !u.boss && Math.random() < MINIGUN_APART) {
            u.rag = null
            u.death = 'burst'
            this.garrisonView.burst(e.id)
          }
          if (cut === 'boss') {
            // A boss's last blow: its own long, slow orbit.
            this.cine = { kind: 'orbit', t: 0, dur: BOSS_ORBIT_S, id: e.id, yaw: this.cam.yaw + Math.PI * 0.6, final: true, boss: true }
            mirror('cine', true)
            emit('killcam', { kind: 'orbit', final: true })
            app.setTimeScale(KILLCAM_SLOW * 0.7)
          } else if (cut !== 'none') {
            // The blade and the last kill get the camera; a burst or a blast
            // in the middle of a fight only gets the slow beat.
            if (this.killBy === 'minigun' && u.rag && !u.boss && cut === 'full') {
              // Now and then, on camera, a burst takes a person apart (#64).
              u.rag = null
              u.death = 'burst'
              this.garrisonView.burst(e.id)
              this.cine = { kind: 'orbit', t: 0, dur: 1.6, id: e.id, yaw: this.cam.yaw + Math.PI * 0.6, final }
              mirror('cine', true)
              emit('killcam', { kind: 'orbit', final })
            } else if ((this.killBy === 'blade' || final) && cut === 'full') {
              this.cine = { kind: 'orbit', t: 0, dur: final ? 2.4 : 1.5, id: e.id, yaw: this.cam.yaw + Math.PI * 0.75, final }
              mirror('cine', true)
              emit('killcam', { kind: 'orbit', final })
            } else {
              this.cine = { kind: 'dip', t: 0, dur: cut === 'short' ? 0.45 : 0.75 }
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
      } else if (e.type === 'checkin') {
        // A radio that has been quiet too long: somebody goes to see.
        emit('checkin', { id: e.id, kind: gar.units[e.id]!.kind, corpse: e.corpse })
      } else if (e.type === 'standDown') {
        emit('standDown', {})
      } else if (e.type === 'shout') {
        emit('shout', { id: e.id, kind: gar.units[e.id]!.kind })
      } else if (e.type === 'ping') {
        emit('shout', { id: e.guard, kind: gar.units[e.guard]!.kind })
      } else if (e.type === 'runner') {
        emit('runner', { id: e.id, beacon: e.beacon })
      } else if (e.type === 'alarm') {
        const b = gar.beacons[e.beacon]!
        this.fx.particles.riseRing(b.x, b.y + BEACON_TOP, b.z, PAL.glowRed, 2.2, 24)
        emit('beaconLit', { beacon: e.beacon })
      } else if (e.type === 'bark') {
        const u = gar.units[e.id]!
        emit('bark', { id: e.id })
        this.garrisonView.flash(e.id, '#ff4060', 0.4)
        if (u.state !== 'combat') emit('suspicious', { id: e.id, kind: u.kind })
      } else if (e.type === 'repair') {
        // Sparks where it was fixed: a beacon working again, a light back on.
        const at = e.kind === 'beacon' ? gar.beacons[e.i]! : gar.units[e.i]!
        this.fx.particles.sparks(at.x, at.y + 1, at.z, '#ffd23f', 14, 4, 0.25)
        emit('repair', { id: e.id })
      } else if (e.type === 'shieldDown') {
        const u = gar.units[e.id]!
        this.fx.particles.sparks(u.x, u.y + 1.3, u.z, '#9fe8ff', 22, 5, 0.3)
        if (u.boss) {
          mirror('bossShield', false)
          emit('bossTell', { id: e.id, what: 'shield' })
        }
      } else if (e.type === 'phase') {
        const u = gar.units[e.id]!
        this.fx.particles.orbBurst(u.x, u.y + 1.2, u.z, '#ff4060', 1.1)
        emit('bossTell', { id: e.id, what: 'phase' })
      } else if (e.type === 'glint') {
        // The tell: a white glint on the blade before the dash.
        this.garrisonView.flash(e.id, '#ffffff', GLINT_FLASH_S)
        emit('bossTell', { id: e.id, what: 'glint' })
      } else if (e.type === 'overheat') {
        this.garrisonView.flash(e.id, '#ff8a3d', 1.2)
        emit('bossTell', { id: e.id, what: 'overheat' })
      } else if (e.type === 'selfHit') {
        const u = gar.units[e.id]!
        this.fx.explosion(u.x, u.y + 1.5, u.z, u.y)
        this.garrisonView.flash(e.id, '#ffffff', 0.6)
        emit('bossHit', { amount: e.damage })
        emit('bossTell', { id: e.id, what: 'selfHit' })
      } else if (e.type === 'poke' || e.type === 'change' || e.type === 'called') {
        // Going over to look: the same "huh?" as any suspicion.
        emit('suspicious', { id: e.id, kind: gar.units[e.id]!.kind })
      } else if (e.type === 'heightened') {
        emit('heightened', {})
      } else {
        if (e.type === 'spotted') {
          this.stats.spotted++
          this.callout(e.id)
        }
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
    // A takedown is the mech's moment, and a kill-cam the world's pause:
    // nothing lands on it until it is over.
    if (this.strike?.full || this.killcamOn()) return
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
      failMission(this.stats, this.checkpoint ? { ...this.checkpoint, level: this.level, piles: this.piles.filter(q => q.taken).map(q => q.id) } : null)
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
    c.decoys = this.decoyCool <= 0 ? 1 : 0
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
    // Every half second: is somebody in clear sight, within the rifle's reach?
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
      const eye = p.y + 2.2
      c.mark = gar.units.some(u => !isLight(u) && u.state !== 'dead' && u.state !== 'reserve' && u.state !== 'dormant'
        && Math.hypot(u.x - p.x, u.z - p.z) < MARK_M && hasLineOfSight(g, p.x, eye, p.z, u.x, u.y + 1.4, u.z))
    }
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
    c.loot = !!this.lootOffer
    c.sabotage = this.beaconOffer >= 0 || this.rigOffer >= 0
    c.boxed = p.boxed
    c.hook = !!this.hookSpot && !this.grapple
    c.seeking = this.objective === 'salvage' && this.stats.piles === 0
    // The way is long when the waypoint is: the marker's own target.
    c.far = this.objective !== 'done' && this.waypointDist > 22
    // Reaching a pile is what the marker was for.
    if (this.lootOffer) this.learn('goal')
    if (p.sprinting && !this.wasSprinting) this.learn('sprint')
    if (p.boxed && !this.wasBoxed) this.learn('hide')
    if (p.boxed !== this.wasBoxed) emit('box', { on: p.boxed })
    if (p.boxed && !this.wasBoxed) this.stats.boxUses++
    this.wasBoxed = p.boxed
    this.wasSprinting = p.sprinting
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
    return (u.kind === 'commander' || u.kind === 'goliath') && this.targetsLeft() === 1
  }

  private openExtraction(): void {
    if (this.objective !== 'salvage') return
    this.objective = 'extract'
    this.beacon.visible = true
    mirror('objective', 'extract')
    emit('objective', { state: 'extract' })
  }

  /** Ask the director whether this kill is shown. */
  /**
   * The raid is still quiet (#85): no full alert, and nobody is fighting the
   * mech or hunting for it.
   */
  private quietRaid(): boolean {
    const gar = this.garrison
    if (gar.alert.chaos) return false
    return !gar.units.some(o => isAlive(o) && (o.state === 'combat' || (o.state === 'search' && o.fought)))
  }

  /** A kill-cam is on: the world holds still for it (#91). */
  private killcamOn(): boolean {
    const c = this.cine
    return !!c && ((c.kind === 'bullet' && c.hit) || c.kind === 'orbit' || c.kind === 'dip')
  }

  private rollKillcam(info: KillInfo): CamCut {
    if (this.forceKillcam) {
      // The preview recorder's call: this one is shown, whatever the dice say.
      this.forceKillcam = false
      return chooseKillCam(this.killcam, { ...info, final: true, boss: false }, 0, true)
    }
    // The first headshot of a player's life is always shown: the profile remembers.
    const firstOfLife = !profile.seen.includes(FIRST_HEADSHOT_CAM)
    const cut = chooseKillCam(this.killcam, { ...info, firstOfLife }, Math.random(), killCamsEnabled.value)
    if (cut === 'full' && firstOfLife && info.by === 'sniper' && info.head) {
      profile.seen.push(FIRST_HEADSHOT_CAM)
      saveProfile()
    }
    return cut
  }

  /** End the drop-in now (the preview recorder, which opens on the action). */
  endIntro(): void {
    if (this.cine?.kind === 'intro') this.skipCine()
  }

  /** DEV cheat: the job is done, the line comes down now (`game/cheats.ts`). */
  cheatExtract(): void {
    if (hud.phase !== 'play') return
    this.cheatSalvage()
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
    // The round's trail, all the way from the barrel, hangs a moment (#77).
    this.fx.tracer(c.ox, c.oy, c.oz, c.hx, c.hy, c.hz, 'sniper')
    this.fx.impact(c.hx, c.hy, c.hz, c.nx, c.ny, c.nz, true, 'sniper')
    // ...and goes on through, out of the far side (#77).
    const len = Math.hypot(c.hx - c.ox, c.hy - c.oy, c.hz - c.oz) || 1
    const through = c.head ? 0.42 : camKind(u.kind) === 'machine' ? 0.6 : 0.55
    this.fx.exitShot(c.hx, c.hy, c.hz, (c.hx - c.ox) / len, (c.hy - c.oy) / len, (c.hz - c.oz) / len, through, camKind(u.kind) === 'machine')
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
      this.rideX = this.rideZ = 0
      this.riding = false
      this.dog.root.visible = false
      markSeen('intro')
      setPhase('play')
      emit('deployed', {})
      // The first raid's opening (#104): the mech takes the guard in front of it, then a shot.
      if (this.fortress.opening) this.startOpening()
    } else if (c.kind === 'outro') {
      this.dog.root.visible = false
      setPhase('done')
      if (this.training) void finishTraining()
      else finishMission(this.stats)
      emit('extracted', {})
    }
  }

  private mechFade = 0
  /** What defenders are shouting right now (#62): who, which line, for how long yet. */
  private shouts: Array<{ id: number; line: number; t: number }> = []

  /** A defender is sure: it shouts (a person) or announces (a machine). A lamp says nothing. */
  private callout(id: number): void {
    const u = this.garrison.units[id]
    if (!u || u.kind === 'searchlight') return
    const machine = u.kind === 'drone' || u.kind === 'enforcer' || u.kind === 'goliath' || u.kind === 'hound' || u.kind === 'roomba'
    const line = machine ? 1 : 0
    this.shouts = this.shouts.filter(s => s.id !== id)
    if (this.shouts.length >= MAX_CALLOUTS) this.shouts.shift()
    this.shouts.push({ id, line, t: CALLOUT_S })
    const p = this.player
    emit('callout', {
      id, kind: u.kind, role: u.role, line: machine ? 'machine' : 'human',
      dist: Math.hypot(u.x - p.x, u.z - p.z), pan: -Math.sin(angleDelta(this.cam.yaw, headingTo(p.x, p.z, u.x, u.z)))
    })
  }

  /** Pin each bubble over its speaker's head on screen. */
  /**
   * The in-world prompt (#83): over whatever the act key (or the hook key)
   * would work on right now, in the same order the act key chooses.
   */
  private writePrompt(show: boolean): void {
    let kind = '' as PromptKind
    let x = 0
    let y = 0
    let z = 0
    const gar = this.garrison
    const at = (k: PromptKind, px: number, py: number, pz: number): void => { kind = k; x = px; y = py; z = pz }
    if (show && !this.looting && !this.sabotaging && !this.grapple && !this.burning) {
      const o = this.offer && !this.strike ? gar.units[this.offer.id] : undefined
      if (o) at('strike', o.x, o.y + SPECS[o.kind].height + 0.35, o.z)
      else if (this.beaconOffer >= 0) { const b = gar.beacons[this.beaconOffer]!; at('sabotage', b.x, b.y + 2.6, b.z) }
      else if (this.rigOffer >= 0) { const r = gar.rigs[this.rigOffer]!; at(r.kind === 'generator' ? 'cutPower' : 'jam', r.x, r.y + 2.2, r.z) }
      else if (this.lootOffer) at('salvage', this.lootOffer.x, this.lootOffer.y + 1.0, this.lootOffer.z)
      else if (this.dragId >= 0) { const u = gar.units[this.dragId]!; at('drop', u.x, u.y + 0.9, u.z) }
      // The flamethrower is offered by its prompt (#99), before the drag.
      else if (this.burnOffer >= 0) { const u = gar.units[this.burnOffer]!; at('burn', u.x, u.y + 0.9, u.z) }
      else if (this.dragOffer >= 0) { const u = gar.units[this.dragOffer]!; at('grab', u.x, u.y + 0.9, u.z) }
      else if (this.hookSpot) at('hook', this.hookSpot.edge.x, this.hookSpot.edge.y + 0.5, this.hookSpot.edge.z)
      else if (this.hookAim) at('hook', this.hookAim.edge.x, this.hookAim.edge.y + 0.5, this.hookAim.edge.z)
      else if (this.ropeAim) at('rope', this.ropeAim.bx, this.ropeAim.by + 0.8, this.ropeAim.bz)
    }
    mirror('prompt', kind)
    prompt.on = kind !== '' && !hud.scoped
    if (!prompt.on) return
    this.camera.updateMatrixWorld()
    const p = this.proj.set(x, y, z).project(this.camera)
    prompt.on = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05
    prompt.x = (p.x + 1) / 2
    prompt.y = (1 - p.y) / 2
    // The objective marker would sit on the same pile: the prompt says more.
    if (kind === 'salvage') waypoint.on = false
  }

  /** The rings over machines uplinking to the base (#73): the player's moment to break the line or shoot. */
  private writeUplinks(show: boolean): void {
    let n = 0
    if (show) {
      this.camera.updateMatrixWorld()
      for (const u of this.garrison.units) {
        if (n >= MAX_UPLINKS) break
        if (u.uplinkT <= 0 || !isAlive(u)) continue
        // Under a flyer or a lamp, on a walker's middle: the shout's bubble sits over the head.
        const top = isLight(u) ? u.y - 0.9 : u.y + SPECS[u.kind].height * 0.55
        const p = this.proj.set(u.x, top, u.z).project(this.camera)
        uplinks.on[n] = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 ? 1 : 0
        uplinks.x[n] = Math.min(0.97, Math.max(0.03, (p.x + 1) / 2))
        uplinks.y[n] = Math.min(0.95, Math.max(0.08, (1 - p.y) / 2))
        uplinks.frac[n] = Math.min(1, u.uplinkT / UPLINK_S)
        n++
      }
    }
    uplinks.n = n
  }

  /**
   * Health bars over heads (#74): the nearest defenders that are hurt, tagged,
   * fighting or near, and that the camera can see. Bosses have the big bar.
   */
  private writeBars(show: boolean): void {
    let n = 0
    if (show && !hud.scoped) {
      const cam = this.camera.position
      const g = this.fortress.grid
      const near: Array<{ u: Unit; d: number }> = []
      for (const u of this.garrison.units) {
        if (!isAlive(u) || u.state === 'dormant' || u.boss || u.gripped) continue
        const d = Math.hypot(u.x - this.player.x, u.z - this.player.z)
        if (d > BAR_FAR_M) continue
        if (!(u.hp < u.maxHp || u.tagged || u.state === 'combat' || d < BAR_NEAR_M)) continue
        near.push({ u, d })
      }
      near.sort((a, b) => a.d - b.d)
      this.camera.updateMatrixWorld()
      for (const { u } of near) {
        if (n >= MAX_BARS) break
        const top = u.y + SPECS[u.kind].height + 0.25
        if (!hasLineOfSight(g, cam.x, cam.y, cam.z, u.x, top, u.z)) continue
        const p = this.proj.set(u.x, top, u.z).project(this.camera)
        if (p.z >= 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) continue
        bars.x[n] = (p.x + 1) / 2
        bars.y[n] = (1 - p.y) / 2
        bars.frac[n] = Math.max(0, u.hp / u.maxHp)
        bars.size[n] = Math.max(0.75, Math.min(1.25, 10 / Math.max(1, Math.hypot(u.x - cam.x, top - cam.y, u.z - cam.z))))
        bars.machine[n] = camKind(u.kind) === 'human' ? 0 : 1
        n++
      }
    }
    bars.n = n
  }

  private writeCallouts(dt: number): void {
    this.shouts = this.shouts.filter(s => (s.t -= dt) > 0 && this.garrison.units[s.id]?.state !== 'dead')
    this.camera.updateMatrixWorld()
    let n = 0
    for (const s of this.shouts) {
      const u = this.garrison.units[s.id]!
      const p = this.proj.set(u.x, u.y + SPECS[u.kind].height + 0.7, u.z).project(this.camera)
      callouts.on[n] = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 ? 1 : 0
      callouts.x[n] = (p.x + 1) / 2
      callouts.y[n] = (1 - p.y) / 2
      callouts.line[n] = s.line
      n++
    }
    callouts.n = n
  }

  /** A sniper round is ending a boss: its orbit is shown when the kill lands. */
  private bossCam = false
  /** The training ground's lessons, gates and ghost (only there). */
  private training: TrainingDirector | null = null
  private offReplay: (() => void) | null = null
  private offZoom: (() => void) | null = null
  /** What the training ground counts: rounds, heat, zoom, beacons. */
  private sniperKills = 0
  private rocketsFired = 0
  private overheats = 0
  private wasHot = false
  private zooms = 0
  private sabotaged = 0
  /** Supplies picked up, bodies burnt, ropes shot (the round-4 lessons). */
  private suppliesTaken = 0
  private burnsDone = 0
  private ropesShot = 0
  /** The scope's zoom: an index into SCOPE_ZOOMS. */
  private scopeZoom = 0

  /** Zoom the scope a notch in (+1) or out (−1); `wrap` cycles (the touch chip). */
  private zoomStep(dir: number, wrap = false): void {
    const n = SCOPE_ZOOMS.length
    const next = wrap ? (this.scopeZoom + dir + n) % n : Math.min(n - 1, Math.max(0, this.scopeZoom + dir))
    if (next === this.scopeZoom) return
    this.scopeZoom = next
    this.zooms++
    mirror('zoom', SCOPE_ZOOMS[next]!)
    emit('zoomed', { level: next })
  }

  /** Every defender whose place is in this training room is down (#109); false for a room without any. */
  private roomCleared(room: number): boolean {
    if (room < 0) return false
    const here = this.garrison.units.filter(u => roomAt(u.homeX) === room)
    return here.length > 0 && here.every(u => !isAlive(u))
  }

  /** The training ground, each step: lessons, gates, the demo's glyph, a seen mech sent back. */
  private stepTraining(dt: number): void {
    const tr = this.training
    if (!tr) return
    const p = this.player
    const ev = tr.step({
      x: p.x, y: p.y, z: p.z, bladeKills: this.stats.bladeKills, sniperKills: this.sniperKills, rockets: this.rocketsFired,
      overheats: this.overheats, zooms: this.zooms, sabotaged: this.sabotaged, piles: this.stats.piles,
      supplies: this.suppliesTaken, burns: this.burnsDone, ropes: this.ropesShot,
      cleared: this.roomCleared(tr.state.room),
      stocked: this.supplies.every(s => s.taken || !wants(s, this.arsenal, this.armor, this.loadout.rockets))
    }, dt)
    for (const e of ev) {
      if (e.type === 'done') {
        haptic('reward')
        emit('lessonDone', { room: e.room })
      }
      // The rope and flame rooms hand out what their lesson needs, whatever was spent before.
      if (e.type === 'enter') {
        const lesson = TRAINING_ROOMS[e.room]!.lesson
        if (lesson === 'rope') this.ropesLeft = Math.max(this.ropesLeft, this.loadout.ropes)
        if (lesson === 'burn') this.fuelLeft = Math.max(this.fuelLeft, this.loadout.fuel)
        // The supply room (#111): everything is spent (the strip blinks dry), so the crate's refill shows.
        if (lesson === 'supply') {
          this.arsenal.sniperMag = 0
          this.arsenal.sniperReserve = 0
          this.arsenal.minigunBelt = 0
        }
      }
    }
    // The demo's control: its glyph pulses while the ghost does it.
    const h = tr.hint()
    if (h) {
      this.coach.recalled.add(h)
      this.coach.until[h] = Math.max(this.coach.until[h], this.coach.time + 0.5)
    }
    // Seen: back to the room's door, the room as it was.
    if (this.garrison.units.some(u => u.state === 'combat' && u.state as string !== 'dead')) {
      tr.resetRoom((x, z, yaw) => {
        p.x = p.px = x
        p.z = p.pz = z
        const floor = heightAt(this.fortress.grid, x, z)
        p.y = p.py = floor > VOID ? floor : 0
        p.vx = p.vz = 0
        p.yaw = p.pyaw = yaw
        p.boxed = false
        p.crouched = false
        this.cam.yaw = yaw
        this.armor.hp = this.armor.max
        this.looting = null
        this.sabotaging = null
        if (this.dragId >= 0) this.dropBody()
      })
      emit('trainingReset', {})
    }
    const s = tr.state
    const room = s.room
    const lesson = room >= 0 ? TRAINING_ROOMS[room]!.lesson : ''
    hud.training.on = true
    if (hud.training.room !== room) hud.training.room = room
    const done = s.done.filter(Boolean).length
    if (hud.training.done !== done) hud.training.done = done
    hud.training.total = s.done.length
    // The hologram loops by itself; the button plays it again from the start.
    const replay = room >= 0 && !s.done[room]
    if (hud.training.replay !== replay) hud.training.replay = replay
    const why = lesson === 'salvage' && !s.done[room]
    if (hud.training.scrapWhy !== why) hud.training.scrapWhy = why
  }

  /** The scope held on one unit: which, and for how long. */
  private tagId = -1
  private tagT = 0
  private tagHit = makeShotHit()
  /** The body being dragged (a unit id, −1 none), and one within reach. */
  private dragId = -1
  private dragOffer = -1

  /** Hold the scope on a defender for TAG_S: it is tagged. */
  private stepTag(dt: number): void {
    let id = -1
    if (hud.scoped && hud.phase === 'play') {
      const cam = this.cam
      const c = Math.cos(cam.pitch)
      const fx = Math.sin(cam.yaw) * c
      const fy = Math.sin(cam.pitch)
      const fz = Math.cos(cam.yaw) * c
      const cp = this.camera.position
      const h = castShot(this.fortress.grid, this.garrison.units, cp.x, cp.y, cp.z, fx, fy, fz, SHOT_RANGE, this.tagHit)
      if (h.unit >= 0) {
        const u = this.garrison.units[h.unit]!
        if (!u.tagged && u.state !== 'dead' && u.state !== 'reserve') id = u.id
      }
    }
    if (id !== this.tagId) { this.tagId = id; this.tagT = 0 }
    if (id >= 0) {
      this.tagT += dt
      if (this.tagT >= TAG_S && tagUnit(this.garrison, id)) {
        emit('tagged', { id })
        this.tagId = -1
        this.tagT = 0
      }
    }
    mirror('tagging', id >= 0 ? Math.min(1, this.tagT / TAG_S) : 0)
  }

  /** The body within reach to drag, or the one in tow. */
  private bodyInReach(): number {
    const p = this.player
    let best = -1
    let bestD = DRAG_REACH
    for (const u of this.garrison.units) {
      if (u.state !== 'dead' || u.hidden || u.found || u.deadT < u.hold + 0.8) continue
      if (u.kind !== 'guard' && u.kind !== 'sentry') continue
      if (u.death === 'burst' || Math.abs(u.y - p.y) > 1.2) continue
      const d = Math.hypot(u.x - p.x, u.z - p.z)
      if (d < bestD) { bestD = d; best = u.id }
    }
    return best
  }

  /** Grab a body, or let go of the one in tow (tucked away if a container is at hand). */
  private actDrag(): void {
    if (this.dragId >= 0) { this.dropBody(); return }
    if (this.dragOffer < 0) return
    this.dragId = this.dragOffer
    this.dragOffer = -1
    this.player.boxed = false
    emit('drag', { on: true })
  }

  private dropBody(): void {
    const u = this.garrison.units[this.dragId]
    this.dragId = -1
    if (!u) return
    if (u.rag) { u.rag.pin = null; wakeRagdoll(u.rag) }
    // Against a container (a tall cover block): in it goes, and it stays hidden.
    const g = this.fortress.grid
    const cx = toCell(u.x)
    const cz = toCell(u.z)
    let tuck = false
    for (let dz = -1; dz <= 1 && !tuck; dz++) {
      for (let dx = -1; dx <= 1 && !tuck; dx++) {
        if (!inGrid(g, cx + dx, cz + dz) || cellKind(g, cx + dx, cz + dz) !== CellKind.Cover) continue
        if (cellHeight(g, cx + dx, cz + dz) - heightAt(g, u.x, u.z) >= COVER_H - 0.1) tuck = true
      }
    }
    if (tuck) {
      u.hidden = true
      this.fx.particles.sparks(u.x, u.y + 0.5, u.z, '#9d8cff', 8, 2, 0.2)
    }
    emit('drag', { on: false, hidden: tuck })
  }

  /** The body in tow follows behind the mech. */
  private stepDrag(): void {
    const p = this.player
    if (this.dragId >= 0) {
      const u = this.garrison.units[this.dragId]!
      // Anything but walking lets go.
      if (p.mode !== 'ground' || this.weaponUp() || p.sprinting || this.strike || u.found || hud.phase !== 'play') { this.dropBody(); return }
      const bx = p.x - Math.sin(p.yaw) * DRAG_BEHIND
      const bz = p.z - Math.cos(p.yaw) * DRAG_BEHIND
      u.px = u.x; u.pz = u.z; u.py = u.y; u.pyaw = u.yaw
      // It slides along behind, but not into a wall or over an edge.
      const under = heightAt(this.fortress.grid, bx, bz)
      if (under > VOID && Math.abs(under - p.y) < 0.7) { u.x = bx; u.z = bz }
      // A ragdoll hangs from the mech's hand by its pelvis; the rest trails (#64).
      if (u.rag) {
        u.rag.pin = { x: u.x, y: heightAt(this.fortress.grid, u.x, u.z) + 0.55, z: u.z }
        wakeRagdoll(u.rag)
      }
      const floor = heightAt(this.fortress.grid, u.x, u.z)
      if (floor > VOID) u.y = floor
      u.yaw = p.yaw
      this.dragOffer = -1
    } else {
      this.dragOffer = p.mode === 'ground' && !this.offer && !this.strike && !this.lootOffer && this.beaconOffer < 0 && hud.phase === 'play' ? this.bodyInReach() : -1
    }
    // A body in tow is heavy: half pace.
    p.speedMul = this.loadout.speed * (this.dragId >= 0 ? DRAG_SLOW : 1)
    mirror('drag', this.dragId >= 0 ? 'drop' : this.dragOffer >= 0 ? 'grab' : '')
  }

  /** Where the mech stood stripping its first pile. */
  private checkpoint: { x: number; y: number; z: number; yaw: number } | null = null
  /** Start on the perch with no drop-in (a retry), maybe from the checkpoint. */
  private quickStart = false
  private resumeAt: { x: number; y: number; z: number; yaw: number } | null = null

  /** Repair kits, ammo crates and the pouches the fallen dropped (#76, #101); exploding barrels (#78). */
  private supplies: Supply[] = []
  private barrels: Barrel[] = []
  private supplyView!: SupplyView
  private ropeGeo = new CylinderGeometry(0.04, 0.04, 1, 6)
  private ropeMat = new MeshBasicMaterial({ color: '#7ff4ff', toneMapped: false })

  private dropPouch(x: number, y: number, z: number): void {
    const pouches = this.supplies.filter(s => s.kind === 'pouch' && !s.taken)
    if (pouches.length >= MAX_POUCHES) pouches[0]!.taken = true
    this.supplies.push({ kind: 'pouch', x: x + 0.4, y: heightAt(this.fortress.grid, x + 0.4, z) > VOID ? heightAt(this.fortress.grid, x + 0.4, z) : y, z, taken: false })
  }

  /** Walk over a kit, a crate or a pouch: it is the mech's, if it wants it. */
  private stepSupplies(): void {
    const p = this.player
    const s = supplyUnderfoot(this.supplies, p.x, p.y, p.z, this.arsenal, this.armor, this.loadout.rockets)
    if (!s) return
    // It is the mech's at once (nobody else takes it); what is in it lands
    // when it has flown into its bar on the HUD (#111).
    s.taken = true
    this.suppliesTaken++
    this.supplyView.fly(s)
    this.fx.particles.sparks(s.x, s.y + 0.5, s.z, s.kind === 'kit' ? '#5dff9a' : '#ffd23f', 12, 3, 0.25)
    emit('pickup', { kind: s.kind })
  }

  /** A supply has flown into its bar: what is in it is the mech's now (#111). */
  private landSupply(s: Supply): void {
    take(s, this.arsenal, this.armor, this.loadout.rockets)
    if (s.kind === 'crate') this.fuelLeft = Math.min(this.loadout.fuel, this.fuelLeft + 2)
    vital.armor = this.armor.hp / this.armor.max
    emit('supplyIn', { kind: s.kind })
  }

  /** A point a little in front of the camera that sits over a HUD element on screen (#111), or in front of the mech. */
  private hudPoint(selector: string, out: Vector3): Vector3 {
    const el = typeof document !== 'undefined' ? document.querySelector(selector) : null
    const r = el?.getBoundingClientRect()
    const cam = this.camera
    if (!r || r.width === 0) return out.set(this.player.x, this.player.y + 1.4, this.player.z)
    const w = window.innerWidth || 1
    const h = window.innerHeight || 1
    const nx = ((r.left + r.width / 2) / w) * 2 - 1
    const ny = -(((r.top + r.height / 2) / h) * 2 - 1)
    out.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(1.4).add(cam.position)
    return out
  }

  /** A barrel lit by a round, a blast or a neighbour goes up (#78). */
  private stepBarrels(dt: number): void {
    if (this.barrels.length === 0) return
    const g = this.fortress.grid
    for (const b of stepBarrels(this.barrels, g, dt)) {
      const y = b.y + 0.7
      this.fx.explosion(b.x, y, b.z, b.y)
      // No camera for what a barrel takes (#85): it is not the mech's shot.
      this.killBy = 'rocket'
      this.killHead = false
      const res = blast(this.garrison, g, b.x, y, b.z, -1, BARREL_RADIUS, BARREL_POWER)
      for (const d of this.garrison.units) {
        if (d.rag && d.state === 'dead' && !d.hidden && d.deadT >= d.hold) blastRagdoll(d.rag, b.x, y, b.z, BARREL_RADIUS * 1.3, 1 / 60)
      }
      for (const id of res.hurt) alarmUnit(this.garrison, id, b.x, b.z)
      // The mech, if it stood too near and nothing was in between.
      const p = this.player
      const d = Math.hypot(p.x - b.x, p.z - b.z)
      if (d < BARREL_RADIUS && hasLineOfSight(g, b.x, y, b.z, p.x, p.y + 1.2, p.z)) this.hurt(barrelHurt(d), b.x, b.z)
      // A bang nobody can place: they wonder, then come to look.
      wonderAt(this.garrison, b.x, b.z, BARREL_EARSHOT)
      emit('blast', { x: b.x, y, z: b.z, weak: false })
      haptic('blast')
      this.shake = Math.max(this.shake, Math.max(0.25, 1.2 - d / 30))
      this.flushGarrison()
    }
  }

  /** The ghost at the last known position, and where that is. */
  private ghost!: Rig
  private ghostMat!: MeshBasicMaterial
  private lkp = { x: 0, y: 0, z: 0, yaw: 0, crouched: false, set: false }
  private ghostPose: MechPose = restPose()

  /** Where the mech was last seen, and whether somebody is out looking for it there. */
  private stepGhost(dt: number): void {
    const gar = this.garrison
    const p = this.player
    let seen = false
    for (const u of gar.units) if (u.sees && u.state !== 'dead') { seen = true; break }
    if (seen) Object.assign(this.lkp, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, crouched: p.crouched, set: true })
    let hunting = false
    if (this.lkp.set && !seen) {
      for (const u of gar.units) {
        if (u.state !== 'suspicious' && u.state !== 'search' && u.state !== 'combat') continue
        if (u.lured || Math.hypot(u.seenX - this.lkp.x, u.seenZ - this.lkp.z) > 1.5) continue
        hunting = true
        break
      }
    }
    const g = this.ghost
    g.root.visible = hunting && hud.phase === 'play'
    if (!g.root.visible) return
    g.root.position.set(this.lkp.x, this.lkp.y, this.lkp.z)
    g.root.rotation.y = this.lkp.yaw
    const s = this.ghostPose
    s.time = this.time
    s.crouch = this.lkp.crouched ? 1 : 0
    poseMech(g, s)
    this.ghostMat.opacity = 0.32 + 0.12 * Math.sin(this.time * 4)
    void dt
  }

  private fadeMech(k: number): void {
    const f = Math.round(k * 20) / 20
    if (f === this.mechFade) return
    const was = this.mechFade
    this.mechFade = f
    for (const m of [this.rig.material, this.rig.glowMaterial]) {
      const see = f > 0
      if (see !== was > 0) { m.transparent = see; m.needsUpdate = true }
      m.opacity = 1 - 0.55 * f
      m.depthWrite = f < 0.5
    }
    if (this.rig.outline) this.rig.outline.visible = f < 0.15
  }

  /** The mech rides (or hops off, or onto) the dog: where both are this frame. */
  private ride(r: { dx: number; dy: number; dz: number; air: boolean }): void {
    this.rideX = r.dx
    this.lift = r.dy
    this.rideZ = r.dz
    this.riding = !r.air && (Math.abs(r.dy) > 0.05 || Math.hypot(r.dx, r.dz) > 0.05)
    const d = this.dogAt
    this.dog.root.visible = d.visible
    this.dog.root.position.set(d.x, d.y, d.z)
    this.dog.root.rotation.y = d.yaw
    const s = this.dogPose
    s.time = this.time
    s.fold = d.fold
    s.run = d.run
    s.stride = d.stride
    s.thrust = d.thrust
    poseRobodog(this.dog, s)
    // The jets: a flicker of exhaust under the board, and dust where it is low.
    if (d.visible && d.thrust > 0.3 && Math.random() < 0.6) {
      const back = d.fold > 0.5 ? 0 : 0.62
      for (const side of [-1, 1]) {
        const jx = d.x + Math.cos(d.yaw) * side * 0.52 - Math.sin(d.yaw) * back
        const jz = d.z - Math.sin(d.yaw) * side * 0.52 - Math.cos(d.yaw) * back
        this.fx.particles.emit({ x: jx, y: d.y - 0.45, z: jz, vy: -2.5 * d.fold, vx: -Math.sin(d.yaw) * 2 * (1 - d.fold), vz: -Math.cos(d.yaw) * 2 * (1 - d.fold), color: '#5fe9ff', size: 0.22, sizeEnd: 0.02, life: 0.3, drag: 2 })
      }
    }
  }

  /** Pull a scripted camera in toward its target past anything solid between them. */
  private clearCine(c: CinePose): void {
    // A shot from below what it looks at would come in through the floor: it keeps above it.
    const ground = heightAt(this.fortress.grid, c.x, c.z)
    if (ground !== VOID && c.y < ground + 0.8) c.y = ground + 0.8
    // From a little over the target (it is often a point on the floor).
    const ox = c.tx
    const oy = c.ty + 0.6
    const oz = c.tz
    const dx = c.x - ox
    const dy = c.y - oy
    const dz = c.z - oz
    const len = Math.hypot(dx, dy, dz)
    if (len < 0.5) return
    const h = raycast(this.fortress.grid, ox, oy, oz, dx / len, dy / len, dz / len, len)
    if (!h.hit || h.t < 0.05) return
    const t = Math.max(0.4, h.t - 0.45)
    c.x = ox + (dx / len) * t
    c.y = oy + (dy / len) * t
    c.z = oz + (dz / len) * t
  }

  /** A press during a scripted shot: cut to its end. */
  private skipCine(): void {
    const c = this.cine
    if (!c) return
    if (c.kind === 'intro') {
      if (!c.landed) { c.landed = true; emit('land', { drop: 4 }) }
      this.lift = this.rideX = this.rideZ = 0
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
      const py = heightAt(f.grid, f.insert.x, f.insert.z)
      // In on the jet board, standing on its deck; off with a hop onto the
      // perch; the board peels away and climbs out of sight.
      // The way in flies through nothing solid (#105): worked out once.
      this.approach ??= findApproach(f.grid, f.insert.x, py, f.insert.z, f.insert.facing)
      introFrame(this.dogAt, this.riderAt, k, f.insert.x, py, f.insert.z, f.insert.facing, this.approach.approach, this.approach.high, this.approach.reach)
      this.ride(this.riderAt)
      introCam(out, k, f.insert.x, py, f.insert.z, f.insert.facing, this.centre.x, this.centre.z, follow, this.lift)
      if (!c.jumped && k >= RIDER_JUMP) { c.jumped = true; emit('jump', {}) }
      if (!c.landed && k >= DROP_LANDED) {
        c.landed = true
        this.fx.rings.spawn(f.insert.x, py + 0.08, f.insert.z, 3.4, PAL.glowCyan, 0.55)
        this.fx.particles.sparks(f.insert.x, py + 0.2, f.insert.z, '#d9ccff', 16, 5, 0.2)
        this.shake = Math.max(this.shake, 0.45)
        haptic('blast')
        emit('land', { drop: 4 })
      }
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'outro') {
      const py = heightAt(f.grid, f.extract.x, f.extract.z)
      // The dog gallops in on its jets, lies down into a board beside the
      // mech, the mech hops on, and the board climbs away with it.
      const ox = this.player.x
      const oz = this.player.z
      outroFrame(this.dogAt, this.riderAt, k, ox, py, oz, this.player.yaw)
      this.ride(this.riderAt)
      outroCam(out, k, ox + this.rideX * 0.55, py, oz + this.rideZ * 0.55, this.player.yaw, this.baseFov, this.lift)
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
      // The round flies on out of the far side for a moment, in slow time.
      if (c.t < EXIT_S) {
        const len = Math.hypot(c.hx - c.ox, c.hy - c.oy, c.hz - c.oz) || 1
        const dx = (c.hx - c.ox) / len
        const dy = (c.hy - c.oy) / len
        const dz = (c.hz - c.oz) / len
        const s = 0.3 + (c.t / EXIT_S) * 2.6
        this.fx.showBullet(c.hx + dx * s, c.hy + dy * s, c.hz + dz * s, dx, dy, dz)
      } else this.fx.hideBullet()
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
      if (c.boss) orbitCam(out, c.t, u.x, u.y + 1.6, u.z, c.yaw, 8.5, 2.6, 0.32, this.baseFov * 0.75)
      else orbitCam(out, c.t, u.x, u.y + 1.1, u.z, c.yaw, 4.2, 1.1, 0.7, this.baseFov * 0.7)
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
      // Odyssey's ring: white while it notices, yellow while it looks, red when sure.
      const stage = u.state === 'combat' ? 2 : u.detect >= SUSPECT_AT || u.state === 'search' || (u.state === 'suspicious' && !u.lured) ? 1 : 0
      const level = stage === 2 ? 1 : stage === 1 ? Math.max(0.08, (u.detect - SUSPECT_AT) / (1 - SUSPECT_AT)) : u.detect / SUSPECT_AT
      if (stage === 0 && level < 0.08) continue
      const rank = stage + level
      // Keep the strongest few: replace the weakest once the list is full.
      let slot = n
      if (n === MAX_THREATS) {
        slot = 0
        for (let k = 1; k < MAX_THREATS; k++) if (threats.stage[k]! + threats.level[k]! < threats.stage[slot]! + threats.level[slot]!) slot = k
        if (threats.stage[slot]! + threats.level[slot]! >= rank) continue
      } else {
        n++
      }
      threats.angle[slot] = angleDelta(this.cam.yaw, headingTo(x, z, u.x, u.z))
      threats.level[slot] = level
      threats.stage[slot] = stage
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
    lookCam(this.cam, i.lookDX, i.lookDY, i.turn, dt, lookSensitivity.value * (hud.scoped ? scopeSensitivity.value : 1), this.camera.fov, this.baseFov)
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
    const follow = placeCam(this.cam, g, x, y, z, eyeHeight(p), a.current, this.baseFov, this.loadout.scopeFov / SCOPE_ZOOMS[this.scopeZoom]!, dt)
    this.cam.yaw -= sway.yaw + jx
    this.cam.pitch -= sway.pitch + kick + jy

    // A scripted shot takes the camera; otherwise it follows the mech.
    const fp = this.followPose
    fp.x = follow.x; fp.y = follow.y; fp.z = follow.z
    fp.tx = follow.tx; fp.ty = follow.ty; fp.tz = follow.tz
    fp.fov = follow.fov
    const scripted = this.stepCine(dt, fp, x, y, z)
    // A scripted shot never looks through a wall (#105): its camera comes in
    // along its line toward what it looks at until nothing stands between.
    if (scripted) this.clearCine(this.cinePose)
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
    this.rig.root.position.set(x + this.rideX, y + this.lift, z + this.rideZ)
    this.rig.root.rotation.y = yaw
    this.rig.root.visible = inside < 0.6
    // Folding into the disguise (#111): the mech spins, squats and shrinks
    // into itself while the disguise's pieces fly out of its chest.
    const was = this.morph
    this.morph = Math.max(0, Math.min(1, this.morph + (this.player.boxed ? dt : -dt) / MORPH_S))
    if (this.morph > 0) {
      const fold = Math.min(1, this.morph / 0.6)
      const e = fold * fold * (3 - 2 * fold)
      this.rig.root.scale.set(1 - 0.6 * e, 1 - 0.8 * e, 1 - 0.6 * e)
      this.rig.root.rotation.y = yaw + e * Math.PI * 2
      if (this.morph > 0.7) this.rig.root.visible = false
    } else if (was > 0) this.rig.root.scale.setScalar(1)
    if ((was < 0.3 && this.morph >= 0.3) || (was > 0.6 && this.morph <= 0.6)) {
      sfx('clang', 0, 0.6)
      this.fx.particles.sparks(x, y + 1.2, z, '#5fe9ff', 14, 3.5, 0.18)
    }
    // Pressed close by a wall, the camera has craned over the mech's shoulder:
    // the mech fades out of its own way.
    this.fadeMech(scripted ? 0 : follow.fade)
    const striking = this.strike
    this.bladeOut += (((striking || this.offer) ? 1 : 0) - this.bladeOut) * Math.min(1, dt * 14)
    const s = this.pose
    s.time = this.time
    s.stride = p.stride
    // A cable is walked, not slid along: the legs step at its pace.
    s.speed = p.mode === 'ground' || p.mode === 'cable' ? p.speed01 : 0
    // Down: it folds where it stands.
    s.crouch = this.armor.down ? Math.min(1, Math.max(p.crouch, this.downT / MECH_KNEEL_S)) : p.crouch
    s.down = this.armor.down ? Math.max(1e-3, this.downT) : 0
    s.sprint = p.mode === 'ground' ? p.sprint : 0
    s.boxed = p.box
    // Stripping a pile: down on one knee, both hands in the scrap.
    s.loot = this.looting ? Math.min(1, this.looting.t / 0.2) * Math.min(1, (SALVAGE_S - this.looting.t) / 0.15 + 0.2) : 0
    if (this.sabotaging) s.loot = Math.min(1, this.sabotaging.t / 0.2)
    if (this.looting) s.crouch = Math.max(s.crouch, s.loot)
    s.aim = striking || this.armor.down ? 0 : this.cam.aim
    s.aimPitch = this.cam.pitch
    s.weapon = a.current
    s.recoil = a.recoil
    s.spin = a.spin
    s.reload = reloadProgress(a)
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
    s.air = p.mode === 'air' || (this.lift > 0.05 && !this.riding) ? 1 : 0
    // Surfing the board: knees bent, weight low.
    if (this.riding) s.crouch = Math.max(s.crouch, 0.35)
    poseMech(this.rig, s)

    // A drone with a hole in its shell trails smoke; an overheated Goliath steams from its vents.
    this.smokeT -= dt
    if (this.smokeT <= 0) {
      this.smokeT = 0.12
      for (const u of this.garrison.units) {
        if (u.kind !== 'goliath' || u.overheat <= 0 || u.state === 'dead') continue
        const bx = u.x - Math.sin(u.yaw) * 3
        const bz = u.z - Math.cos(u.yaw) * 3
        this.fx.particles.emit({ x: bx, y: u.y + 1.6, z: bz, vy: 2.2, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, color: '#ffd9c4', size: 0.5, sizeEnd: 1.4, life: 1.2, drag: 0.5 })
      }
      for (const u of this.garrison.units) {
        if (u.kind !== 'drone' || u.state === 'dead' || u.hp >= SPECS.drone.hp) continue
        this.fx.particles.emit({ x: u.x, y: u.y + 0.1, z: u.z, vy: 0.9, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, color: '#3b3355', size: 0.22, sizeEnd: 0.55, life: 1.1, drag: 0.6 })
      }
    }

    // The disguise unfolds out of the mech, and folds back into it (#111).
    this.hideBox.visible = morphDisguise(this.hideBox, Math.max(0, (this.morph - 0.15) / 0.85))
    if (this.hideBox.visible) {
      this.hideBox.position.set(x, y, z)
      this.hideBox.rotation.y = yaw
    }

    this.stepGhost(dt)
    this.training?.update(dt, this.time, this.camera)
    this.stepTag(dt)
    this.stepDrag()
    this.supplyView.update(this.supplies, this.barrels, this.time)
    for (const s of this.supplyView.stepFlights(dt, (s) => this.hudPoint(s.kind === 'kit' ? '[data-testid="armor"]' : '[data-testid="ammo"]', this.flyTo))) this.landSupply(s)
    for (let k = 0; k < this.beaconViews.length; k++) {
      const b = this.garrison.beacons[k]!
      poseBeacon(this.beaconViews[k]!, b.state, b.lit, this.time)
    }

    // The piles still lying there glint now and then.
    this.salvageView.update(dt, this.time)
    this.sparkleT -= dt
    if (this.sparkleT <= 0) {
      this.sparkleT = 0.35
      const open = this.piles.filter(q => !q.taken)
      const q = open[Math.floor(this.time * 7) % Math.max(1, open.length)]
      if (q) this.fx.particles.emit({ x: q.x + (Math.random() - 0.5) * 0.8, y: q.y + 0.7, z: q.z + (Math.random() - 0.5) * 0.8, vy: 1.2, color: '#ffd27a', size: 0.12, sizeEnd: 0.02, life: 0.8, drag: 1 })
    }

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
    const floor = heightAt(g, x + this.rideX, z + this.rideZ)
    this.shadow.position.set(x + this.rideX, floor + 0.03, z + this.rideZ)
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
    this.writeCallouts(dt)
    this.writePrompt(playing && !scripted)
    this.drawLasers()
    this.writeUplinks(playing && !scripted)
    this.writeBars(playing && !scripted)
    this.writeWaypoint(x, z, playing && !scripted)
  }

  /** Where the objective is on screen, for the HUD's marker. */
  private writeWaypoint(x: number, z: number, show: boolean): void {
    let wx = 0
    let wy = 0
    let wz = 0
    let has = false
    // The training ground: each room's own goal, or nothing.
    const tw = this.training ? this.training.waypoint() : null
    if (this.training) {
      if (tw) { wx = tw.x; wy = tw.y; wz = tw.z; has = true }
    } else if (this.objective === 'extract') {
      const e = this.fortress.extract
      wx = e.x
      wy = heightAt(this.fortress.grid, e.x, e.z) + 1.2
      wz = e.z
      has = true
    } else if (this.objective === 'salvage') {
      // The nearest pile still lying there.
      const p = nearestPile(this.piles, x, z)
      if (p) { wx = p.x; wy = p.y + (p.big ? 2.2 : 1.6); wz = p.z; has = true }
    }
    this.waypointDist = has ? Math.hypot(wx - x, wz - z) : 0
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
    this.training?.dispose()
    this.offReplay?.()
    this.offZoom?.()
    this.mesh.dispose()
    this.decor.dispose()
    this.sky.dispose()
    this.garrisonView.dispose()
    this.fx.dispose()
    this.strikeMark.material.dispose()
    this.offHelp?.()
    hud.hints = []
    app.setTimeScale(1)
    disposeDisguise(this.hideBox)
    for (const v of this.beaconViews) disposeBeacon(v)
    this.ghost.mesh.geometry.dispose()
    this.ghostMat.dispose()
    this.supplyView.dispose()
    this.ropeGeo.dispose()
    this.ropeMat.dispose()
    this.laserGeo.dispose()
    this.laserMat.dispose()
    this.flame.geometry.dispose()
    this.flameMat.dispose()
    this.ashGeo.dispose()
    this.ashMat.dispose()
    this.slagMat.dispose()
    this.ghost.material.dispose()
    this.ghost.glowMaterial.dispose()
    this.dog.mesh.geometry.dispose()
    this.dog.material.dispose()
    this.dog.glowMaterial.dispose()
    this.beacon.geometry.dispose()
    ;(this.beacon.material as MeshBasicMaterial).dispose()
    this.salvageView.dispose()
    this.hook.geometry.dispose()
    ;(this.hook.material as MeshBasicMaterial).dispose()
    ;(this.rope.material as MeshBasicMaterial).dispose()
    this.rope.geometry.dispose()
    this.rig.mesh.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
  }
}
