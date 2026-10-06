import {
  PerspectiveCamera, Sprite, SpriteMaterial, AdditiveBlending, Vector3, Mesh, CylinderGeometry, MeshBasicMaterial, DoubleSide, Group,
  BufferAttribute, BufferGeometry, Line, LineBasicMaterial, RingGeometry
} from 'three'
import { getRenderer, fovForAspect } from '../engine/renderer'
import { app, newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { consumeEdges, type Input } from '../engine/input'
import { input as sharedInput, inputClock } from '../engine/inputState'
import { emit, on } from '../bus'
import { gun, hud, mirror, runHudTickers, setPhase, threats, vital, waypoint, MAX_THREATS, callouts, MAX_CALLOUTS, prompt, bars, MAX_BARS, uplinks, MAX_UPLINKS, quipPop, type PromptKind, type TrainingShout } from '../state/hud'
import { god } from '../state/god'
import { QUIP_SHOW_S, makeQuips, pickQuip } from './quips'
import { PathChevrons } from '../fx/pathChevrons'
import type { QuipId } from '../audio/voiceCatalog'
import { CELL, VOID, cableSpan, ceilingAt, heightAt, raycast, hasLineOfSight, toCell, inGrid, cellKind, cellHeight, CellKind, shadeAt, Shade } from '../world/grid'
import type { Fortress, PostKind } from '../world/fortress'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildDecor, type DecorMesh } from '../world/decor'
import { buildSky, type Sky } from '../world/sky'
import { ringTexture } from '../world/textures'
import { FloorMarkers, makeBlobShadow } from '../fx/markers'
import { CombatFx } from '../fx/combatFx'
import { BulletMarks } from '../fx/bulletMarks'
import { buildRopeLine, type RopeLine } from '../fx/ropeLine'
import type { Rig } from '../models/kit'
import { muzzleWorld, buildMech, poseMech, restPose, MECH_HEIGHT, MECH_HEIGHT_CROUCH, MECH_SCALE, type MechPose , MECH_KNEEL_S, MECH_DOWN_S } from '../models/mech'
import { PAL } from '../models/palette'
import { WEAPON_IDS, type WeaponId } from '../data/ids'
import { haptic } from '@/use/useHaptics'
import { lookSensitivity, scopeSensitivity } from '@/use/useLookSensitivity'
import { makePlayer, stepPlayer, eyeHeight, angleDelta, type Player } from './player'
import { makeCam, lookCam, stepCam, placeCam, stickToWorld, camForward, type Cam } from './camera'
import { alertSegments } from './alert'
import {
  SPECS, SUSPECT_AT, igniteUnit, shieldStruck, stepHeard, sabotageBeacon, searchForShooter, noteChange, tagUnit, cutRig, helmetPops, isAlive, stepFallen, estimateShot, shotPassed, IMPACT_M, UPLINK_S, drainEvents, headingTo, killUnit, damageUnit, makeGarrison, noiseAt, hearAt, wonderAt, voidNoise, stepGarrison, alarmUnit, startleUnit, isLight,
  type Garrison, type Target, type Unit, type Change
} from './garrison'
import { GarrisonView } from './garrisonView'
import { SALVAGE_EARSHOT, SALVAGE_S, makePiles, nearestPile, pileInReach, salvageNeed, type Pile } from './salvage'
import { SalvageView } from '../world/salvageView'
import {
  GRAPPLE_EARSHOT, cancelGrapple, canCancel, findGrapple, findGrappleAimed, findRappel, hookAt, startGrapple, stepGrapple, type GrappleRun, type GrappleSpot
} from './grapple'
import { sfx } from '../audio/sfx'
import { STAB_DRAW, VARIANTS, backstabAt, backstabCam, grabWorld, guardToWorld, guardYawAt, lineWorld, markAt, markWorld, pickVariant, type BackstabPose, type BackstabVariant } from './backstab'
import { bodySink, placeKillBody } from './killPose'
import { guardJoints } from '../models/ragdollPose'
import { makeGrappleVisual, type GrappleVisual } from '../fx/grappleHook'
import { castShot, makeShotHit, HEAD_Y } from './hitscan'
import { BASE_DAMAGE, blast, shotDamage } from './damage'
import { SNIPER_MAG, SPREAD, ammoOf, isDry, isLow, makeArsenal, reloadProgress, reserveOf, stepArsenal, type Arsenal, type Trigger } from './weapons'
import { decoySpot, findRopeStrike, findStrike, stepDecoys, type Decoy, type Strike, type StrikeKind } from './melee'
import { HIP_Y, airAt, airCam, airMark, planAir, type AirBeat, type AirPlan } from './airStrike'
import { fireRocket, stepRockets, type Burst, type Rocket } from './rockets'
import { blastRagdoll, nearRay, push, ragdollFrom, wake as wakeRagdoll } from './ragdoll'
import { MARKSMAN_AIM_S, stepFire } from './chaos'
import { hurtArmor, makeArmor, stepArmor, type Armor } from './armor'
import { flow, finishMission, failMission, finishTraining } from '../flow'
import { BANNER_HOLD, clearBanner, showBanner } from '../state/banner'
import {
  AIRSHIP_SCRAP, LAMP_R, ROUND_DAMAGE, ROUND_HIT, SHIP_BLAST_R, TURRET_RANGE, UPLINK_S as SHIP_UPLINK_S, ENGINE_HP,
  blastAirship, enginesUp, flying, hitTurret, launchRocket, makeAirship, shipBlastDamage, stepAirship, stepGuns, stepShipRockets,
  type Airship, type ShipRocket, type TurretId
} from './airship'
import { AirshipView } from './airshipView'
import { AIRSHIP_HALF } from '../models/airship'
import { TrainingDirector } from './trainingDirector'
import { DEMO_GAP_S, DOOR_LINES, atShutDoor, demoLength, entryOf, inPit, lessonStuck, roomAt, victimFrame } from './training'
import { TRAINING_ID, TRAINING_ROOMS, type LessonId } from '../data/fortresses/training'
import { COVER_H } from '../world/fortress'
import { BASE_LOADOUT, type Loadout } from '../data/upgrades'
import { camKind, camZone, chooseKillCam, makeKillCamState, type CamCut, type KillInfo } from './killcam'
import {
  DROP_LANDED, INTRO_CAM_DIST, blendPose, smooth, bulletAt, bulletCam, bulletFlightS, dropHeight, introCam, lessonCam, liftHeight, makeCinePose, orbitCam, outroCam,
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
import { MUZZLE } from '../models/garrison'
import { buildBeacon, disposeBeacon, poseBeacon, BEACON_TOP, type BeaconView } from '../models/beacon'
import { findApproach, findDeparture, introFrame, makeDogFrame, makeRiderFrame, outroFrame, RIDER_JUMP } from './robodog'
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
/** Out of rockets in the rocket room, this long before the mech is back at its door with fresh ones (#146). */
const ROCKET_RESPAWN_S = 1.2
/** The flamethrower on a living person (#148): how far off its heading, and how long the burst. */
const BURN_LIVE_ARC = 0.9
const BURN_LIVE_S = 0.6
/** Bolts a machine's wreck melts down to (#148), added to the haul. */
const BOLTS: Partial<Record<PostKind, number>> = { drone: 4, searchlight: 3, roomba: 5, hound: 5, enforcer: 10, goliath: 24 }
/** A rifle round goes through this many people at most, keeping this share of its damage each time (#152). */
const PIERCE_MAX = 2
const PIERCE_KEEP = 0.8
/** Seconds into going down that WASTED comes up (#150): as the knees give. */
const WASTED_AT = 0.35
/** The flamethrower (#99): how near the body must be, and how long a burn takes. */
const BURN_REACH = 2.4
const BURN_S = 2
/** A jump is heard this near (#95). */
const JUMP_EARSHOT = 6
/** The silenced rifle is heard this near its muzzle (#68). */
const RIFLE_EARSHOT_M = 4
/** From the shoulder point `aimLine` traces from out to each weapon's muzzle (m). */
/** Cover this near the barrel's mouth takes the round, whatever the reticle is on (m). */
const JAMMED_M = 0.6
/** Through the scope the round's trail starts this far ahead of the eye and this far under it (m). */
const SCOPE_TRAIL_M = 1.1
const SCOPE_TRAIL_DROP = 0.14

/** A round's line: from where it is traced (o, d), where it is seen to leave (m), the rig's muzzle (nose). */
interface AimLine { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; mx: number; my: number; mz: number; nose: Vector3 }
/** The assassination from a rope (`sim/airStrike.ts`): its slow time until the mech kneels on the body, and its camera's way back out (real s). */
const AIR_SLOW = 0.45
const AIR_CAM_OUT_S = 0.4
/** The backstab (`sim/backstab.ts`): its time scale from the grab until the body is let go. */
const STAB_SLOW = 0.6
/** Each blow of a blade kill stops time for a beat (real s), at this scale: the hit-stop. */
const HIT_STOP_S = 0.07
const HIT_STOP_SCALE = 0.04
/** A scripted camera pulled in by a wall holds there this long, then eases out at this share of its length a second (#119). */
const CINE_ARM_HOLD_S = 0.5
const CINE_ARM_OUT = 1.5
/** The drop-in's last frame glides into the follow camera over this long (#119). */
const CINE_EXIT_S = 0.6
/** The drop-in looks past the mech into the base this far, at most (#119). */
const INTRO_LOOK_PAST_M = 8
/** A salvage pile's billboard shows from this far (m), in sight (jam build). */
const SALVAGE_SEE_M = 9
/** The next practice decoy, in the training ground. */
const TRAINING_DECOY_COOL_S = 3
/** An aimed decoy lands this near (looking down) to this far (looking level or up) (#115). */
const DECOY_NEAR = 2.5
const DECOY_FAR = 18
const DECOY_PITCH_LOW = -0.9
const DECOY_PITCH_HIGH = 0.3
const AIM_ARC_N = 18
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
  /** The assassination from a rope (`sim/airStrike.ts`). */
  air?: AirPlan
  /** The backstab (`sim/backstab.ts`): which one, where the guard stood and faced, the blows struck so far, whether it has been let go. */
  bs?: { variant: BackstabVariant; gx: number; gy: number; gz: number; gyaw: number; hit: number; released: boolean }
  /** The blade back out of the body (the rope kill). */
  out?: boolean
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
  /** The choreographed backstab (`sim/backstab.ts`), not the quick lunge. */
  full: boolean
  /** The takedown's beats that have already fired. */
  drawn: boolean
  /** Slow time started (the backstab, #172). */
  slowed?: boolean
  pulled: boolean
}

/** The scripted shot that is running, if one is. Timed in REAL seconds. */
type Cine =
  /** The drop-in. */
  | { kind: 'intro'; t: number; dur: number; landed: boolean; jumped: boolean }
  /** The backstab's own camera: it runs as long as the strike does. */
  | { kind: 'stab'; t: number; dur: number }
  /** The rope kill's own camera (`airCam`): `at` is the move's own clock, held at its end while the camera blends out. */
  | { kind: 'air'; t: number; dur: number; plan: AirPlan; at: number }
  /** The extraction. */
  | { kind: 'outro'; t: number; dur: number; banner?: boolean }
  /** The sniper's round in flight, then a moment on what it did. */
  | {
    kind: 'bullet'; t: number; dur: number; hit: boolean
    ox: number; oy: number; oz: number; hx: number; hy: number; hz: number
    nx: number; ny: number; nz: number
    id: number; damage: number; head: boolean; final: boolean; yaw: number
  }
  /** A slow turn round a kill made some other way. */
  | { kind: 'orbit'; t: number; dur: number; id: number; yaw: number; final: boolean; boss?: boolean; wide?: boolean }
  /** No camera move: time just dips for a beat. */
  | { kind: 'dip'; t: number; dur: number }
  /**
   * The blade room's lesson, watched (#158): the mech held at the way in, the
   * camera on the middle of the room, where the hologram takes its guard from
   * behind, twice over. Not skipped before `skipAt` (a second before the
   * first loop ends): the first loop is the point of it.
   */
  | { kind: 'lesson'; t: number; dur: number; x: number; z: number; yaw: number; skipAt: number }

/** The blade room says "Backstab them" again after this many seconds of shooting (#156). */
const SHOUT_EVERY_S = 3
/** The blade room's watched lesson (#158): the camera's distance from the middle and its height. */
/** A shut lesson door says what it wants at most this often (s, #171). */
const DOOR_SAY_S = 4.5
/** It can be skipped from this long before its first loop ends, and blends back to the follow camera over this long. */
const LESSON_SKIP_EARLY_S = 1
const LESSON_OUT_S = 0.7
/** Over the jump room's gap (#154): how high above the mech, how far behind, and how fast it rises (per second). */
const PIT_CAM_UP = 6.5
const PIT_CAM_BACK = 2.2
const PIT_CAM_RATE = 2.5
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
  /** The preview recorder's pick for the next backstab, instead of the dice. */
  nextBackstab: BackstabVariant | null = null
  /** The strike on offer right now. */
  offer: Strike | null = null
  private strike: StrikeRun | null = null
  private garrisonView!: GarrisonView
  private fx!: CombatFx
  /** Where rounds went into bodies and out again (#152). */
  private marks = new BulletMarks()
  private markers = new FloorMarkers()
  /** Seconds since the mech went down. */
  private downT = 0
  /** The backstab's pose (scratch), the last variant played (never twice running), the hit-stop running (real s) and the time scale after it. */
  private bsPose: BackstabPose = backstabAt('neck', 0)
  private lastBackstab: BackstabVariant | null = null
  private hitStop = 0
  private afterStop = 1
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
  /** The grappling hook: its grapnel head and braided cable (`fx/grappleHook.ts`). */
  private hookView!: GrappleVisual
  /** The wall the hook could take from here, and the throw in progress. */
  private hookSpot: GrappleSpot | null = null
  /** A wall top under the mech's look the hook could take (#102), and where a rope would go (#94). */
  private hookAim: GrappleSpot | null = null
  private ropeAim: RopeShot | null = null
  private ropesLeft = 0
  /** The ropes the mech has shot this raid, drawn. */
  /** The lines the rope gun has strung (#164). */
  private ropeLines: RopeLine[] = []
  private grapple: GrappleRun | null = null
  private hookPos = { x: 0, y: 0, z: 0 }
  private handPos = new Vector3()
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
  private burning: { id: number; t: number; seen: number; live: boolean } | null = null
  private burnOffer = -1
  private burnChange: Change | null = null
  private fuelLeft = 0
  private flame!: Mesh
  // Orange-red at the edge, not crimson: added onto the violet dusk a crimson edge turns pink.
  private flameMat = makeFlameMaterial({ core: '#fff0b0', mid: '#ff8a26', edge: '#e2401a' })
  private flameGlowMat = makeFlameMaterial({ core: '#fff0b0', mid: '#ff7a1e', edge: '#d8380f' }, false, true)
  /** A defender's muzzle (scratch), and which of the Enforcer's two guns fires next. */
  private enemyNose = new Vector3()
  private enforcerSide = false
  /** The burn's jet: from the hand (as posed) to the body. */
  private burnFrom = new Vector3()
  private burnTo = new Vector3()
  private lasers: Array<{ id: number; mesh: Mesh }> = []
  private muzzleTmp = new Vector3()
  private aimTmp: AimLine = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1, mx: 0, my: 0, mz: 0, nose: new Vector3() }
  /** Aiming a decoy (#115), and what shows where it will land. */
  private decoyAiming = false
  private aimRing!: Mesh
  private aimArc!: Line
  /** The way out on the ground once nobody is left (jam build), re-laid every half second. */
  private chevrons = new PathChevrons()
  private chevronT = 0
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
    // The Airship circles the later fortresses (#142).
    if (fortress.airship) m.ship = { a: makeAirship(fortress.grid), v: new AirshipView(m.scene, fortress.grid), rockets: [] }
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
    m.flame = new Mesh(new CylinderGeometry(0.85, 0.08, 1, 18, 1, true), m.flameMat)
    // Its warm halo: a wider soft cone riding with it.
    const glow = new Mesh(m.flame.geometry, m.flameGlowMat)
    glow.scale.set(1.9, 1.04, 1.9)
    glow.renderOrder = 3
    m.flame.add(glow)
    m.flame.visible = false
    m.flame.renderOrder = 4
    m.scene.add(m.flame)
    m.aimRing = new Mesh(new RingGeometry(0.55, 0.8, 28).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#5fe9ff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }))
    m.aimRing.visible = false
    m.aimRing.renderOrder = 5
    const arc = new BufferGeometry()
    arc.setAttribute('position', new BufferAttribute(new Float32Array(AIM_ARC_N * 3), 3))
    m.aimArc = new Line(arc, new LineBasicMaterial({ color: '#5fe9ff', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }))
    m.aimArc.visible = false
    m.aimArc.frustumCulled = false
    m.scene.add(m.aimRing, m.aimArc)
    m.scene.add(m.chevrons.mesh)
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
    // The grappling hook: a grapnel head on a braided cable (hidden until
    // thrown). Its group stays at the origin: the cable is drawn in world space.
    m.hookView = makeGrappleVisual()
    m.scene.add(m.hookView.group)
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
      m.trainingStart = m.garrison.units.map(u => structuredClone(u))
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
    hud.training.goalTotal = hud.training.goalDown = 0
    hud.training.shout = ''
    this.scopeZoom = 0
    mirror('zoom', 1)
    mirror('salvageGot', 0)
    mirror('salvageNeed', this.salvageNeed)
    this.newCoach()
    this.lastYaw = this.cam.yaw
    this.lastPitch = this.cam.pitch
    this.offHelp?.()
    // Help (H, the "?" button): the core controls up for a while, and in the
    // training ground the room's hologram again, with what its door wants (#168).
    this.offHelp = on('help', () => {
      const shown = coachHelp(this.coach)
      const tr = this.training
      if (!tr || !shown) return
      tr.replay()
      const room = tr.state.room
      const say = room >= 0 && !tr.state.done[room] ? DOOR_LINES[TRAINING_ROOMS[room]!.lesson] : undefined
      if (say) this.trainingShout(say.line as TrainingShout, say.hint)
    })
    this.offReplay?.()
    this.offReplay = on('trainingReplay', () => { this.training?.replay() })
    this.offCineSkip?.()
    this.offCineSkip = on('cineSkip', () => { if (this.cine && this.cine.t > 0.3) this.skipCine() })
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
    if (this.cine && i.anyPressed && this.cine.t > (this.cine.kind === 'stab' ? 0.7 : this.cine.kind === 'lesson' ? this.cine.skipAt : 0.3)) { this.skipCine(); consumeEdges(i) }
    // The bullet in flight: the world holds its breath. After it lands, and
    // through any kill-cam, nothing moves but the fallen (#91).
    if (this.cine?.kind === 'bullet' && !this.cine.hit) {
      consumeEdges(i)
      return
    }
    if (hud.phase === 'play' && this.killcamOn()) {
      // The rope assassination plays out under its own camera (jam build).
      if (this.strike?.kind === 'air') this.stepStrike(dt)
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
      this.target.visible = !this.strike?.full
      this.stats.time += dt
      if (this.strike) {
        this.stepStrike(dt)
      } else if (this.cine?.kind === 'lesson') {
        // Held while the lesson plays (#158): it stands and watches.
        p.vx = p.vz = 0
        p.speed01 = 0
        consumeEdges(i)
      } else if (this.grapple) {
        this.stepHook(dt)
      } else if (this.burning) {
        this.stepBurn(dt)
      } else if (this.looting) {
        this.stepLoot(dt)
      } else if (this.sabotaging) {
        this.stepSabotage(dt)
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
            this.landSquash = Math.min(1, Math.max(this.landSquash, (e.drop - 0.6) / 2.5))
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
          // Walking is heard close by (#116); only a crouched step is silent.
          else if (!p.crouched && !p.boxed) stepHeard(this.garrison, p.x, p.z)
        }
        if (p.crouched !== wasCrouched) {
          emit('crouch', { crouched: p.crouched })
          if (p.crouched) { this.learn('crouch'); this.crouchesDone++ }
        }
        // On a rope, the drop onto whoever is below (jam build); on the ground, the blade.
        this.offer = p.mode === 'cable'
          ? findRopeStrike(this.garrison, this.fortress.grid, p.x, p.y, p.z, this.cam.yaw)
          : findStrike(this.garrison, this.fortress.grid, p.x, p.y, p.z, this.cam.yaw, p.mode === 'ground')
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
        // At a ledge, facing the drop: the hook goes down it (jam build: sneak down onto a guard).
        if (!this.hookSpot && p.mode === 'ground' && !this.strike) this.hookSpot = findRappel(this.fortress.grid, p.x, p.y, p.z, p.yaw)
        this.aimGear()
        // At the foot of a wall the hook goes straight up it; otherwise at the wall top the mech looks at.
        const hook = this.hookSpot ?? this.hookAim
        if (i.grappleQueued && hook && !this.strike) this.throwHook(hook)
        if (i.ropeQueued && this.ropeAim && !this.strike) this.shootRope(this.ropeAim)
        this.burnOffer = p.mode === 'ground' && !this.strike && this.fuelLeft > 0 && this.dragId < 0 ? this.burnInReach() : -1
        if (i.burnQueued && this.burnOffer >= 0) this.startBurn(this.burnOffer)
        // The decoy (#115): held, it aims (a ring where it will land, moved by the
        // look); let go, it is thrown there. A tap on touch throws it ahead.
        if (i.decoyQueued) {
          if (i.decoyHeld && i.device === 'mouse' && this.decoyCool <= 0 && p.mode === 'ground') this.decoyAiming = true
          else if (!this.decoyAiming) this.throwDecoy()
        }
        if (this.decoyAiming && !i.decoyHeld) {
          this.decoyAiming = false
          const at = this.decoyTarget()
          if (at) this.throwDecoy(at)
        }
        if (this.decoyAiming && (p.mode !== 'ground' || this.decoyCool > 0)) this.decoyAiming = false
        // On the pad with the job done: the line comes down.
        if (this.objective === 'extract' && p.mode === 'ground') {
          const e = this.fortress.extract
          if (Math.hypot(p.x - e.x, p.z - e.z) < EXTRACT_RADIUS) this.startOutro()
        }
      }
      this.stepWeapons(dt)
      this.stepRockets(dt)
      this.stepShip(dt)
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
      this.watchQuips(dt)
      this.stepChevrons(dt)
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
      // WASTED (#150) as the knees go; the screen that says so waits until
      // the mech has stopped moving and the card has played out.
      if (was < WASTED_AT && this.downT >= WASTED_AT) showBanner('wasted')
      if (this.downT > Math.max(MECH_DOWN_S + 0.7, WASTED_AT + BANNER_HOLD.wasted) && flow.modal === '') flow.modal = 'defeat'
    }
    vital.hitAge += dt
    this.landSquash = Math.max(0, this.landSquash - dt * 3.5)
    // Whoever is on fire throws flames off as it runs (#148).
    if (Math.floor(this.time / 0.05) !== Math.floor((this.time - dt) / 0.05)) {
      for (const u of this.garrison.units) {
        if (u.onFire <= 0) continue
        for (let k = 0; k < 2; k++) {
          this.fx.particles.emit({
            x: u.x + (Math.random() - 0.5) * 0.5, y: u.y + 0.6 + Math.random() * 1.0, z: u.z + (Math.random() - 0.5) * 0.5,
            vx: (Math.random() - 0.5) * 0.5, vy: 2 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.5,
            color: k === 0 ? '#ffd27a' : '#ff5a2a', size: 0.6, sizeEnd: 0.1, life: 0.45, drag: 0.8
          })
        }
      }
    }

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
    const ringing = this.beaconOffer >= 0 && this.garrison.beacons[this.beaconOffer]!.state === 'lit'
    mirror('sabotage', this.sabotaging || hud.phase !== 'play' ? '' : this.beaconOffer >= 0 ? (ringing ? 'alarm' : 'beacon') : rig)
    mirror('sabotaging', this.sabotaging ? Math.min(1, this.sabotaging.t / SABOTAGE_S) : 0)
    {
      const gar = this.garrison
      const r = gar.runner >= 0 ? gar.units[gar.runner] : undefined
      const b = r && r.runner >= 0 ? gar.beacons[r.runner] : undefined
      mirror('alarm', gar.alert.chaos && gar.beacons.some(x => x.state === 'lit') ? 3 : b?.state === 'lighting' ? 2 : r ? 1 : 0)
      mirror('alarmLit', b ? b.lit : gar.alert.chaos ? 1 : 0)
    }
    const boss = this.bossFocus >= 0 ? this.garrison.units[this.bossFocus] : undefined
    const ship = this.ship
    if (ship && this.shipFocus > 0 && flying(ship.a)) {
      // The Airship once it has been shot at (#142): its engines, as the bar.
      mirror('bossKind', 'airship')
      mirror('bossHp', ship.a.engines.reduce((n, h) => n + h, 0) / (4 * ENGINE_HP))
      mirror('bossShield', false)
    } else if (boss && boss.boss) {
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

  private stepWeapons(dt: number): void {
    const i = this.input
    const a = this.arsenal
    const p = this.player
    const t = this.trigger
    // Hands are busy on a ladder, a cable, a ledge, or mid-strike.
    const free = p.mode === 'ground' && !this.strike && this.cine?.kind !== 'lesson'
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
    // A trigger pulled on nothing (#145): the dry click, every time.
    if (a.switching <= 0 && isDry(a) && (t.touch ? t.aimReleased : t.firePressed)) emit('dryFire', {})
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
    mirror('ammoLow', !hud.dry && isLow(a))
    mirror('ammoMax', a.current === 'rocket' ? this.loadout.rockets : a.current === 'sniper' ? SNIPER_MAG : 0)
    gun.reload = reloadProgress(a)
    mirror('reloading', gun.reload > 0)
    mirror('overheated', a.overheated)
    mirror('decoys', this.decoyCool <= 0 ? 1 : 0)
    gun.heat = a.heat
    gun.spool = a.spool
  }

  /**
   * Where a round goes and where it is seen to leave (#167). What the
   * reticle is on is what is hit: the round flies the camera's own line, so
   * a guard seen past a pillar's edge is a guard hit, not the pillar. It is
   * seen to leave from the hole in the weapon's barrel (`muzzleWorld`: the
   * rig's muzzle as posed), and its trail runs from there to the hit.
   * Two things still stop it at the weapon: a barrel through a wall (a wall
   * between the body and the muzzle) and a barrel pressed to cover (the way
   * from the muzzle to the mark blocked within `JAMMED_M`): then it flies
   * from the muzzle and meets what is in front of it.
   * Through the scope the rig is hidden and the eye is the weapon's line;
   * the round's trail starts just under it, a little ahead.
   */
  private aimLine(spread: number): AimLine {
    const p = this.player
    const cam = this.cam
    const L = this.aimTmp
    const sway = this.swayNow()
    const yaw = cam.yaw + sway.yaw
    const pitch = cam.pitch + sway.pitch
    const c = Math.cos(pitch)
    let fx = Math.sin(yaw) * c
    let fy = Math.sin(pitch)
    let fz = Math.cos(yaw) * c
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
    // The reticle's line into the world, starting past the mech.
    const cp = this.aimEye
    const eyeY = p.y + eyeHeight(p)
    const skip = Math.max(0, (p.x - cp.x) * fx + (eyeY - cp.y) * fy + (p.z - cp.z) * fz)
    L.ox = cp.x + fx * skip
    L.oy = cp.y + fy * skip
    L.oz = cp.z + fz * skip
    L.dx = fx
    L.dy = fy
    L.dz = fz
    const g = this.fortress.grid
    const h = castShot(g, this.garrison.units, L.ox, L.oy, L.oz, fx, fy, fz, SHOT_RANGE, this.hit)
    const far = h.kind === 'none' ? SHOT_RANGE : h.t
    const hx = L.ox + fx * far
    const hy = L.oy + fy * far
    const hz = L.oz + fz * far
    const w = this.arsenal.current
    const nose = this.rigMuzzle(w, L.ox, L.oy, L.oz)
    L.nose = nose
    if (hud.scoped) {
      const ahead = Math.min(SCOPE_TRAIL_M, Math.max(0, far - 0.3))
      L.mx = L.ox + fx * ahead
      L.my = L.oy + fy * ahead - SCOPE_TRAIL_DROP
      L.mz = L.oz + fz * ahead
      return L
    }
    L.mx = nose.x
    L.my = nose.y
    L.mz = nose.z
    // The body's middle at the weapon's height: a wall between it and the muzzle is a barrel through the wall.
    const bx = p.x
    const by = nose.y
    const bz = p.z
    const bl = Math.hypot(nose.x - bx, nose.z - bz)
    if (bl > 0.05 && raycast(g, bx, by, bz, (nose.x - bx) / bl, 0, (nose.z - bz) / bl, bl).hit) {
      L.ox = bx
      L.oy = by
      L.oz = bz
      L.dx = (nose.x - bx) / bl
      L.dy = 0
      L.dz = (nose.z - bz) / bl
      L.mx = bx + L.dx * 0.2
      L.my = by
      L.mz = bz + L.dz * 0.2
      return L
    }
    // From the muzzle to the mark: cover right in front of the barrel takes the round.
    const ml = Math.hypot(hx - nose.x, hy - nose.y, hz - nose.z)
    if (ml > 0.05) {
      const mx = (hx - nose.x) / ml
      const my = (hy - nose.y) / ml
      const mz = (hz - nose.z) / ml
      if (raycast(g, nose.x, nose.y, nose.z, mx, my, mz, Math.min(JAMMED_M, ml)).hit) {
        L.ox = nose.x
        L.oy = nose.y
        L.oz = nose.z
        L.dx = mx
        L.dy = my
        L.dz = mz
      }
    }
    return L
  }

  /** The weapon's muzzle in the world (the posed rig's), or, without a rig, the line's own start. */
  private rigMuzzle(w: WeaponId, ox: number, oy: number, oz: number): Vector3 {
    const out = this.muzzleTmp
    if (this.rig && muzzleWorld(this.rig, w, out)) return out
    return out.set(ox, oy, oz)
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
    const line = this.aimLine(SPREAD[w])
    const { ox, oy, oz, dx, dy, dz, mx, my, mz } = line
    this.stats.shots++
    this.learn('fire')
    this.bladeRoomShot()
    this.fx.muzzle(mx, my, mz, dx, dy, dz, w)
    haptic(w)
    emit('shot', { weapon: w })
    this.watchAmmo()
    this.shake = Math.max(this.shake, w === 'sniper' ? 0.35 : w === 'rocket' ? 0.5 : 0.12)

    if (w === 'rocket') {
      // A rocket is a body of its own: it leaves the tube's mouth for the mark.
      const tgt = castShot(g, gar.units, ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit)
      const tx = tgt.kind === 'none' ? ox + dx * SHOT_RANGE : tgt.x
      const ty = tgt.kind === 'none' ? oy + dy * SHOT_RANGE : tgt.y
      const tz = tgt.kind === 'none' ? oz + dz * SHOT_RANGE : tgt.z
      const tl = Math.hypot(tx - mx, ty - my, tz - mz)
      if (tl > 0.3) fireRocket(this.rockets, mx, my, mz, (tx - mx) / tl, (ty - my) / tl, (tz - mz) / tl)
      else fireRocket(this.rockets, mx, my, mz, dx, dy, dz)
      this.rocketsFired++
      this.goLoud()
      return
    }
    if (w === 'minigun') this.goLoud()

    const h = castShot(g, gar.units, ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit)
    // The Airship (#142) is not in the grid: a round that meets it first stops there.
    if (this.roundOnShip(ox, oy, oz, dx, dy, dz, h.kind === 'none' ? SHOT_RANGE : h.t, w, mx, my, mz)) return
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
      // A shield guard struck, on the shield or not: up it goes (#151).
      shieldStruck(gar, u.id)
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
      // Armour (#146): the round glances off in sparks; only a blast gets through.
      if (u.armoured) {
        this.fx.tracer(mx, my, mz, h.x, h.y, h.z, w)
        this.fx.particles.sparks(h.x, h.y, h.z, '#ffe98f', 12, 5, 0.22)
        emit('glance', { id: u.id, weapon: w })
        return
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
          // The kill-cam rides it from the rifle's own muzzle (the rig's, seen from outside).
          const n = line.nose
          const dist = Math.hypot(h.x - n.x, h.y - n.y, h.z - n.z)
          const dur = bulletFlightS(dist)
          this.cine = {
            kind: 'bullet', t: cut === 'short' ? dur * SHORT_FROM : 0, dur, hit: false,
            ox: n.x, oy: n.y, oz: n.z, hx: h.x, hy: h.y, hz: h.z, nx: h.nx, ny: h.ny, nz: h.nz,
            id: u.id, damage, head, final, yaw: Math.atan2(n.x - h.x, n.z - h.z)
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
      // A rifle round goes through a person and on (#152).
      if (w === 'sniper') this.roundThrough(u.id, h.x, h.y, h.z, dx, dy, dz, damage, false)
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

  /**
   * A rifle round that has hit unit `id` at a point (#152): a mark where it
   * went in; through a person it comes out the far side (a mark there, a
   * puff of light, no blood) and flies on at four fifths of its damage into
   * whoever stands behind, a second kill for a lined-up pair (or a third).
   * A machine stops it. The first hit alone could have had a kill-cam.
   * `camOut`: the kill-cam already drew this exit.
   */
  private roundThrough(id: number, hx: number, hy: number, hz: number, dx: number, dy: number, dz: number, damage: number, camOut: boolean, depth = 0): void {
    const gar = this.garrison
    const u = gar.units[id]
    if (!u) return
    const human = camKind(u.kind) === 'human'
    const rig = this.garrisonView.rigOf(id)
    if (rig) this.marks.mark(rig, hx, hy, hz, dx, dy, dz, !human)
    if (!human || depth >= PIERCE_MAX) return
    const through = 0.5
    const ex = hx + dx * through
    const ey = hy + dy * through
    const ez = hz + dz * through
    // The way out: the body's back looked for from behind it.
    if (rig) this.marks.mark(rig, hx + dx * 1.2, hy + dy * 1.2, hz + dz * 1.2, -dx, -dy, -dz, false)
    if (!camOut) this.fx.exitShot(hx, hy, hz, dx, dy, dz, through, false)
    const next = castShot(this.fortress.grid, gar.units, ex, ey, ez, dx, dy, dz, SHOT_RANGE, makeShotHit(), id)
    if (next.kind === 'world') {
      this.fx.tracer(ex, ey, ez, next.x, next.y, next.z, 'sniper')
      this.fx.impact(next.x, next.y, next.z, next.nx, next.ny, next.nz, false, 'sniper')
      return
    }
    if (next.kind !== 'unit') {
      this.fx.tracer(ex, ey, ez, ex + dx * 40, ey + dy * 40, ez + dz * 40, 'sniper')
      return
    }
    const v = gar.units[next.unit]!
    this.fx.tracer(ex, ey, ez, next.x, next.y, next.z, 'sniper')
    if (v.armoured) {
      this.fx.particles.sparks(next.x, next.y, next.z, '#ffe98f', 12, 5, 0.22)
      emit('glance', { id: v.id, weapon: 'sniper' })
      return
    }
    const soft = camKind(v.kind) === 'human'
    const head = next.zone === 'head' && soft
    this.fx.impact(next.x, next.y, next.z, next.nx, next.ny, next.nz, soft, 'sniper')
    shieldStruck(gar, v.id)
    const dmg = shotDamage('sniper', v.kind, next.zone, this.loadout.damage.sniper, v.maxHp) * PIERCE_KEEP ** (depth + 1)
    this.stats.hits++
    if (head) this.stats.headshots++
    this.killBy = 'sniper'
    this.killHead = head
    emit('hit', { id: v.id, weapon: 'sniper', zone: next.zone })
    if (v.boss) emit('bossHit', { amount: Math.round(Math.min(dmg, Math.max(0, v.hp))) })
    if (!damageUnit(gar, v.id, dmg, ex, ez)) alarmUnit(gar, v.id, this.player.x, this.player.z)
    this.roundThrough(v.id, next.x, next.y, next.z, dx, dy, dz, dmg, false, depth + 1)
    void damage
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
    // Into the Airship (#142): it is not in the grid, so it is looked for here.
    if (this.ship && flying(this.ship.a)) {
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i]!
        if (!this.onShip(r.x, r.y, r.z)) continue
        this.rockets.splice(i, 1)
        this.rocketBurst({ x: r.x, y: r.y, z: r.z, direct: -1 })
      }
    }
    for (const b of stepRockets(this.rockets, g, this.garrison.units, dt)) this.rocketBurst(b)
  }

  /** A rocket goes off: everyone in the blast, barrels, bodies, the Airship's engines. */
  private rocketBurst(b: Burst): void {
    const g = this.fortress.grid
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
    // The Airship's engines (#142): only a blast hurts them.
    const s = this.ship
    if (s && flying(s.a)) {
      const at = s.v.engines()
      const lost = blastAirship(s.a, at, b.x, b.y, b.z, this.loadout.blastRadius, BASE_DAMAGE.rocket * this.loadout.damage.rocket)
      for (const i of lost) {
        const e = at[i]!
        this.fx.explosion(e.x, e.y, e.z, e.y - 3)
        this.fx.particles.sparks(e.x, e.y, e.z, '#ffd88a', 30, 9, 0.4)
        emit('blast', { x: e.x, y: e.y, z: e.z, weak: true })
      }
      if (Math.hypot(b.x - s.a.x, b.y - s.a.y, b.z - s.a.z) < 25) this.shipFocus = 6
    }
  }

  // ─── The blade and the decoy ───────────────────────────────────────────────

  private startStrike(s: Strike): void {
    const p = this.player
    const u = this.garrison.units[s.id]!
    if (s.kind === 'air') { this.startAssassination(s); return }
    const away = Math.hypot(p.x - u.x, p.z - u.z) || 1
    // From behind or from above, and with kill-cams on, it is the whole
    // backstab, one of three (`sim/backstab.ts`), never the same one twice
    // running: the mech closes to where it begins, behind the target.
    const full = s.kind !== 'strike' && killCamsEnabled.value
    // Otherwise: a blade's length from the target, on the side the mech came from.
    let tx = u.x + ((p.x - u.x) / away) * 0.85
    let tz = u.z + ((p.z - u.z) / away) * 0.85
    let yaw = headingTo(p.x, p.z, u.x, u.z)
    let bs: StrikeRun['bs']
    if (full) {
      const variant = this.nextBackstab ?? pickVariant(this.lastBackstab, Math.random())
      this.nextBackstab = null
      this.lastBackstab = variant
      const k0 = backstabAt(variant, 0, this.bsPose)
      const at = guardToWorld(u.x, u.y, u.z, u.yaw, k0.mx, 0, k0.mz)
      tx = at[0]
      tz = at[2]
      yaw = u.yaw + k0.myaw
      bs = { variant, gx: u.x, gy: u.y, gz: u.z, gyaw: u.yaw, hit: -1, released: false }
    }
    this.strike = {
      id: s.id, kind: s.kind, t: 0, dur: s.kind === 'drop' ? 0.5 : full ? 0.3 : 0.34,
      fx: p.x, fy: p.y, fz: p.z, tx, ty: u.y, tz, yaw, landed: false,
      full, drawn: false, pulled: false, bs
    }
    if (full) {
      // The target is the mech's from this moment: it will not turn round.
      u.gripped = true
      u.held = { grip: 0, arch: 0, limp: 0, kneel: 0 }
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

  /**
   * From a rope onto the target (`sim/airStrike.ts`, after Assassin's Creed
   * Odyssey): one motion from the push off the rope, feet first, the blade
   * arm rising overhead, onto the guard's shoulders as the blade goes into
   * its neck, riding the body down, kneeling on it, up again. Always with its
   * own kill-cam (`airCam`), in slow time until the mech kneels.
   */
  private startAssassination(s: Strike): void {
    const p = this.player
    const u = this.garrison.units[s.id]!
    const g = this.fortress.grid
    const head = u.y + SPECS[u.kind].height - 0.12
    const air = planAir({ x: p.x, y: p.y, z: p.z }, { x: u.x, y: u.y, z: u.z }, head, (x, z) => { const h = heightAt(g, x, z); return h === VOID ? null : h }, u.yaw)
    this.strike = {
      id: s.id, kind: 'air', t: 0, dur: air.total,
      fx: p.x, fy: p.y, fz: p.z, tx: air.end.x, ty: air.end.y, tz: air.end.z, yaw: air.yaw, landed: false,
      full: false, drawn: false, pulled: false, air
    }
    p.cable = null
    p.mode = 'air'
    p.crouched = false
    p.vx = p.vz = p.vy = 0
    p.speed01 = 0
    u.gripped = true
    u.held = { grip: 0, arch: 0, limp: 0, kneel: 0 }
    this.offer = null
    this.learn('blade')
    app.setTimeScale(AIR_SLOW)
    // The camera holds until the mech is on its feet, then blends out (see the end of the move).
    this.cine = { kind: 'air', t: 0, dur: 999, plan: air, at: 0 }
    mirror('cine', true)
    emit('killcam', { kind: 'orbit', final: false })
    emit('strike', { kind: 'air', id: s.id })
    emit('takedown', { beat: 'draw', id: s.id })
  }

  /** A blade kill's blow: time stops for a beat, then runs on at `after`. */
  private hitStopNow(after: number): void {
    this.afterStop = after
    this.hitStop = HIT_STOP_S
    app.setTimeScale(HIT_STOP_SCALE)
  }

  /**
   * The mech lets go of a body it held: dead, it falls as a ragdoll from
   * exactly the pose it was held in (on its knees, arched, turned), with the
   * push it was given (m/s, world); alive, it is simply free again.
   */
  private releaseHeld(id: number, vx: number, vy: number, vz: number): void {
    const u = this.garrison.units[id]
    if (!u) return
    u.held = null
    u.gripped = false
    if (u.state !== 'dead') return
    u.hold = u.deadT
    const rig = this.garrisonView.rigOf(id)
    if (u.rag && rig) {
      u.rag = ragdollFrom(guardJoints(rig))
      u.ragStruck = true
      push(u.rag, -1, vx, vy, vz, 1 / 60)
    }
  }

  /** The assassination's beats, one step (see `startAssassination`). */
  private stepAssassination(s: StrikeRun, dt: number): void {
    const p = this.player
    const u = this.garrison.units[s.id]!
    const air = s.air!
    const beat = airAt(air, s.t)
    const c = this.cine
    if (c?.kind === 'air') c.at = s.t
    if (!s.landed && s.t >= air.hitAt) {
      // The blow: knees onto the shoulders, the blade into the neck.
      s.landed = true
      this.killBy = 'blade'
      this.killHead = true
      killUnit(this.garrison, s.id, u.x - Math.sin(s.yaw), u.z - Math.cos(s.yaw), 'blade')
      // Held up under the mech until it is let go to fold.
      u.hold = 999
      u.fallDir = 1
      u.death = 'front'
      this.stats.bladeKills++
      haptic('blade')
      this.shake = Math.max(this.shake, 0.6)
      this.garrisonView.flash(s.id, PAL.mechBlade, 0.5)
      this.fx.stabThrough(air.mark.x, air.mark.y, air.mark.z, s.yaw)
      this.fx.slash(air.mark.x, air.mark.y - 0.1, air.mark.z, s.yaw)
      emit('takedown', { beat: 'stab', id: s.id })
      this.say('takedown')
      this.flushGarrison()
      this.hitStopNow(AIR_SLOW)
    }
    // The guard's knees give under the weight; then it is let go to fold, pressed down and on.
    if (u.held) u.held.kneel = beat.guardKneel
    if (s.landed && !s.pulled && s.t >= air.releaseAt) {
      s.pulled = true
      this.releaseHeld(s.id, Math.sin(air.yaw) * 1.6, -1.2, Math.cos(air.yaw) * 1.6)
    }
    if (beat.phase === 'kneel' && !s.drawn) {
      // Down on the body: the slow time ends here.
      s.drawn = true
      emit('land', { drop: 0.9 })
      this.afterStop = 1
      if (this.hitStop <= 0) app.setTimeScale(1)
    }
    if (beat.phase === 'kneel' && !s.out && beat.aim < 0.5) {
      s.out = true
      emit('takedown', { beat: 'pull', id: s.id })
    }
    p.x = beat.x
    p.y = beat.y
    p.z = beat.z
    if (beat.phase === 'done') {
      p.vy = 0
      p.airFrom = p.y
      p.mode = 'ground'
      p.crouched = true
      this.hitStop = 0
      app.setTimeScale(1)
      if (!s.pulled) this.releaseHeld(s.id, 0, 0, 0)
      this.strike = null
      // Its camera blends back into the follow camera from here.
      if (c?.kind === 'air') c.dur = c.t + AIR_CAM_OUT_S
    } else p.mode = beat.phase === 'crouch' || beat.phase === 'flight' ? 'air' : 'ground'
    p.yaw += angleDelta(p.yaw, s.yaw) * Math.min(1, dt * 20)
  }

  private stepStrike(dt: number): void {
    const s = this.strike!
    const p = this.player
    p.px = p.x
    p.py = p.y
    p.pz = p.z
    p.pyaw = p.yaw
    s.t += dt
    if (s.kind === 'air') { this.stepAssassination(s, dt); return }
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

  /** A backstab's blow `i` lands (the first kills): its effects and the hit-stop. */
  private stabBlow(s: StrikeRun, i: number): void {
    const bs = s.bs!
    const u = this.garrison.units[s.id]!
    const hit = VARIANTS[bs.variant].hits[i]!
    const m = markWorld(hit.mark, backstabAt(bs.variant, hit.t), bs.gx, bs.gy, bs.gz, bs.gyaw)
    if (u.state !== 'dead') {
      this.killBy = 'blade'
      this.killHead = false
      killUnit(this.garrison, s.id, this.player.x, this.player.z, 'blade')
      // It stays up in the mech's hands until it is let go.
      u.hold = 999
      u.fallDir = 1
      this.stats.bladeKills++
      this.flushGarrison()
    }
    haptic('blade')
    this.shake = Math.max(this.shake, s.kind === 'drop' ? 0.6 : 0.35 + 0.1 * i)
    this.garrisonView.flash(s.id, PAL.mechBlade, 0.45)
    this.fx.stabThrough(m.x, m.y, m.z, u.yaw)
    emit('takedown', { beat: 'stab', id: s.id })
    this.hitStopNow(STAB_SLOW)
  }

  /** The backstab's beats, once the mech has closed in (`sim/backstab.ts`). */
  private stepTakedown(s: StrikeRun): void {
    const p = this.player
    const bs = s.bs!
    const t = s.t - s.dur
    if (t < 0) return
    const v = VARIANTS[bs.variant]
    const bp = backstabAt(bs.variant, t, this.bsPose)
    const at = guardToWorld(bs.gx, bs.gy, bs.gz, bs.gyaw, bp.mx, 0, bp.mz)
    p.x = at[0]
    p.z = at[2]
    p.y = s.ty
    p.yaw = bs.gyaw + bp.myaw
    p.mode = 'ground'
    const u = this.garrison.units[s.id]!
    if (!bs.released) {
      u.yaw = guardYawAt(bs.gyaw, bp)
      if (u.held) {
        u.held.grip = bp.grip
        u.held.arch = bp.arch
        u.held.limp = bp.limp
        u.held.kneel = bp.kneel
      }
    }
    // Slow time from the close-in (#172): the grab, the held blade and the swing are seen.
    if (!s.slowed) { s.slowed = true; app.setTimeScale(STAB_SLOW) }
    if (!s.drawn && t >= v.grabAt) {
      s.drawn = true
      emit('takedown', { beat: 'draw', id: s.id })
      if (s.kind === 'drop') emit('land', { drop: s.fy - s.ty })
    }
    while (bs.hit < bp.hit) this.stabBlow(s, ++bs.hit)
    if (!bs.released && t >= v.release) {
      bs.released = true
      s.pulled = true
      emit('takedown', { beat: 'pull', id: s.id })
      this.say('takedown')
      const shove = guardToWorld(0, 0, 0, guardYawAt(bs.gyaw, bp), v.shove[0], v.shove[1], v.shove[2])
      this.releaseHeld(s.id, shove[0], shove[1], shove[2])
      this.afterStop = 1
      if (this.hitStop <= 0) app.setTimeScale(1)
    }
    if (t >= v.end) this.endTakedown()
  }

  /** The backstab is over (or was skipped): the mech is the player's again. */
  private endTakedown(): void {
    const s = this.strike
    if (!s || !s.full) return
    const bs = s.bs!
    // Skipped before the blow: it lands now, and the body drops.
    if (bs.hit < 0) this.stabBlow(s, (bs.hit = 0))
    if (!bs.released) {
      bs.released = true
      this.releaseHeld(s.id, 0, 0, 0)
    }
    const p = this.player
    p.y = s.ty
    p.vy = 0
    p.airFrom = p.y
    p.mode = 'ground'
    this.hitStop = 0
    this.strike = null
    if (this.cine?.kind === 'stab') this.endCine()
    else app.setTimeScale(1)
  }

  // ─── The alarm beacons ─────────────────────────────────────────────────────

  /**
   * The nearest beacon within reach to put out of action: a working one if
   * nobody can see the mech, a ringing one (#134) whoever is looking; −1 if none.
   */
  private beaconInReach(): number {
    const p = this.player
    const gar = this.garrison
    const seen = gar.units.some(u => u.sees)
    let best = -1
    let bestD = SABOTAGE_REACH
    for (let k = 0; k < gar.beacons.length; k++) {
      const b = gar.beacons[k]!
      if (!(b.state === 'lit' || (b.state === 'ready' && !seen)) || Math.abs(b.y - p.y) > 1) continue
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
    this.say('loot')
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
    const cp = this.aimEye
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
    // The rope is its own key: offered whether or not the hook could take this wall too.
    if (this.ropesLeft > 0) this.ropeAim = findRopeShot(this.fortress.grid, p.x, p.y, p.z, hx, hy, hz, hit.ny, hit.nx, hit.nz)
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
      if (Math.abs(u.y - p.y) > 1.5) continue
      const d = Math.hypot(u.x - p.x, u.z - p.z)
      if (d >= bestD) continue
      // A body or a wreck at the mech's feet; or (#148) a living person in
      // front of it, shield or no shield, but never a boss.
      const dead = u.state === 'dead' && !u.hidden && u.kind !== 'searchlight' && u.deadT >= u.hold + 0.8
      const live = isAlive(u) && camKind(u.kind) === 'human' && !u.boss && !u.gripped && u.onFire <= 0
        && Math.abs(angleDelta(p.yaw, headingTo(p.x, p.z, u.x, u.z))) < BURN_LIVE_ARC
      if (dead || live) { bestD = d; best = u.id }
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
    this.burning = { id, t: 0, seen: 0, live: isAlive(u) }
    this.burnFrom.set(p.x + Math.sin(p.yaw) * 0.8, p.y + 1.4, p.z + Math.cos(p.yaw) * 0.8)
    this.burnTo.set(u.x, u.y + (isAlive(u) ? 1.1 : 0.35), u.z)
    // A living person catches at once and runs (#148); the jet plays a moment.
    if (isAlive(u)) {
      igniteUnit(this.garrison, id, p.x, p.z)
      this.flushGarrison()
    }
    this.burnOffer = -1
    // The fire glows: while it burns it is a thing out of place for whoever sees it.
    noteChange(this.garrison, u.x, u.y, u.z, 'fire')
    this.burnChange = this.garrison.changes[this.garrison.changes.length - 1] ?? null
    // Nothing is spent (#162): every body and every wreck can go, so none has
    // to be dragged about. What a burn costs is its glow, seen from afar.
    this.flame.visible = true
    emit('burn', { beat: 'start' })
  }

  /** The burn's jet, from the posed hand (the weapon is put away) to the body (#99). */
  private placeFlame(): void {
    this.rig.root.updateMatrixWorld(true)
    const hand = this.rig.bones.foreR!.localToWorld(this.burnFrom.set(0, -0.52, 0.04))
    const t = this.burnTo
    const d = this.muzzleTmp.set(t.x - hand.x, t.y - hand.y, t.z - hand.z)
    const len = Math.max(0.5, d.length())
    this.flame.position.set((hand.x + t.x) / 2, (hand.y + t.y) / 2, (hand.z + t.z) / 2)
    this.flame.scale.set(1, len, 1)
    this.flame.quaternion.setFromUnitVectors(UP, d.normalize())
    setFlame(this.flameMat, 0.92, this.time)
    setFlame(this.flameGlowMat, 0.92, this.time)
  }

  /**
   * Burning (#99): the jet on the body for BURN_S. The fire glows: while it
   * burns, a defender that sees it notices a thing out of place and comes to
   * look. Walking away stops it.
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
    // A living person: a short burst sets it alight, and it is off running (#148).
    if (b.live) {
      this.burnTo.set(u.x, u.y + 1.1, u.z)
      if (b.t >= BURN_LIVE_S) { this.burnsDone++; this.endBurn() }
      return
    }
    // The jet runs from the mech's own hand (placed with the pose, `place`) to the body.
    this.burnTo.set(u.x, u.y + 0.35, u.z)
    const hx = this.burnFrom.x
    const hy = this.burnFrom.y
    const hz = this.burnFrom.z
    const tx = this.burnTo.x
    const ty = this.burnTo.y
    const tz = this.burnTo.z
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
    // A machine's parts glow, sag and melt into the slag, wherever they lie.
    this.garrisonView.shatter.melt(u.id)
    const r = new Mesh(this.ashGeo, human ? this.ashMat : this.slagMat)
    const floor = heightAt(this.fortress.grid, u.x, u.z)
    r.position.set(u.x, (floor === VOID ? u.y : floor) + 0.04, u.z)
    r.scale.set(human ? 1 : 1.3, 1, human ? 1 : 1.3)
    this.scene.add(r)
    this.residues.push(r)
    this.fx.particles.sparks(u.x, u.y + 0.3, u.z, human ? '#6f6488' : '#ffb061', 16, 3, 0.3)
    // A machine melted down leaves a few bolts worth taking (#148): a tenth of a pile, more for the big ones.
    if (!human) {
      const bolts = BOLTS[u.kind] ?? 3
      this.stats.salvage += bolts
      emit('bolts', { n: bolts, x: u.x, y: u.y, z: u.z })
    }
    this.burnsDone++
    this.say(human ? 'burnHuman' : 'burnMachine')
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
    // From this platform's edge to the far one's, where the mech walks it,
    // with a piton driven in at each end (#164: the hook's braided line).
    const s = cableSpan(g, r.cable)
    const ex = r.ax + (r.bx - r.ax) * s.ta
    const ez = r.az + (r.bz - r.az) * s.ta
    const fx = r.ax + (r.bx - r.ax) * s.tb
    const fz = r.az + (r.bz - r.az) * s.tb
    const line = buildRopeLine(ex, r.ay + 0.06, ez, fx, r.by + 0.06, fz)
    this.scene.add(line.group)
    this.ropeLines.push(line)
    this.fx.particles.sparks(fx, r.by + 0.3, fz, '#fff1c9', 10, 3, 0.25)
    // A line strung across the base is a thing out of place for whoever sees it.
    noteChange(this.garrison, (r.ax + r.bx) / 2, (r.ay + r.by) / 2 + 0.5, (r.az + r.bz) / 2, 'rope')
    emit('rope', {})
    haptic('tap')
  }

  /**
   * Where an aimed decoy would land (#115): along the look, nearer the lower
   * the look, from DECOY_NEAR to DECOY_FAR, on whatever floor is there (over a
   * wall too: it is lobbed). Null over the void.
   */
  private decoyTarget(): { x: number; y: number; z: number } | null {
    const p = this.player
    const k = Math.min(1, Math.max(0, (this.cam.pitch - DECOY_PITCH_LOW) / (DECOY_PITCH_HIGH - DECOY_PITCH_LOW)))
    const d = DECOY_NEAR + (DECOY_FAR - DECOY_NEAR) * k
    const x = p.x + Math.sin(this.cam.yaw) * d
    const z = p.z + Math.cos(this.cam.yaw) * d
    const y = heightAt(this.fortress.grid, x, z)
    return y === VOID ? null : { x, y, z }
  }

  /**
   * Nobody left (searchlights are no one): gold chevrons on the floor lead to
   * the way out, or first to the nearest pile still needed to open it.
   */
  private stepChevrons(dt: number): void {
    if ((this.chevronT -= dt) > 0) return
    this.chevronT = 0.5
    const clear = !this.training && !this.garrison.units.some(u => isAlive(u) && u.kind !== 'searchlight')
    if (!clear || this.objective === 'done') { this.chevrons.hide(); return }
    const p = this.player
    let tx = this.fortress.extract.x
    let tz = this.fortress.extract.z
    if (this.objective === 'salvage') {
      let best = Infinity
      for (const q of this.piles) {
        if (q.taken) continue
        const d = Math.hypot(q.x - p.x, q.z - p.z)
        if (d < best) { best = d; tx = q.x; tz = q.z }
      }
    }
    if (Math.hypot(tx - p.x, tz - p.z) < 2.5) { this.chevrons.hide(); return }
    this.chevrons.route(this.fortress.grid, p.x, p.z, tx, tz)
  }

  /** The aimed decoy's preview (#115): a ring on the ground where it lands, and the arc it flies. */
  private drawDecoyAim(): void {
    const on = this.decoyAiming && hud.phase === 'play'
    this.aimRing.visible = this.aimArc.visible = on
    if (!on) return
    const p = this.player
    const at = this.decoyTarget()
    const ok = !!at
    const tx = at?.x ?? p.x + Math.sin(this.cam.yaw) * DECOY_FAR
    const tz = at?.z ?? p.z + Math.cos(this.cam.yaw) * DECOY_FAR
    const ty = at?.y ?? p.y
    this.aimRing.position.set(tx, ty + 0.06, tz)
    ;(this.aimRing.material as MeshBasicMaterial).color.set(ok ? '#5fe9ff' : '#ff4060')
    ;(this.aimArc.material as LineBasicMaterial).color.set(ok ? '#5fe9ff' : '#ff4060')
    const pos = this.aimArc.geometry.attributes.position as BufferAttribute
    const hx = p.x + Math.sin(p.yaw) * 0.5
    const hy = p.y + 1.6
    const hz = p.z + Math.cos(p.yaw) * 0.5
    const lift = 1.5 + Math.hypot(tx - hx, tz - hz) * 0.25
    for (let n = 0; n < AIM_ARC_N; n++) {
      const k = n / (AIM_ARC_N - 1)
      pos.setXYZ(n, hx + (tx - hx) * k, hy + (ty + 0.1 - hy) * k + Math.sin(k * Math.PI) * lift, hz + (tz - hz) * k)
    }
    pos.needsUpdate = true
  }

  private throwDecoy(aimed?: { x: number; y: number; z: number }): void {
    if (this.decoyCool > 0 || this.player.mode !== 'ground') return
    const p = this.player
    // Aimed (#115), or thrown ahead; with a wall in the face, dropped at the mech's feet.
    const spot = aimed ?? decoySpot(this.fortress.grid, p.x, p.y, p.z, this.cam.yaw) ?? { x: p.x, y: p.y, z: p.z }
    // The training ground is for practice: the next decoy is ready at once, nearly.
    this.decoyCool = this.training ? TRAINING_DECOY_COOL_S : this.loadout.decoyCooldown
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
        this.say('alarm')
      } else if (e.type === 'calm') {
        emit('calm', { id: e.id })
      } else if (e.type === 'body') {
        this.stats.bodiesFound++
        emit('body', { id: e.id, corpse: e.corpse })
      } else if (e.type === 'kill') {
        const u = gar.units[e.id]!
        // Burnt out (#148): it fell to the fire, seconds after the flame; no camera for that.
        const burnt = !!e.burnt
        const by = burnt ? 'flame' : this.killBy
        this.stats.kills++
        if (by === 'sniper') {
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
          id: e.id, kind: u.kind, by, head: !burnt && this.killHead,
          dist: Math.hypot(u.x - this.player.x, u.z - this.player.z)
        })
        // One round, one head, one down (a person or a drone, #126).
        if (this.killBy === 'sniper' && this.killHead && (camKind(u.kind) === 'human' || u.kind === 'drone')) this.say('headshot')
        // One rocket, two of them.
        if (this.killBy === 'rocket') {
          this.rocketKillsAt = this.rocketKillsAt.filter(t => this.time - t < 0.5)
          this.rocketKillsAt.push(this.time)
          if (this.rocketKillsAt.length >= 2) this.say('multiKill')
        }
        // The Commander (and his tank) are not the job any more, but their
        // fall is still the raid's big moment: it always gets the camera.
        const final = (u.kind === 'commander' || u.kind === 'goliath') && this.targetsLeft() === 0
        if (final) this.stats.bossDown = true
        // The Commander is down and the tank is still asleep: not for long.
        if (u.kind === 'commander' && gar.units.some(o => o.kind === 'goliath' && o.state === 'dormant')) this.finaleT = 2.2
        // The sniper's kill-cam was decided when the round was fired.
        const bossLast = !!u.boss && final
        if (!burnt && (this.killBy !== 'sniper' || (bossLast && this.bossCam)) && !this.cine && hud.phase === 'play') {
          this.bossCam = false
          const info: KillInfo = {
            by: this.killBy, head: false, final, time: this.stats.time, dist: Math.hypot(u.x - this.player.x, u.z - this.player.z),
            moving: u.speed01, zone: 'other', boss: !!u.boss, kind: camKind(u.kind), stealth: this.quietRaid()
          }
          const cut = this.killBy === 'sniper' ? 'boss' : this.rollKillcam(info)
          if (cut === 'boss') {
            // A boss's last blow: its own long, slow orbit.
            this.cine = { kind: 'orbit', t: 0, dur: BOSS_ORBIT_S, id: e.id, yaw: this.cam.yaw + Math.PI * 0.6, final: true, boss: true }
            mirror('cine', true)
            emit('killcam', { kind: 'orbit', final: true })
            app.setTimeScale(KILLCAM_SLOW * 0.7)
          } else if (cut !== 'none') {
            // The blade and the last kill get the camera; a burst or a blast
            // in the middle of a fight only gets the slow beat.
            // A person cut down by the mini-gun falls as a body, on camera; only
            // machines come apart (#173).
            if (this.killBy === 'minigun' && u.rag && !u.boss && cut === 'full') {
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
        // The shell leaves the end of the barrel.
        const nose = this.enemyMuzzle(u, this.enemyNose)
        if (nose) this.fx.muzzle(nose.x, nose.y, nose.z, Math.sin(u.yaw + u.look), 0.1, Math.cos(u.yaw + u.look), 'rocket')
        else this.fx.muzzle(u.x + Math.sin(u.yaw + u.look) * 3.4, u.y + 2.1, u.z + Math.cos(u.yaw + u.look) * 3.4, Math.sin(u.yaw + u.look), 0.1, Math.cos(u.yaw + u.look), 'rocket')
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
        this.say('allClear')
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
      } else if (e.type === 'decoyShot') {
        // One round into the decoy (#171), out of the unit's own barrel.
        const u = gar.units[e.id]!
        const floor = heightAt(this.fortress.grid, e.x, e.z)
        const ty = (floor > VOID ? floor : u.y) + 1.0
        const nose = this.enemyMuzzle(u, this.enemyNose)
        const ox = nose ? nose.x : u.x + Math.sin(u.yaw) * 0.6
        const oy = nose ? nose.y : u.y + SPECS[u.kind].eye - 0.2
        const oz = nose ? nose.z : u.z + Math.cos(u.yaw) * 0.6
        const len = Math.hypot(e.x - ox, ty - oy, e.z - oz) || 1
        this.fx.muzzle(ox, oy, oz, (e.x - ox) / len, (ty - oy) / len, (e.z - oz) / len, 'minigun')
        this.fx.tracer(ox, oy, oz, e.x, ty, e.z, 'minigun')
        this.fx.particles.sparks(e.x, ty, e.z, '#7ff4ff', 10, 3, 0.25)
        emit('decoyShot', { id: e.id, kind: u.kind })
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

  /**
   * The muzzle of a defender's weapon in the world, from its posed rig (the
   * table in `models/garrison.ts`); null for one that has no gun drawn.
   */
  private enemyMuzzle(u: Unit, out: Vector3): Vector3 | null {
    const rig = this.garrisonView.rigOf(u.id)
    if (!rig) return null
    const m = u.kind === 'roomba' ? MUZZLE.roomba
      : u.kind === 'goliath' ? MUZZLE.goliath
        : u.kind === 'enforcer' ? (this.enforcerSide = !this.enforcerSide) ? MUZZLE.enforcerL : MUZZLE.enforcerR
          : u.role === 'marksman' ? MUZZLE.marksman : MUZZLE.rifle
    const bone = rig.bones[m[0]]
    if (!bone) return null
    rig.root.updateMatrixWorld(true)
    return bone.localToWorld(out.set(m[1], m[2], m[3]))
  }

  /** A round comes the mech's way: the flash, the line, and what it costs. */
  private incoming(id: number, damage: number): void {
    const u = this.garrison.units[id]!
    const p = this.player
    const spec = SPECS[u.kind]
    // From the barrel of the weapon it aims (its rig, as posed); a body with no gun drawn, from in front of it.
    const nose = this.enemyMuzzle(u, this.enemyNose)
    const ox = nose ? nose.x : u.x + Math.sin(u.yaw) * (spec.radius + 0.5)
    const oy = nose ? nose.y : u.y + spec.eye * 0.85
    const oz = nose ? nose.z : u.z + Math.cos(u.yaw) * (spec.radius + 0.5)
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
    // The cheat panel's god mode: nothing lands.
    if (god.on) return
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
    return !!c && ((c.kind === 'bullet' && c.hit) || c.kind === 'orbit' || c.kind === 'dip' || c.kind === 'air')
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
    // A way out through nothing solid (#118): the mech turns to it, the dog comes in by the open side.
    const way = findDeparture(this.fortress.grid, p.x, p.y, p.z, p.yaw)
    p.yaw = p.pyaw = way.yaw
    this.outroWay = way
    this.cine = { kind: 'outro', t: 0, dur: 4.4 }
    this.objective = 'done'
    this.beacon.visible = false
    mirror('objective', 'done')
    setPhase('outro')
    emit('extracting', {})
    this.say('extract')
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
    // ...and on, into whoever stands behind (#152): no second camera for that.
    const cl = Math.hypot(c.hx - c.ox, c.hy - c.oy, c.hz - c.oz) || 1
    this.roundThrough(u.id, c.hx, c.hy, c.hz, (c.hx - c.ox) / cl, (c.hy - c.oy) / cl, (c.hz - c.oz) / cl, c.damage, true)
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
      // From the shot's last frame into the follow camera, never a cut (#119).
      Object.assign(this.exitFrom, this.lastView)
      this.exitT = 0
      this.lift = 0
      this.rideX = this.rideZ = 0
      this.riding = false
      this.dog.root.visible = false
      markSeen('intro')
      setPhase('play')
      emit('deployed', {})
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
      if (o) at(this.offer!.kind === 'air' ? 'assassinate' : 'strike', o.x, o.y + SPECS[o.kind].height + 0.35, o.z)
      else if (this.beaconOffer >= 0) { const b = gar.beacons[this.beaconOffer]!; at(b.state === 'lit' ? 'silence' : 'sabotage', b.x, b.y + 2.6, b.z) }
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
    // A pile in sight, not yet in reach (jam build): its billboard shows from afar, dimmed, to find it by.
    prompt.far = false
    if (show && kind === '' && !this.looting && !this.grapple && !this.burning && !this.strike) {
      const p = this.player
      let best: (typeof this.piles)[number] | null = null
      let bestD = SALVAGE_SEE_M
      for (const q of this.piles) {
        if (q.taken) continue
        const d = Math.hypot(q.x - p.x, q.z - p.z)
        if (d < bestD && Math.abs(q.y - p.y) < 3 && hasLineOfSight(this.fortress.grid, p.x, p.y + 1.6, p.z, q.x, q.y + 0.8, q.z)) { best = q; bestD = d }
      }
      if (best) { at('salvage', best.x, best.y + 1.0, best.z); prompt.far = true }
    }
    mirror('prompt', kind)
    // The hook and the rope are two keys: when both can take this wall, both are offered.
    mirror('prompt2', kind === 'hook' && this.ropeAim ? 'rope' : '')
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

  /**
   * CM-07 says line `id` (#126), if it may (`pickQuip`: rare, never the same
   * line twice in a minute): whispered while nobody is onto it, out loud
   * once it is seen. The bubble pops over its head; `voice.ts` plays the take.
   */
  private say(id: QuipId): void {
    if (hud.phase !== 'play' && hud.phase !== 'outro') return
    const spotted = hud.chaos || this.garrison.units.some(u => isAlive(u) && u.state === 'combat')
    const r = pickQuip(this.quips, id, this.time, spotted)
    if (!r) return
    quipPop.seq++
    quipPop.id = r.id
    quipPop.whisper = r.whisper
    this.quipUntil = this.time + QUIP_SHOW_S
    emit('quip', { id: r.id, whisper: r.whisper })
  }

  /** What CM-07 notices by watching rather than by an event (#126), a few times a second. */
  private watchQuips(dt: number): void {
    this.quipCheck -= dt
    if (this.quipCheck > 0) return
    this.quipCheck = 0.25
    const units = this.garrison.units
    // A guard walks over to the decoy.
    const lured = units.filter(u => isAlive(u) && u.lured).length
    if (lured > this.luredBefore) this.say('decoy')
    this.luredBefore = lured
    // A guard inspected the disguise and walked on, none the wiser.
    const inspecting = new Set(units.filter(u => isAlive(u) && u.inspect).map(u => u.id))
    for (const id of this.inspectedBefore) {
      const u = units[id]!
      if (!inspecting.has(id) && isAlive(u) && u.state !== 'combat' && this.player.boxed) this.say('disguise')
    }
    this.inspectedBefore = inspecting
    // Nearly scrap, and nobody even looking: time for some maintenance.
    const calm = !hud.chaos && !units.some(u => isAlive(u) && (u.state === 'combat' || u.state === 'search' || u.state === 'suspicious'))
    if (this.armor.hp > 0 && this.armor.hp / this.armor.max < 0.3 && calm) this.say('lowHealth')
  }

  /** The gun nearly dry (#126): said once each time it runs low, again only after a refill. */
  private watchAmmo(): void {
    const a = this.arsenal
    const w = a.current
    const low = isLow(a)
    if (low && !this.lowAmmoSaid[w]) {
      this.lowAmmoSaid[w] = true
      this.say('lowAmmo')
      // Two soft ticks as the line is crossed (#145); the strip turns amber.
      if (!isDry(a)) emit('ammoLow', { weapon: w })
    }
    if (!low) this.lowAmmoSaid[w] = false
  }

  /** The bubble over CM-07's head, while it lasts. */
  private writeQuip(): void {
    const on = this.time < this.quipUntil && (hud.phase === 'play' || hud.phase === 'outro')
    if (!on) { quipPop.on = false; return }
    const p = this.player
    const v = this.proj.set(p.x + this.rideX, p.y + this.lift + (p.crouched ? 2.3 : 2.9), p.z + this.rideZ).project(this.camera)
    quipPop.on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
    quipPop.x = Math.min(0.92, Math.max(0.08, (v.x + 1) / 2))
    quipPop.y = Math.min(0.9, Math.max(0.12, (1 - v.y) / 2))
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
  private offCineSkip: (() => void) | null = null
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
  /** CM-07's one-liners (#126): when it last spoke, how long its bubble stays, what it has noticed. */
  private quips = makeQuips()
  private quipUntil = -1
  private quipCheck = 0
  private lowAmmoSaid: Partial<Record<WeaponId, boolean>> = {}
  private luredBefore = 0
  private inspectedBefore = new Set<number>()
  private rocketKillsAt: number[] = []
  /** The scripted camera's arm (#119): how far out it may be, for which shot, and how long it holds in. */
  private cineArm = Infinity
  private armCine: Cine | null = null
  private cineHold = 0
  /** The glide out of the drop-in (#119): from where, and how far along. */
  private exitFrom: CinePose = makeCinePose()
  /** The drop-in's wide shot, placed once (#119). */
  private introShot: { dist: number; turn: number } | null = null
  /** The camera as last shown. */
  private lastView: CinePose = makeCinePose()
  /**
   * Where the player's own camera is: the follow camera behind the shoulder,
   * whatever the screen shows (a kill-cam, a scripted shot, the trailer's
   * director). The reticle's ray starts here, so a round leaves the weapon
   * along the line the player aims down, never along a director's view.
   */
  readonly aimEye = new Vector3()
  private exitT = Infinity
  /** The way out found when the outro starts (#118). */
  private outroWay = { yaw: 0, turn: 0, reachIn: 1, reachOut: 1 }
  /** The training ground's defenders as they started: a room whose lesson can no longer be done is set back to this. */
  private trainingStart: Unit[] = []
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

  /** DEV CHEAT (#116): straight to training room `i`, the rooms before it done and open. */
  cheatTrainingRoom(i: number): void {
    const tr = this.training
    if (!tr || i < 0 || i >= TRAINING_ROOMS.length) return
    tr.skipTo(i)
    const e = entryOf(i)
    const p = this.player
    p.x = p.px = e.x
    p.z = p.pz = e.z
    const floor = heightAt(this.fortress.grid, e.x, e.z)
    p.y = p.py = floor > VOID ? floor : 0
    p.vx = p.vz = p.vy = 0
    p.mode = 'ground'
    p.yaw = p.pyaw = Math.PI / 2
    this.cam.yaw = Math.PI / 2
  }

  /** Every defender whose place is in this training room is down (#109); false for a room without any. */
  // ─── The Airship (#142) ────────────────────────────────────────────────────

  /** A point inside the Airship: its hull (an ellipsoid), an engine or a turret. */
  private onShip(x: number, y: number, z: number): boolean {
    const s = this.ship!
    const l = s.v.toHull(x, y, z, this.shipTmp)
    if ((l.x / AIRSHIP_HALF.x) ** 2 + (l.y / AIRSHIP_HALF.y) ** 2 + (l.z / AIRSHIP_HALF.z) ** 2 <= 1) return true
    for (const e of s.v.engines()) if (Math.hypot(e.x - x, e.y - y, e.z - z) < 1.4) return true
    for (const id of ['F', 'B'] as const) if (s.v.turret(id).distanceTo(this.shipTmp.set(x, y, z)) < 1.1) return true
    return false
  }

  /**
   * A round toward the Airship, nearer than `maxT`: a turret takes it (and
   * may be knocked out); the hull and the engines are armour, and it glances
   * off. True if the Airship took it.
   */
  private roundOnShip(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, w: WeaponId, mx: number, my: number, mz: number): boolean {
    const s = this.ship
    if (!s || !flying(s.a)) return false
    const sphere = (cx: number, cy: number, cz: number, r: number): number => {
      const lx = ox - cx
      const ly = oy - cy
      const lz = oz - cz
      const b = lx * dx + ly * dy + lz * dz
      const c = lx * lx + ly * ly + lz * lz - r * r
      const disc = b * b - c
      if (disc < 0) return Infinity
      const t = -b - Math.sqrt(disc)
      return t > 0 ? t : Infinity
    }
    let best = maxT
    let what: TurretId | 'armour' | null = null
    for (const id of ['F', 'B'] as const) {
      const t = s.v.turret(id)
      const d = sphere(t.x, t.y, t.z, 1.0)
      if (d < best && s.a.turrets[id] > 0) { best = d; what = id }
    }
    for (const e of s.v.engines()) {
      const d = sphere(e.x, e.y, e.z, 1.3)
      if (d < best) { best = d; what = 'armour' }
    }
    // The hull: the ray in the hull's own frame, against its ellipsoid.
    const o = s.v.toHull(ox, oy, oz, new Vector3())
    const p2 = s.v.toHull(ox + dx, oy + dy, oz + dz, new Vector3())
    const hx = AIRSHIP_HALF.x
    const hy = AIRSHIP_HALF.y
    const hz = AIRSHIP_HALF.z
    const ux = (p2.x - o.x) / hx
    const uy = (p2.y - o.y) / hy
    const uz = (p2.z - o.z) / hz
    const sx = o.x / hx
    const sy = o.y / hy
    const sz = o.z / hz
    const qa = ux * ux + uy * uy + uz * uz
    const qb = 2 * (sx * ux + sy * uy + sz * uz)
    const qc = sx * sx + sy * sy + sz * sz - 1
    const disc = qb * qb - 4 * qa * qc
    if (disc >= 0) {
      const t = (-qb - Math.sqrt(disc)) / (2 * qa)
      if (t > 0 && t < best) { best = t; what = 'armour' }
    }
    if (!what) return false
    const hx2 = ox + dx * best
    const hy2 = oy + dy * best
    const hz2 = oz + dz * best
    this.fx.tracer(mx, my, mz, hx2, hy2, hz2, w)
    this.shipFocus = 6
    if (what === 'armour') {
      this.fx.particles.sparks(hx2, hy2, hz2, '#ffe98f', 10, 5, 0.22)
      emit('glance', { id: -1, weapon: w })
      return true
    }
    this.fx.impact(hx2, hy2, hz2, -dx, -dy, -dz, false, w)
    emit('hit', { id: -1, weapon: w, zone: 'armor' })
    this.stats.hits++
    if (hitTurret(s.a, what, BASE_DAMAGE[w] * this.loadout.damage[w])) {
      const t = s.v.turret(what)
      this.fx.explosion(t.x, t.y, t.z, t.y - 3)
      emit('blast', { x: t.x, y: t.y, z: t.z, weak: true })
    }
    return true
  }

  /**
   * The Airship, one step: its loop; its searchlight on a quiet base; on full
   * alert its turrets' bursts and its pods' rockets, every one leaving from
   * the barrel or the tube it is drawn from; its rockets' blasts; its fall.
   */
  private stepShip(dt: number): void {
    const s = this.ship
    if (!s) return
    const { a, v } = s
    const p = this.player
    const was = flying(a)
    stepAirship(a, dt)
    this.shipFocus = Math.max(0, this.shipFocus - dt)
    const g = this.fortress.grid
    const chest = { x: p.x, y: p.y + 1.5, z: p.z }
    // The searchlight: the mech held in its pool in the open, and the base is told.
    if (flying(a) && !this.garrison.alert.chaos) {
      const inPool = Math.hypot(p.x - a.lampX, p.z - a.lampZ) < LAMP_R && !p.boxed && hud.concealed !== 2
      a.seenT = inPool ? a.seenT + dt : Math.max(0, a.seenT - dt * 0.5)
      if (a.seenT >= SHIP_UPLINK_S) {
        a.seenT = 0
        noiseAt(this.garrison, this.target, p.x, p.z, 200, 'loud')
        this.goLoud()
      }
    }
    const clear = (o: Vector3): boolean => hasLineOfSight(g, o.x, o.y, o.z, chest.x, chest.y, chest.z)
    const inRange: Record<TurretId, boolean> = { F: false, B: false }
    for (const id of ['F', 'B'] as const) {
      const t = v.turret(id)
      inRange[id] = Math.hypot(t.x - chest.x, t.y - chest.y, t.z - chest.z) < TURRET_RANGE && clear(t)
    }
    const podAt = v.socket(a.tube < 4 ? 'podL' : 'podR', a.tube % 4, new Vector3())
    const guns = stepGuns(a, this.garrison.alert.chaos && hud.phase === 'play', inRange, Math.hypot(podAt.x - p.x, podAt.z - p.z) < 90 && clear(podAt), dt)
    for (const r of guns.rounds) {
      // From the barrel's own mouth (#142): the flash, the tracer and the kick together.
      const o = v.socket(r.id === 'F' ? 'turretF' : 'turretB', r.barrel, this.shipTmp)
      const hit = Math.random() < ROUND_HIT * (p.crouched ? 0.7 : 1)
      const miss = hit ? 0.2 : 1.6
      const tx = chest.x + (Math.random() - 0.5) * miss * 2
      const ty = chest.y + (Math.random() - 0.5) * miss
      const tz = chest.z + (Math.random() - 0.5) * miss * 2
      const d = Math.hypot(tx - o.x, ty - o.y, tz - o.z) || 1
      this.fx.muzzle(o.x, o.y, o.z, (tx - o.x) / d, (ty - o.y) / d, (tz - o.z) / d, 'minigun')
      this.fx.tracer(o.x, o.y, o.z, tx, ty, tz, 'minigun')
      v.fired(r.id)
      emit('incoming', { id: -1, kind: 'drone', hit })
      if (hit) this.hurt(Math.round(ROUND_DAMAGE * this.garrison.threat.damage), o.x, o.z)
    }
    if (guns.rocket >= 0) {
      // From the tube's mouth, at where the mech will be; a ring where it lands.
      const o = v.socket(guns.rocket < 4 ? 'podL' : 'podR', guns.rocket % 4, this.shipTmp)
      const tx = p.x + p.vx * 0.6
      const tz = p.z + p.vz * 0.6
      const fl = heightAt(g, tx, tz)
      const r = launchRocket(s.rockets, o.x, o.y, o.z, tx, (fl === VOID ? p.y : fl) + 0.3, tz)
      const sp = Math.hypot(r.vx, r.vy, r.vz) || 1
      this.fx.muzzle(o.x, o.y, o.z, r.vx / sp, r.vy / sp, r.vz / sp, 'rocket')
      this.markers.spawn(r.tx, r.tz, SHIP_BLAST_R, r.life)
      emit('telegraph', { x: r.tx, z: r.tz, radius: SHIP_BLAST_R, dur: r.life })
    }
    for (const r of s.rockets) {
      if (Math.random() < dt * 30) this.fx.particles.emit({ x: r.x, y: r.y, z: r.z, vx: 0, vy: 0.4, vz: 0, color: '#b9a8d8', size: 0.5, sizeEnd: 1.1, life: 0.6, drag: 1.2 })
    }
    for (const r of stepShipRockets(s.rockets, dt)) {
      const fl = heightAt(g, r.x, r.z)
      this.fx.explosion(r.x, r.y, r.z, fl === VOID ? r.y - 1 : fl)
      emit('blast', { x: r.x, y: r.y, z: r.z, weak: false })
      const dmg = shipBlastDamage(Math.hypot(p.x - r.x, p.y + 1 - r.y, p.z - r.z))
      if (dmg > 0 && hud.phase === 'play') this.hurt(Math.round(dmg * this.garrison.threat.damage), r.x, r.z)
      for (const o of this.barrels) if (o.live && Math.hypot(o.x - r.x, o.z - r.z) < SHIP_BLAST_R) ignite(o, 0.1)
      this.shake = Math.max(this.shake, Math.max(0.15, 0.9 - Math.hypot(r.x - p.x, r.z - p.z) / 30))
    }
    // A dead engine smokes.
    if (flying(a) || a.crashT < 2) {
      v.engines().forEach((e, i) => {
        if (a.engines[i]! > 0 || Math.random() > dt * 20) return
        this.fx.particles.emit({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5), vy: 1.2, vz: (Math.random() - 0.5), color: '#3a3250', size: 1.2, sizeEnd: 2.6, life: 1.6, drag: 0.6 })
      })
    }
    // Brought down (#142): a great deal of scrap for the haul.
    if (was && !flying(a)) {
      this.stats.salvage += AIRSHIP_SCRAP
      this.stats.bossDown = true
      emit('bolts', { n: AIRSHIP_SCRAP, x: a.x, y: a.y, z: a.z })
      this.shake = Math.max(this.shake, 0.8)
      this.say('multiKill')
      void enginesUp
    }
  }

  /** The launcher full again: one in the tube, the rest in the rack (#146). */
  private refillRockets(): void {
    const a = this.arsenal
    a.rocketLoaded = true
    a.rocketReload = 0
    a.rockets = Math.max(a.rockets, this.loadout.rockets - 1)
  }

  /** The Airship over the fortress (#142), its rockets in flight; seconds left of its bar on the HUD. */
  private ship: { a: Airship; v: AirshipView; rockets: ShipRocket[] } | null = null
  private shipFocus = 0
  private shipTmp = new Vector3()

  /** The squash of the last landing, easing out (#148). */
  private landSquash = 0

  /** Seconds the rocket room's launcher has been out with its target standing. */
  private rocketDryT = 0

  /** The mech back at a room's way in, on its feet, whole. */
  private placeAtDoor = (x: number, z: number, yaw: number): void => {
    const p = this.player
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
  }

  private roomCleared(room: number): boolean {
    if (room < 0) return false
    const here = this.garrison.units.filter(u => roomAt(u.homeX) === room)
    return here.length > 0 && here.every(u => !isAlive(u))
  }

  /**
   * A lesson that can no longer be done gets its room back: its
   * defenders stand again where they started (the burn room's body lies there
   * again), and the fuel and ropes are topped up. Each one shimmers in.
   */
  private restoreLesson(room: number): void {
    for (const u of this.garrison.units) {
      if (roomAt(u.homeX) !== room || u.gripped) continue
      const start = this.trainingStart[u.id]
      if (!start) continue
      if (isAlive(u) && isAlive(start)) continue
      if (!isAlive(start) && !u.hidden && u.state === 'dead') continue
      if (u.id === this.dragId) this.dropBody()
      Object.assign(u, structuredClone(start))
      this.garrisonView.restore(u.id)
      const rig = this.garrisonView.rigOf(u.id)
      if (rig) this.marks.clear(rig)
      for (let k = this.residues.length - 1; k >= 0; k--) {
        const r = this.residues[k]!
        if (Math.hypot(r.position.x - u.x, r.position.z - u.z) > 2.5) continue
        this.scene.remove(r)
        this.residues.splice(k, 1)
      }
      this.fx.particles.sparks(u.x, u.y + 1, u.z, '#5fe9ff', 18, 2.5, 0.5)
    }
    this.fuelLeft = Math.max(this.fuelLeft, this.loadout.fuel)
    this.ropesLeft = Math.max(this.ropesLeft, this.loadout.ropes)
    emit('lessonRestored', { room })
  }

  /** The training ground, each step: lessons, gates, the demo's glyph, a seen mech sent back. */
  private stepTraining(dt: number): void {
    const tr = this.training
    if (!tr) return
    const p = this.player
    const ctx = {
      x: p.x, y: p.y, z: p.z, bladeKills: this.stats.bladeKills, sniperKills: this.sniperKills, rockets: this.rocketsFired,
      overheats: this.overheats, zooms: this.zooms, sabotaged: this.sabotaged, piles: this.stats.piles,
      supplies: this.suppliesTaken, burns: this.burnsDone, ropes: this.ropesShot,
      // The room the mech is in now (#168): the one it just left must not open this one.
      cleared: this.roomCleared(Math.max(tr.state.room, roomAt(p.x))),
      crouches: this.crouchesDone,
      tries: tr.state.roomResets[Math.max(0, tr.state.room, roomAt(p.x))] ?? 0,
      stocked: this.supplies.every(s => s.taken || !wants(s, this.arsenal, this.armor, this.loadout.rockets))
    }
    const ev = tr.step(ctx, dt)
    // Nothing left in the room to do the lesson with: set it up again.
    const cur = tr.state.room
    if (cur >= 0 && !tr.state.done[cur] && tr.state.base && !this.burning) {
      const here = this.garrison.units.filter(u => roomAt(u.homeX) === cur)
      const stock = {
        alive: here.filter(u => isAlive(u)).length,
        bodies: here.filter(u => u.state === 'dead' && !u.hidden).length,
        fuel: this.fuelLeft,
        ropes: this.ropesLeft
      }
      if (lessonStuck(cur, ctx, tr.state.base, stock)) {
        this.restoreLesson(cur)
        // The decoy room's guard shot on the first try (#171): back to the door, told how.
        if (TRAINING_ROOMS[cur]!.lesson === 'decoy') {
          tr.resetRoom(this.placeAtDoor)
          this.refillTraining(cur)
          this.trainingShout(this.seenLine(cur, tr.state.roomResets[cur] ?? 1))
          emit('trainingReset', {})
        }
      }
      // Up against the shut door (#171): what it wants, in a few words, now and then.
      const say = DOOR_LINES[TRAINING_ROOMS[cur]!.lesson]
      if (say && atShutDoor(tr.state, cur, ctx) && this.time - this.doorSaidT > DOOR_SAY_S) {
        this.doorSaidT = this.time
        this.trainingShout(say.line as TrainingShout, say.hint)
      }
    }
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
        // The launcher's room (#146): both rockets in, whatever was spent before.
        if (lesson === 'rocket') this.refillRockets()
        // The blade room (#158): held at the way in to watch its lesson first.
        if (lesson === 'blade' && !tr.state.done[e.room] && !this.cine) this.watchLesson(e.room)
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
    // Out of ammunition with the room's lesson still to do (#146, #159): a
    // beat to see it, then back at the room's door with everything loaded again.
    if (cur >= 0 && !tr.state.done[cur]) {
      const out = this.ammoOut(TRAINING_ROOMS[cur]!.lesson) && this.rockets.length === 0
      this.rocketDryT = out ? this.rocketDryT + dt : 0
      if (this.rocketDryT >= ROCKET_RESPAWN_S) {
        this.rocketDryT = 0
        tr.resetRoom(this.placeAtDoor)
        this.refillTraining(cur)
        this.trainingShout('reset.ammo')
        emit('trainingReset', {})
      }
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
      // A reset always hands the ammunition back (#159).
      this.refillTraining(tr.state.room)
      // Why (#155, #163, #165): what would have kept it unseen here.
      this.trainingShout(this.seenLine(tr.state.room, tr.state.roomResets[tr.state.room] ?? 1))
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
    // The weapons room's goal (#153): its three, and how many are down.
    const foes = lesson === 'weapons' && !s.done[room] ? this.garrison.units.filter(u => roomAt(u.homeX) === room) : []
    const down = foes.filter(u => !isAlive(u)).length
    if (hud.training.goalTotal !== foes.length) hud.training.goalTotal = foes.length
    if (hud.training.goalDown !== down) hud.training.goalDown = down
  }

  /**
   * Room `lesson`'s lesson can no longer be done for want of ammunition
   * (#159): the launcher's room with no rocket left; the weapons room with
   * the rifle and the mini-gun both dry; anywhere else, every weapon dry. The
   * supply room starts dry on purpose: its crate is the lesson.
   */
  private ammoOut(lesson: LessonId): boolean {
    const a = this.arsenal
    if (lesson === 'supply') return false
    if (lesson === 'rocket') return isDry(a, 'rocket')
    const guns = isDry(a, 'sniper') && isDry(a, 'minigun')
    return lesson === 'weapons' ? guns : guns && isDry(a, 'rocket')
  }

  /** Every weapon loaded again, as a training room's reset leaves it (#159); not in the supply room, whose crate does it. */
  private refillTraining(room: number): void {
    if (TRAINING_ROOMS[room]?.lesson === 'supply') return
    const a = this.arsenal
    a.sniperMag = SNIPER_MAG
    a.sniperReserve = Math.max(a.sniperReserve, a.sniperReserveMax)
    a.minigunBelt = Math.max(a.minigunBelt, a.minigunBeltMax)
    a.reloading = 0
    a.heat = 0
    a.overheated = false
    this.refillRockets()
  }

  /**
   * The line for a mech seen in a training room and sent back (#155, #163,
   * #165). The decoy room hints at its trick the first time; the second time
   * it gives up on it: its guard stands like a target (it never wakes again)
   * and the room is done once it is down, however that is done.
   */
  private seenLine(room: number, times: number): TrainingShout {
    const lesson = TRAINING_ROOMS[room]?.lesson
    if (lesson === 'cover') return 'reset.cover'
    if (lesson === 'box') return 'reset.box'
    if (lesson !== 'decoy') return 'reset.seen'
    if (times < 2) return this.input.device === 'touch' ? 'reset.decoyTouch' : 'reset.decoy'
    for (const u of this.garrison.units) {
      if (roomAt(u.homeX) !== room || !isAlive(u)) continue
      u.state = 'dormant'
      u.dummy = true
    }
    return 'reset.decoyAny'
  }

  /** The training ground calls a line out over the screen (#155, #156), with the control it is about (#171). */
  private trainingShout(key: TrainingShout, hint: HintId | null = null): void {
    hud.training.shout = key
    hud.training.shoutHint = hint ?? ''
    hud.training.shoutSeq++
  }

  /** When a shut lesson door last said what it wants. */
  private doorSaidT = -Infinity
  /** Times the mech has gone into a crouch (the cover room's door, #171). */
  private crouchesDone = 0

  /** When the blade room last called out "Backstab them". */
  private shoutT = -Infinity

  /** A shot in the blade room before its lesson is done (#156): the blade is the way here; said again every few seconds of shooting. */
  private bladeRoomShot(): void {
    const s = this.training?.state
    if (!s || s.room < 0 || s.done[s.room] || TRAINING_ROOMS[s.room]!.lesson !== 'blade') return
    if (this.time - this.shoutT < SHOUT_EVERY_S) return
    this.shoutT = this.time
    this.trainingShout('shout.backstab')
  }

  /** Hold the mech at room `room`'s way in and watch its hologram twice (#158). */
  private watchLesson(room: number): void {
    const v = victimFrame(room, 0)
    if (!v) return
    const p = this.player
    p.vx = p.vz = 0
    const floor = heightAt(this.fortress.grid, v.x, v.z)
    this.lessonFloor = floor > VOID ? floor : 0
    this.cine = {
      kind: 'lesson', t: 0, dur: 2 * demoLength('blade') + DEMO_GAP_S, skipAt: demoLength('blade') - LESSON_SKIP_EARLY_S,
      // From the way in's side and a little south, over the shoulder of the room.
      x: v.x, z: v.z, yaw: -Math.PI / 2 + 0.45
    }
  }

  /** The floor under the blade room's hologram (its camera stands on it). */
  private lessonFloor = 0

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
      const cp = this.aimEye
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

  /**
   * Where the drop-in's wide shot can stand (#119): the farthest distance,
   * turned as little as it must be, from which the mech riding in is in
   * clear view the whole way down. A camera pulled in by a wall mid-shot
   * jumps; one placed right from the start never does.
   */
  private findIntroShot(py: number, cx: number, cz: number, follow: CinePose): { dist: number; turn: number } {
    const f = this.fortress
    const g = f.grid
    const a = this.approach!
    const dog = makeDogFrame()
    const rider = makeRiderFrame()
    const pose = makeCinePose()
    const clear = (dist: number, turn: number): boolean => {
      for (let i = 0; i <= 30; i++) {
        const k = (i / 30) * 0.7
        introFrame(dog, rider, k, f.insert.x, py, f.insert.z, f.insert.facing, a.approach, a.high, a.reach)
        introCam(pose, k, f.insert.x, py, f.insert.z, f.insert.facing, cx, cz, follow, rider.dy, dist, turn)
        const mx = f.insert.x + rider.dx
        const my = py + rider.dy + 1.6
        const mz = f.insert.z + rider.dz
        const dx = pose.x - mx
        const dy = pose.y - my
        const dz = pose.z - mz
        const len = Math.hypot(dx, dy, dz)
        if (raycast(g, mx, my, mz, dx / len, dy / len, dz / len, len).hit) return false
      }
      return true
    }
    for (const dist of [INTRO_CAM_DIST, 16, 13, 10, 8]) {
      for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3]) if (clear(dist, turn)) return { dist, turn }
    }
    return { dist: 6, turn: 0 }
  }

  /**
   * Pull a scripted camera in toward its target past anything solid between
   * them. Like the follow camera's spring arm (#119): it comes in at once when
   * something blocks the line, holds there a moment, and eases back out, so a
   * line that grazes a wall top on and off never flips the shot back and forth
   * frame by frame.
   */
  private clearCine(c: CinePose, dt: number): void {
    if (this.cine !== this.armCine) {
      this.armCine = this.cine
      this.cineArm = Infinity
      this.cineHold = 0
    }
    // A shot a little below the floor it is over comes up onto it; one that
    // has drifted into a tall wall is not lifted onto its top (#119): the
    // line below pulls it in front of the wall instead.
    const ground = heightAt(this.fortress.grid, c.x, c.z)
    if (ground !== VOID && c.y < ground + 0.8 && c.y > ground - 1.5) c.y = ground + 0.8
    // From a little over the target (it is often a point on the floor); for
    // the drop-in and the blade kills, from the mech itself: their shots end
    // on the follow camera, whose target is the aim point far ahead, beyond
    // walls (#119), and the blend out would look from there.
    const p = this.player
    const kind = this.cine?.kind
    const mech = kind === 'intro' || kind === 'stab' || kind === 'air'
    const ox = mech ? p.x + this.rideX : c.tx
    const oy = mech ? p.y + this.lift + 1.6 : c.ty + 0.6
    const oz = mech ? p.z + this.rideZ : c.tz
    const dx = c.x - ox
    const dy = c.y - oy
    const dz = c.z - oz
    const len = Math.hypot(dx, dy, dz)
    if (len < 0.5) return
    const h = raycast(this.fortress.grid, ox, oy, oz, dx / len, dy / len, dz / len, len)
    const room = h.hit && h.t >= 0.05 ? Math.max(0.4, h.t - 0.45) : len
    if (room < this.cineArm) {
      this.cineArm = room
      this.cineHold = CINE_ARM_HOLD_S
    } else if (this.cineHold > 0) this.cineHold -= dt
    else this.cineArm = Math.min(room, this.cineArm + Math.max(0.5, this.cineArm) * CINE_ARM_OUT * dt)
    if (this.cineArm >= len) return
    const t = this.cineArm
    c.x = ox + (dx / len) * t
    c.y = oy + (dy / len) * t
    c.z = oz + (dz / len) * t
  }

  private pitK = 0
  private pitPose = makeCinePose()

  /** The camera over the jump room's gap (#154): high above, a little behind the way the mech looks, down at it. */
  private pitCam(x: number, y: number, z: number): CinePose {
    const out = this.pitPose
    const yaw = this.cam.yaw
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    const oy = y + PIT_CAM_UP
    // Never inside a wall: in along the line from above the mech.
    const h = raycast(this.fortress.grid, x, oy, z, -fx, 0, -fz, PIT_CAM_BACK + 0.4)
    const back = h.hit ? Math.max(0, h.t - 0.4) : PIT_CAM_BACK
    out.x = x - fx * back
    out.y = oy
    out.z = z - fz * back
    out.tx = x + fx * 0.8
    out.ty = y + 0.9
    out.tz = z + fz * 0.8
    out.fov = this.baseFov
    return out
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
    } else if (c.kind === 'lesson') {
      // Out of the watched lesson by its own blend back to the follow camera, not a cut.
      c.dur = Math.min(c.dur, c.t + LESSON_OUT_S)
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
      // It looks past the mech into the base: a few metres that way, never deep into walls (#119).
      const lx = this.centre.x - f.insert.x
      const lz = this.centre.z - f.insert.z
      const ll = Math.hypot(lx, lz) || 1
      const past = Math.min(ll * 0.35, INTRO_LOOK_PAST_M)
      const cx = f.insert.x + (lx / ll) * past / 0.35
      const cz = f.insert.z + (lz / ll) * past / 0.35
      // A wide shot with nothing solid between it and the mech the whole way (#119): worked out once.
      this.introShot ??= this.findIntroShot(py, cx, cz, follow)
      introCam(out, k, f.insert.x, py, f.insert.z, f.insert.facing, cx, cz, follow, this.lift, this.introShot.dist, this.introShot.turn)
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
      // LEVEL CLEARED (#150) as the board lifts the mech out: the card has
      // played out as the shot ends and the rewards open.
      if (!c.banner && c.t >= c.dur - BANNER_HOLD.cleared) { c.banner = true; showBanner('cleared') }
      const py = heightAt(f.grid, f.extract.x, f.extract.z)
      // The dog gallops in on its jets, lies down into a board beside the
      // mech, the mech hops on, and the board climbs away with it.
      const ox = this.player.x
      const oz = this.player.z
      const w = this.outroWay
      outroFrame(this.dogAt, this.riderAt, k, ox, py, oz, this.player.yaw, w.turn, w.reachIn, w.reachOut)
      this.ride(this.riderAt)
      outroCam(out, k, ox + this.rideX * 0.55, py, oz + this.rideZ * 0.55, this.player.yaw, this.baseFov, this.lift)
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'bullet') {
      if (!c.hit) {
        bulletCam(out, k, c.ox, c.oy, c.oz, c.hx, c.hy, c.hz, this.baseFov, camKind(this.garrison.units[c.id]!.kind) !== 'human')
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
      // On the target: a slow turn round it as it goes down; a machine from
      // further out, round where the round went in, as it comes apart.
      const u = this.garrison.units[c.id]!
      if (camKind(u.kind) === 'human') orbitCam(out, c.t, u.x, u.y + 1.2, u.z, c.yaw, 3.3, 0.5, 0.55, this.baseFov * 0.62)
      else orbitCam(out, c.t, c.hx, c.hy - 0.5, c.hz, c.yaw, 4.8, 0.9, 0.35, this.baseFov * 0.7)
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'stab') {
      const st = this.strike
      if (!st || !st.full || !st.bs) { this.endCine(); return false }
      const bs = st.bs
      backstabCam(out, bs.variant, Math.max(0, st.t - st.dur), bs.gx, bs.gy, bs.gz, bs.gyaw, this.baseFov)
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
      // Out of the follow camera over the close-in, so the kill-cam is up as
      // the hand closes (#172: it was still arriving as the blade went in);
      // back into it at the end.
      const tt = st.t - st.dur
      const edge = Math.min(1, st.t / (st.dur + 0.05), (VARIANTS[bs.variant].end - tt) / 0.28)
      if (edge < 1) blendPose(out, follow, out, smooth(Math.max(0, edge)))
      return true
    }
    if (c.kind === 'air') {
      // The rope kill's camera (`airCam`): in from the follow camera, and out to it once the mech is up.
      airCam(out, c.plan, c.at, { x, y, z }, this.baseFov)
      const edge = Math.min(1, c.t / 0.2, (c.dur - c.t) / AIR_CAM_OUT_S)
      if (edge < 1) blendPose(out, follow, out, Math.max(0, edge))
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'orbit') {
      const u = this.garrison.units[c.id]!
      if (c.boss) orbitCam(out, c.t, u.x, u.y + 1.6, u.z, c.yaw, 8.5, 2.6, 0.32, this.baseFov * 0.75)
      // The rope assassination: wide and high enough to see the leap come down from the rope.
      else if (c.wide) orbitCam(out, c.t, u.x, u.y + 2.4, u.z, c.yaw, 7.5, 1.4, 0.45, this.baseFov * 0.85)
      else orbitCam(out, c.t, u.x, u.y + 1.1, u.z, c.yaw, 4.2, 1.1, 0.7, this.baseFov * 0.7)
      // In and out of the follow camera, so the cut is a move.
      const edge = Math.min(1, c.t / 0.25, (c.dur - c.t) / 0.3)
      if (edge < 1) blendPose(out, follow, out, Math.max(0, edge))
      if (k >= 1) this.endCine()
      return true
    }
    if (c.kind === 'lesson') {
      // A camera of its own (#171), cut to and cut back from: inside the room,
      // on the way in's side and a little to the left of the hologram, looking
      // at it; it drifts a hand's width. Nothing to pass through on the way
      // (a move out of the follow camera went through the doorway and the mech).
      lessonCam(out, c.t, c.x, c.z, this.lessonFloor, this.baseFov * 0.85)
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
    this.aimEye.set(follow.x, follow.y, follow.z)
    this.cam.yaw -= sway.yaw + jx
    this.cam.pitch -= sway.pitch + kick + jy

    // A scripted shot takes the camera; otherwise it follows the mech.
    const fp = this.followPose
    fp.x = follow.x; fp.y = follow.y; fp.z = follow.z
    fp.tx = follow.tx; fp.ty = follow.ty; fp.tz = follow.tz
    fp.fov = follow.fov
    // Down in the jump room's gap (#154): the follow camera has only a wall to
    // look at there, and fades the mech out of its way. It rises instead and
    // looks down into the gap, the mech and the way out in view.
    const ts = this.training?.state
    const pit = !!ts && ts.room >= 0 && inPit(ts.room, x, y) && !aiming
    this.pitK = Math.max(0, Math.min(1, this.pitK + (pit ? dt : -dt) * PIT_CAM_RATE))
    if (this.pitK > 0) blendPose(fp, fp, this.pitCam(x, y, z), smooth(this.pitK))
    const scripted = this.stepCine(dt, fp, x, y, z)
    // A scripted shot never looks through a wall (#105): its camera comes in
    // along its line toward what it looks at until nothing stands between.
    if (scripted && this.cine?.kind !== 'lesson') this.clearCine(this.cinePose, dt)
    // Just out of the drop-in: the last frame glides into the follow camera (#119).
    if (!scripted && this.exitT < CINE_EXIT_S) {
      this.exitT += dt
      blendPose(fp, this.exitFrom, fp, smooth(Math.min(1, this.exitT / CINE_EXIT_S)))
    }
    const view = scripted ? this.cinePose : fp
    Object.assign(this.lastView, view)
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
      this.rig.root.scale.set((1 - 0.6 * e) * MECH_SCALE, (1 - 0.8 * e) * MECH_SCALE, (1 - 0.6 * e) * MECH_SCALE)
      this.rig.root.rotation.y = yaw + e * Math.PI * 2
      if (this.morph > 0.7) this.rig.root.visible = false
    } else if (was > 0) this.rig.root.scale.setScalar(MECH_SCALE)
    if ((was < 0.3 && this.morph >= 0.3) || (was > 0.6 && this.morph <= 0.6)) {
      sfx('clang', 0, 0.6)
      this.fx.particles.sparks(x, y + 1.2, z, '#5fe9ff', 14, 3.5, 0.18)
    }
    // Pressed close by a wall, the camera has craned over the mech's shoulder:
    // the mech fades out of its own way.
    this.fadeMech(scripted || this.pitK > 0.3 ? 0 : follow.fade)
    const striking = this.strike
    let airBeat: AirBeat | null = null
    let stab: BackstabPose | null = null
    // A blade kill's hit-stop runs on real time.
    if (this.hitStop > 0) {
      this.hitStop -= dt
      if (this.hitStop <= 0) app.setTimeScale(this.afterStop)
    }
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
    // Stripping a pile: down low, both hands in the scrap.
    s.loot = this.looting ? Math.min(1, this.looting.t / 0.2) * Math.min(1, (SALVAGE_S - this.looting.t) / 0.15 + 0.2) : 0
    // At a panel (#148): down on one knee, one hand working it.
    s.activate = this.sabotaging ? Math.min(1, this.sabotaging.t / 0.2) : 0
    // Braced behind the flamethrower (#148); a landing's squash.
    s.brace = this.burning ? Math.min(1, this.burning.t / 0.15) : 0
    s.land = this.landSquash
    if (this.looting) s.crouch = Math.max(s.crouch, s.loot)
    s.aim = striking || this.armor.down ? 0 : this.cam.aim
    s.aimPitch = this.cam.pitch
    s.weapon = a.current
    // The flamethrower: the weapon put away, the arm out and down at the body,
    // the jet from the hand (never through a gun barrel).
    s.stow = this.burning ? 1 : 0
    if (this.burning) {
      s.aim = 1
      const bt = this.burnTo
      s.aimPitch = Math.atan2(bt.y - (p.y + 1.9 * MECH_SCALE), Math.max(0.6, Math.hypot(bt.x - p.x, bt.z - p.z)))
    }
    s.recoil = a.recoil
    s.spin = a.spin
    s.reload = reloadProgress(a)
    s.blade = this.bladeOut
    if (striking?.full && striking.bs) {
      // The backstab: the free hand on the guard, the weapon put away, the
      // blade arm taken over below (`placeKillBody`).
      const tt = striking.t - striking.dur
      s.stab = 0
      s.draw = s.plunge = 0
      s.stow = 1
      if (tt >= 0) {
        stab = backstabAt(striking.bs.variant, tt, this.bsPose)
        s.grab = stab.grab
        s.blade = stab.blade
        s.crouch = stab.crouch
      } else {
        s.grab = 0
        s.blade = 0
      }
    } else if (striking?.kind === 'air' && striking.air) {
      // From the rope: arms out in the air, the weapon put away, the blade
      // arm cocked overhead and then driven at the mark (`placeKillBody`).
      airBeat = airAt(striking.air, striking.t)
      s.stab = 0
      s.grab = 0
      s.draw = s.plunge = 0
      s.stow = 1
      s.blade = airBeat.blade
      s.crouch = airBeat.crouch
    } else {
      s.stab = striking ? Math.min(1, (striking.t / striking.dur) * 0.9 + 0.05) : 0
      s.grab = s.draw = s.plunge = 0
    }
    s.climb = p.mode === 'ladder' || p.mode === 'mantle' ? 1 : 0
    s.climbPhase = p.climbPhase
    s.cable = p.mode === 'cable' ? 1 : 0
    s.air = p.mode === 'air' || (this.lift > 0.05 && !this.riding) ? 1 : 0
    if (airBeat) s.air = airBeat.air
    // Surfing the board: knees bent, weight low.
    if (this.riding) s.crouch = Math.max(s.crouch, 0.35)
    poseMech(this.rig, s)
    if (this.burning) this.placeFlame()
    // A blade kill: the body leaned round its hips, the blade arm cocked or
    // aimed, and at each blow its tip held in the mark (`sim/killPose.ts`).
    this.rig.root.rotation.order = 'YXZ'
    this.rig.root.rotation.x = 0
    if (stab && striking?.bs) {
      const bs = striking.bs
      const tt = striking.t - striking.dur
      const mark = markWorld(markAt(bs.variant, tt), stab, bs.gx, bs.gy, bs.gz, bs.gyaw)
      // On the stab's own line (#174): the forearm aimed, then driven straight in.
      const on = markAt(bs.variant, tt)
      const line = lineWorld(on, stab, bs.gyaw)
      placeKillBody(this.rig, { x, y, z }, yaw, { pitch: stab.lean, pivot: HIP_Y, arm: stab.arm, aim: stab.aim, cock: stab.cock, pin: stab.pin, line, drive: stab.drive, draw: STAB_DRAW[on] }, mark, grabWorld(bs.variant, stab, bs.gx, bs.gy, bs.gz, bs.gyaw), stab.grab)
    } else if (airBeat && striking?.air) {
      placeKillBody(this.rig, { x, y, z }, yaw, airBeat, airMark(striking.air, airBeat))
      // On the body and kneeling the leaning body never goes through the floor.
      if (airBeat.phase !== 'crouch' && airBeat.phase !== 'flight') {
        const floor = heightAt(this.fortress.grid, this.rig.root.position.x, this.rig.root.position.z)
        if (floor !== VOID) this.rig.root.position.y += bodySink(this.rig, floor)
      }
    }

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
    const lineOn = !!gr && gr.hook > 0.01 && (gr.phase !== 'over' || !!gr.spot.down)
    this.hookView.setVisible(lineOn)
    if (gr && lineOn) {
      const h = hookAt(gr, this.hookPos)
      this.handPos.set(x + Math.sin(yaw) * 0.25 * MECH_SCALE, y + this.lift + 2.05 * MECH_SCALE, z + Math.cos(yaw) * 0.25 * MECH_SCALE)
      // In the air while thrown or recalled; a hook set at the lip to go down is already biting.
      const flying = gr.phase === 'drop' || (gr.phase === 'fly' && !gr.spot.down)
      this.hookView.update(this.handPos, h, yaw, { flying, time: this.time, progress: gr.hook })
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
    this.marks.update(dt)
    if (this.ship) {
      const p = this.player
      this.ship.v.update(this.ship.a, dt, { x: p.x, y: p.y + 1.5, z: p.z }, this.garrison.alert.chaos)
      this.ship.v.drawRockets(this.ship.rockets)
    }
    this.markers.update(dt, this.time)
    this.fx.update(dt, alpha, this.rockets, this.decoys, this.viewH, this.camera.fov)
    this.writeThreats(x, z)
    this.writeCallouts(dt)
    this.writeQuip()
    this.writePrompt(playing && !scripted)
    this.drawLasers()
    this.drawDecoyAim()
    this.chevrons.update(this.time)
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
    clearBanner()
    this.marks.dispose()
    this.ship?.v.dispose()
    this.training?.dispose()
    this.offReplay?.()
    this.offCineSkip?.()
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
    for (const l of this.ropeLines) l.dispose()
    this.chevrons.dispose()
    this.aimRing.geometry.dispose()
    ;(this.aimRing.material as MeshBasicMaterial).dispose()
    this.aimArc.geometry.dispose()
    ;(this.aimArc.material as LineBasicMaterial).dispose()
    this.laserGeo.dispose()
    this.laserMat.dispose()
    this.flame.geometry.dispose()
    this.flameMat.dispose()
    this.flameGlowMat.dispose()
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
    this.hookView.dispose()
    this.rig.mesh.geometry.dispose()
    this.rig.material.dispose()
    this.rig.glowMaterial.dispose()
  }
}
