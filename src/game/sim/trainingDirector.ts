import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial,
  PlaneGeometry, Quaternion, RingGeometry, SphereGeometry, Vector3, type Camera, type Object3D, type Scene, type ShaderMaterial
} from 'three'
import { buildBeacon, disposeBeacon, poseBeacon, type BeaconView } from '../models/beacon'
import { missionPaint } from '../state/paint'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { demoPop } from '../state/hud'
import { CELL, CellKind, cellMid, heightAt, VOID, type Grid } from '../world/grid'
import type { Fortress } from '../world/fortress'
import {
  BARREL_PLINTH, CRAWL_GAP_H, ROCKET_HOLO, ROCKET_LEDGE_H, ROOM_WALL_H, ROPE_DECK_H, ROPE_TOWER_H, TRAINING_ROOMS, roomCell, type LessonId
} from '../data/fortresses/training'
import { VARIANTS } from './backstab'
import { poseBackstabGuard, poseBackstabMech } from './backstabStage'
import { MECH_HEIGHT, MECH_RADIUS, lineHandWorld, muzzleWorld, buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { buildEnforcer, buildGuard, poseEnforcer, poseGuard, restGuardPose } from '../models/garrison'
import { Shatter } from '../fx/shatter'
import { mechGaitRate } from './gait'
import { buildDisguise, disposeDisguise } from '../models/disguises'
import { FREE_DISGUISE } from '../models/disguiseIds'
import { makeHologramMaterial, setHologram } from '../fx/hologram'
import { DecoyHologram } from '../fx/decoyHologram'
import { merge, type Rig } from '../models/kit'
import { CABLE_R, cableGeometry, hookHeadGeometry } from '../fx/grappleHook'
import { ropeLineParts } from '../fx/ropeLine'
import { SPECS, isAlive, spotCentre, spotRadius, type Garrison } from './garrison'
import { BARREL_RADIUS } from './barrels'
import { fuelBarrelShape } from '../models/supplies'
import type { Particles } from '../fx/particles'
import type { ShockRings } from '../fx/markers'
import {
  DEMO_BACKSTAB, DEMO_DRUM, DEMO_SHOTS, DEMO_TARGETS, currentFrame, demoFrame, drumBlast, victimFrame, doorOf, entryOf, makeTraining, replayDemo,
  rewindRoom, roomAt, stepTraining, targetDies, type DemoFrame, type DemoShot, type Training, type TrainingContext, type TrainingEvent
} from './training'
import type { HintId } from './coach'
import type { WeaponId } from '../data/ids'

/**
 * ─── The training ground, on screen ──────────────────────────────────────────
 *
 * Draws what `training.ts` decides: the hologram that shows each lesson (#87)
 * over a projector disc by the way in, with the props its lesson needs (a
 * rope, a body to burn, the disguise), looping until the lesson is done and
 * then dissolving; and the light gates in the doorways that open once a
 * lesson is done. The hologram is light, not a body: additive, scanlined, no
 * depth, nothing to shoot (playtest 2: the old ghost looked like a target). The gates
 * stand in the grid too (a column of wall the height of the room's), raised
 * after the fortress mesh is built, so the floor under them is drawn and
 * nothing walks or sees through them until they open.
 *
 * Being seen sends the mech back to the room's door and the room's defenders
 * back to their places (`resetRoom`): the training ground has no alarm.
 */

const GATE_COLOR = '#5fe9ff'
/** The demo's decoy flies this long before it stands (#114). */
const DECOY_FLY_S = 0.55
/** The demo's rocket flies this long from the launcher's nose to the mech (#146). */
const ROCKET_FLY_S = 0.45
/** The hologram mech's id in the training director's own shatter. */
const HOLO_WRECK = 0
/** The demos' light: the hologram's cyan, its hot core, and a cold blue for the blast's body. */
const HOLO_HOT = '#e9fdff'
const HOLO_DEEP = '#6f8dff'
/** A round's bolt of light, long for the rifle, short for the minigun's stream (m). */
const BOLT_LEN: Readonly<Record<WeaponId, number>> = { sniper: 3.2, minigun: 1.1, rocket: 0.6 }
/** The rocket room's mech is hit this high over its feet (its chest). */
const ROCKET_CHEST_Y = 1.9
/** About where the ghost's gun is over its feet, aimed: the pitch's pivot. */
const MUZZLE_Y = 1.7
/** Thrown by the drum's blast: up and over, this long (s), as the guard's 'thrown' fall is. */
const FLING_S = 0.75
/** How far the guard's own 'thrown' fall carries its body, behind it (m): `poseGuard`. */
export const THROWN_M = 2.2
/** The combat effects the demos borrow: the mission's sparks and shock rings (one draw for every spark). */
export interface DemoFx { particles: Particles; rings: ShockRings }

export class TrainingDirector {
  readonly state: Training = makeTraining()
  readonly group = new Group()
  private ghost: Rig
  private holo: ShaderMaterial = makeHologramMaterial()
  private ghostPose: MechPose = restPose()
  /** The lesson's props, in the same light. */
  private body: Rig
  private bodyPose = { ...restGuardPose(), deadT: 3, death: 'front' as const }
  private disguise: Group
  /** The disguise demo: how far the searchlight's pool was from the hologram last step (closing in, or moving off). */
  private lightD = Infinity
  private rope: Mesh
  /** The hologram's rope is built once, where it is first shown. */
  private ropeBuilt = false
  private hookLine: Mesh
  private hookHead: Mesh
  private flame: Mesh
  /** The decoy lesson's decoy (#114): an orb in flight, then a hologram of the mech where it lands. */
  private decoyOrb: Mesh
  private decoyHolo: DecoyHologram
  private lastPress = ''
  private popV = new Vector3()
  /** The blade room's hologram guard, taken from behind on every loop (#110). */
  private victim: Rig
  private victimPose = restGuardPose()
  /** The demos' hologram guards that the rounds take (the weapons room's three, the drum's five), shared: one room plays at a time. */
  private guards: Rig[] = []
  /** The rounds in flight (#168), pooled: a bolt of light out of the ghost's muzzle. */
  private bolts: Mesh[] = []
  private boltGeo: CylinderGeometry
  private boltMat = new MeshBasicMaterial({ color: HOLO_HOT, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  /** The barrel room's hologram drum, and its blast's fireball. */
  private drum: Mesh
  private blastBall: Mesh
  private blastMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  /**
   * The disguise room's alarm post (by the way out): it goes off when the
   * searchlight catches the mech, the room washed in red (a vignette over the
   * view), for `BOX_ALARM_S` before the room starts over. A drill: nothing of
   * the base's real alarm is raised.
   */
  private alarmPost: BeaconView
  private alarmWash: Mesh
  private alarmOn = false
  private alarmRoom = -1
  private washV = new Vector3()
  /** The demo's clock the frame before: what came due in between goes off now (a muzzle flash, a hit, a blast). */
  private lastT = -1
  private fromV = new Vector3()
  private toV = new Vector3()
  private upV = new Vector3(0, 1, 0)
  /** The rocket room's hologram (#146): the armoured mech on the ledge, the rocket, and the mech in pieces. */
  private holoMech: Rig
  private rocketMesh: Group
  private shatter: Shatter
  private broken = false
  private muzzleV = new Vector3()
  /** A projector disc by each room's way in. */
  private discs: Mesh[] = []
  private discMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  /** The disc's ring and its core in one geometry: one draw a disc (perf, #10 fps on an Adreno 610). */
  private discGeo = mergeGeometries([new RingGeometry(0.55, 0.85, 32), new CircleGeometry(0.45, 24)])!
  /** The rooms drawn: the one the mech is in, the one behind and the two ahead (the rest are behind walls). */
  private cullLo = 0
  private cullHi = Infinity
  /** Doorways opened (their gates are gone for good). */
  private opened: boolean[] = []
  /** The last frame shown, held while the hologram dissolves after its lesson is done. */
  private fade = 0
  private fadeRoom = -1
  private gates: Array<Mesh | null> = []
  private gateMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
  private barMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  private gateGeo: BoxGeometry
  private crawlGateGeo: BoxGeometry
  private barGeo: BoxGeometry
  private barsGeo: BufferGeometry
  private crawlBarsGeo: BufferGeometry
  private lastX = 0
  private lastZ = 0

  /** `fx`: the mission's sparks and rings, for the demos' flashes and blasts (none in a bare test scene). */
  constructor(scene: Scene, private fortress: Fortress, private gar: Garrison, private fx?: DemoFx) {
    this.ghost = buildMech(missionPaint())
    this.ghost.mesh.material = this.holo
    if (this.ghost.outline) this.ghost.outline.visible = false
    this.ghost.root.visible = false
    this.group.add(this.ghost.root)
    this.body = buildGuard()
    this.body.mesh.material = this.holo
    if (this.body.outline) this.body.outline.visible = false
    this.body.root.visible = false
    this.group.add(this.body.root)
    this.disguise = buildDisguise(FREE_DISGUISE)
    this.disguise.traverse((o: Object3D) => { if ((o as Mesh).isMesh) (o as Mesh).material = this.holo })
    this.disguise.visible = false
    this.group.add(this.disguise)
    // The rope and the hook in the hologram's light are the game's own (#164):
    // the braided line with its pitons and clamps, the hook's head on its cable.
    // The rope is built where it is first shown (its room's cells).
    this.rope = new Mesh(new BufferGeometry(), this.holo)
    this.rope.visible = false
    this.group.add(this.rope)
    // The grappling hook's line and its three-pronged head (#117), as the mission draws them.
    this.hookLine = new Mesh(cableGeometry(12, 8, 48, CABLE_R * 1.4), this.holo)
    const head = hookHeadGeometry()
    this.hookHead = new Mesh(merge([head.lit, head.glow]), this.holo)
    for (const g of [head.lit, head.glow, ...head.parts]) g.dispose()
    this.hookLine.visible = this.hookHead.visible = false
    this.group.add(this.hookLine, this.hookHead)
    const fg = new ConeGeometry(0.55, 1, 10, 1, true)
    fg.translate(0, -0.5, 0)
    this.flame = new Mesh(fg, this.holo)
    this.flame.visible = false
    this.group.add(this.flame)
    this.decoyOrb = new Mesh(new SphereGeometry(0.22, 12, 8), this.holo)
    this.decoyOrb.visible = false
    this.group.add(this.decoyOrb)
    // The game's own decoy: CM-07 in light, juggling (`fx/decoyHologram.ts`).
    this.decoyHolo = new DecoyHologram(missionPaint())
    this.decoyHolo.root.visible = false
    this.group.add(this.decoyHolo.root)
    this.victim = buildGuard()
    this.victim.mesh.material = this.holo
    if (this.victim.outline) this.victim.outline.visible = false
    this.victim.root.visible = false
    this.group.add(this.victim.root)
    // The rocket room's armoured mech (#146), the rocket (a tube and its nose), and the mech's parts.
    this.holoMech = buildEnforcer()
    this.holoMech.mesh.material = this.holo
    if (this.holoMech.outline) this.holoMech.outline.visible = false
    this.holoMech.root.visible = false
    this.group.add(this.holoMech.root)
    this.rocketMesh = new Group()
    const tube = new Mesh(new CylinderGeometry(0.09, 0.09, 0.6, 8), this.holo)
    tube.rotation.x = Math.PI / 2
    const nose = new Mesh(new ConeGeometry(0.09, 0.22, 8), this.holo)
    nose.rotation.x = Math.PI / 2
    nose.position.z = 0.41
    this.rocketMesh.add(tube, nose)
    this.rocketMesh.visible = false
    this.group.add(this.rocketMesh)
    // The rounds (#168): a bolt of light from the ghost's muzzle, one geometry
    // (its foot at the origin, a metre up +y) for the whole pool.
    this.boltGeo = new CylinderGeometry(0.035, 0.035, 1, 6, 1, true)
    this.boltGeo.translate(0, 0.5, 0)
    for (let k = 0; k < 6; k++) {
      const b = new Mesh(this.boltGeo, this.boltMat)
      b.visible = false
      b.renderOrder = 3
      this.group.add(b)
      this.bolts.push(b)
    }
    // The barrel room's drum: the real one's shape, crests and all, in the hologram's light (its middle at the origin).
    this.drum = new Mesh(fuelBarrelShape().translate(0, -0.55, 0), this.holo)
    this.drum.visible = false
    this.group.add(this.drum)
    this.blastBall = new Mesh(new SphereGeometry(1, 16, 10), this.blastMat)
    this.blastBall.visible = false
    this.group.add(this.blastBall)
    this.shatter = new Shatter(fortress.grid)
    this.group.add(this.shatter.group)
    // The disguise room's alarm post, at the far end by the way out, facing back down the corridor.
    this.alarmPost = buildBeacon()
    this.alarmRoom = TRAINING_ROOMS.findIndex(r => r.lesson === 'box')
    const box = TRAINING_ROOMS[this.alarmRoom]
    if (box) {
      this.alarmPost.group.position.set((box.x0 + ALARM_POST[0] - 1) * CELL + CELL / 2, 0, (box.z0 + ALARM_POST[1] - 1) * CELL + CELL / 2)
      this.alarmPost.group.rotation.y = -Math.PI / 2
    }
    this.alarmPost.group.visible = false
    this.group.add(this.alarmPost.group)
    this.alarmWash = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({
      map: vignette(), color: ALARM_RED, transparent: true, opacity: 0, blending: AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false
    }))
    this.alarmWash.renderOrder = 60
    this.alarmWash.frustumCulled = false
    this.alarmWash.visible = false
    this.group.add(this.alarmWash)
    // The guards the demos' rounds take, as many as the busiest demo has.
    const n = Math.max(...Object.values(DEMO_TARGETS).map(l => l.length))
    for (let k = 0; k < n; k++) {
      const rig = buildGuard()
      rig.mesh.material = this.holo
      if (rig.outline) rig.outline.visible = false
      rig.root.visible = false
      this.group.add(rig.root)
      this.guards.push(rig)
    }
    TRAINING_ROOMS.forEach((r, i) => {
      // The disc stands where the hologram starts, by the way in.
      const e = entryOf(i)
      const disc = new Mesh(this.discGeo, this.discMat)
      disc.rotation.x = -Math.PI / 2
      const h = heightAt(fortress.grid, e.x, e.z)
      disc.position.set(e.x, (h === VOID ? 0 : h) + 0.04, e.z)
      disc.renderOrder = 2
      this.group.add(disc)
      this.discs.push(disc)
      void r
    })
    const span = CELL * 2
    this.gateGeo = new BoxGeometry(0.12, 4.2, span)
    this.gateGeo.translate(0, 2.1, 0)
    this.barGeo = new BoxGeometry(0.2, 0.1, span)
    const bars = (ys: number[]): BufferGeometry => mergeGeometries(ys.map(y => this.barGeo.clone().translate(0, y, 0)))!
    this.barsGeo = bars([0.6, 1.5, 2.4, 3.3])
    this.crawlBarsGeo = bars([CRAWL_GAP_H, 2.4, 3.3])
    // The cover room's gate stops short of the floor: a crawl gap (#186).
    this.crawlGateGeo = new BoxGeometry(0.12, 4.2 - CRAWL_GAP_H, span)
    this.crawlGateGeo.translate(0, CRAWL_GAP_H + (4.2 - CRAWL_GAP_H) / 2, 0)
    for (const r of TRAINING_ROOMS) {
      if (!r.door) { this.gates.push(null); continue }
      const crawl = r.lesson === 'cover'
      const g = new Mesh(crawl ? this.crawlGateGeo : this.gateGeo, this.gateMat)
      g.position.set(cellMid(r.door.cx), 0, (cellMid(r.door.cz0) + cellMid(r.door.cz1)) / 2)
      // The bars in one mesh: one draw a gate for them, not one a bar.
      g.add(new Mesh(crawl ? this.crawlBarsGeo : this.barsGeo, this.barMat))
      this.group.add(g)
      this.gates.push(g)
      if (crawl) this.setCrawl(r.door)
      else this.setDoor(r.door, true)
    }
    scene.add(this.group)
  }

  /**
   * A doorway with a crawl gap (#186): open floor under a ceiling a crouched
   * mech fits beneath and a standing one does not. It stays: the room's
   * lesson done or not, the way through is on hands and knees.
   */
  private setCrawl(d: { cx: number; cz0: number; cz1: number }): void {
    const g: Grid = this.fortress.grid
    for (let cz = d.cz0; cz <= d.cz1; cz++) {
      const i = cz * g.w + d.cx
      g.h[i] = 0
      g.kind[i] = CellKind.Ground
      g.roof[i] = CRAWL_GAP_H
    }
  }

  /**
   * The disguise room's hologram, boxed, stands still while the room's caged
   * searchlight is on it, and from a little before the pool comes over it:
   * the lamp spots a disguise that moves (it walked straight through the
   * light, and taught that a disguise is never seen).
   */
  private holdForLight(): boolean {
    const t = this.state
    const lamp = t.demoT >= 0 && t.room >= 0 && TRAINING_ROOMS[t.room]!.lesson === 'box'
      ? this.gar.units.find(u => u.kind === 'searchlight' && roomAt(u.homeX) === t.room)
      : undefined
    const f = lamp ? currentFrame(t) : null
    if (!lamp || !f || f.boxed < 0.5) { this.lightD = Infinity; return false }
    const s = spotCentre(lamp)
    const d = Math.hypot(s.x - f.x, s.z - f.z)
    const coming = d < this.lightD - 1e-4
    this.lightD = d
    const r = spotRadius(lamp) + MECH_RADIUS
    return d < r + 0.4 || (coming && d < r + LIGHT_WARN_M)
  }

  /** A doorway shut (a column of wall) or open (ground again). */
  private setDoor(d: { cx: number; cz0: number; cz1: number }, shut: boolean): void {
    const g: Grid = this.fortress.grid
    for (let cz = d.cz0; cz <= d.cz1; cz++) {
      const i = cz * g.w + d.cx
      g.h[i] = shut ? ROOM_WALL_H : 0
      g.kind[i] = shut ? CellKind.Block : CellKind.Ground
    }
  }

  /** Advance the lessons; open what was earned. Returns the step's events. */
  step(c: TrainingContext, dt: number): TrainingEvent[] {
    // The disguise demo keeps still under the real lamp, as the mech has to.
    const ev = stepTraining(this.state, c, this.holdForLight() ? 0 : dt)
    for (const e of ev) {
      if (e.type !== 'done') continue
      const r = TRAINING_ROOMS[e.room]!
      const g = this.gates[e.room]
      // The crawl gate stays as it is: its gap is the way through.
      if (r.door && g && r.lesson !== 'cover') { this.setDoor(r.door, false); g.visible = false; this.opened[e.room] = true }
    }
    // Past the crawl gate, it goes: its glass sat right in front of the
    // camera of a mech that turned to aim just beyond it.
    for (let i = 0; i < TRAINING_ROOMS.length; i++) {
      const r = TRAINING_ROOMS[i]!
      const g = this.gates[i]
      if (r.lesson !== 'cover' || !r.door || !g || this.opened[i] || c.x < cellMid(r.door.cx) + MECH_RADIUS + 0.1) continue
      const grid: Grid = this.fortress.grid
      for (let cz = r.door.cz0; cz <= r.door.cz1; cz++) grid.roof[cz * grid.w + r.door.cx] = VOID
      g.visible = false
      this.opened[i] = true
    }
    return ev
  }

  /** DEV CHEAT (#116): every room before `i` done and its gate open, the demo reset. */
  skipTo(i: number): void {
    TRAINING_ROOMS.forEach((r, k) => {
      if (k >= i || this.state.done[k]) return
      this.state.done[k] = true
      const g = this.gates[k]
      if (r.door && g && r.lesson !== 'cover') { this.setDoor(r.door, false); g.visible = false; this.opened[k] = true }
    })
    this.state.room = Math.min(this.state.room, i - 1)
  }

  /**
   * The rooms to draw (perf): the training ground is one long row of rooms
   * behind 16 m walls, looked straight down, so frustum culling keeps all of
   * them. Only the one the mech is in, the one behind and the two ahead
   * (seen through the glass gates) are drawn; the rest is behind walls.
   */
  cullRooms(): { lo: number; hi: number; xMin: number; xMax: number } {
    const cur = Math.max(0, this.state.room)
    const lo = Math.max(0, cur - 1)
    const hi = Math.min(TRAINING_ROOMS.length - 1, cur + 2)
    this.cullLo = lo
    this.cullHi = hi
    return { lo, hi, xMin: (TRAINING_ROOMS[lo]!.x0 - 1) * CELL, xMax: (TRAINING_ROOMS[hi]!.x1 + 2) * CELL }
  }

  /** The disguise room's alarm post going off, or quiet again (the mission's `stepAlarm`). */
  alarm(on: boolean): void {
    this.alarmOn = on
  }

  /** The replay button. */
  replay(): boolean {
    return replayDemo(this.state)
  }

  /** The control the demo is showing right now, if one is playing. */
  hint(): HintId | null {
    const t = this.state
    if (t.demoT < 0 || t.room < 0) return null
    return currentFrame(t).hint
  }

  /**
   * Where the marker points: the room's own goal (the door, the top of the
   * hook wall, the body to burn, the supplies, the pile, the pad, the drum on
   * the plinth until it has gone up), or the open
   * door once the lesson is done; the rocket room's mech (the objective
   * marker, with its edge arrow: a playtester never found the mech); nothing
   * while a weapons, blade or decoy lesson is still to do (the guards are the goal: `targetMarks` marks
   * them, but for the decoy room's, which is to be lured).
   */
  waypoint(): { x: number; y: number; z: number } | null {
    const t = this.state
    if (t.room < 0) return null
    const r = TRAINING_ROOMS[t.room]!
    const g = this.fortress.grid
    const at = (x: number, z: number, lift = 1.4): { x: number; y: number; z: number } => {
      const h = heightAt(g, x, z)
      return { x, y: (h === VOID ? 0 : h) + lift, z }
    }
    const d = doorOf(t.room)
    // In the doorway, at the height of the floor just inside it: the door's
    // own cell reads as its shut gate's top, and put the marker up on the
    // wall over the jump room's way out.
    const door = d && { x: d.x, z: d.z, y: at(d.x - CELL, d.z).y }
    const done = t.done[t.room]
    switch (r.lesson) {
      case 'hook': return at(cellMid(r.x1 + 1), (r.z0 + 6.5) * CELL, 0.6)
      case 'salvage': {
        const p = this.fortress.salvage[0]
        return !done && p ? at(p.x, p.z, 1.6) : door
      }
      case 'extract': return at(this.fortress.extract.x, this.fortress.extract.z, 1.2)
      // The body to burn, not the door (a playtester was sent to the door).
      case 'burn': {
        const body = done ? null : this.gar.units.find(u => roomAt(u.homeX) === t.room && u.state === 'dead' && !u.hidden)
        return body ? at(body.x, body.z, 1.0) : door
      }
      // The supplies, until something was taken.
      case 'supply': {
        const s = done ? null : (this.fortress.supplies ?? []).find(q => roomAt(q.x) === t.room)
        return s ? at(s.x, s.z, 1.2) : door
      }
      // The drum on the plinth, until it has gone up (its cell is bare floor then; a room set up again stands it back).
      case 'barrel': {
        const [cx, cz] = roomCell(t.room, ...BARREL_PLINTH)
        const live = !done && g.base[cz * g.w + cx] !== VOID
        return live ? at(cellMid(cx), cellMid(cz), 1.0) : door
      }
      // The mech on the ledge, until it is down (a playtester never found it up there).
      case 'rocket': {
        const mech = done ? null : this.gar.units.find(u => roomAt(u.homeX) === t.room && isAlive(u))
        return mech ? { x: mech.x, y: mech.y + SPECS[mech.kind].height + 0.4, z: mech.z } : door
      }
      case 'weapons': case 'blade': case 'decoy': return done ? door : null
      default: return door
    }
  }

  /**
   * The guards a lesson is about, each marked over its head until it is down:
   * the weapons room's three, the blade room's two (the rocket room's mech
   * has the objective marker itself, `waypoint`)
   * (playtesters did not see that the guards were the goal). Nothing once the
   * lesson is done; then the door is the waypoint.
   */
  targetMarks(): Array<{ x: number; y: number; z: number }> {
    const t = this.state
    if (t.room < 0 || t.done[t.room]) return []
    const lesson = TRAINING_ROOMS[t.room]!.lesson
    if (lesson !== 'weapons' && lesson !== 'blade') return []
    return this.gar.units
      .filter(u => roomAt(u.homeX) === t.room && isAlive(u) && !u.hidden)
      // Above its health bar (drawn at its height + 0.25), not over it.
      .map(u => ({ x: u.x, y: u.y + SPECS[u.kind].height + 1.1, z: u.z }))
  }

  /** Seen: the room's defenders back at their places, the mech at its door. */
  resetRoom(place: (x: number, z: number, yaw: number) => void): void {
    const t = this.state
    const room = Math.max(0, t.room)
    t.resets++
    t.roomResets[room] = (t.roomResets[room] ?? 0) + 1
    rewindRoom(this.gar, room)
    const e = entryOf(room)
    place(e.x, e.z, Math.PI / 2)
  }

  /** Pose the hologram for this frame (`camera`: where its button presses pop up on screen, #114). */
  update(dt: number, time: number, camera?: Camera): void {
    const t = this.state
    this.soundAlarm(time, camera)
    // A projector disc glows while its room's lesson is still to do.
    this.discs.forEach((d, i) => { d.visible = !t.done[i] && i >= this.cullLo && i <= this.cullHi })
    this.gates.forEach((g, i) => { if (g) g.visible = !this.opened[i] && i >= this.cullLo && i <= this.cullHi })
    this.discMat.opacity = 0.4 + 0.15 * Math.sin(time * 5)
    // Done: the figure dissolves where it stood.
    if (t.room >= 0 && t.done[t.room] && this.fadeRoom === t.room) this.fade = Math.max(0, this.fade - dt * 1.4)
    const playing = t.demoT >= 0 && t.room >= 0
    if (playing) { this.fade = Math.min(1, this.fade + dt * 4); this.fadeRoom = t.room }
    const on = (playing || this.fade > 0.01) && this.fadeRoom >= 0
    this.ghost.root.visible = on
    setHologram(this.holo, time, this.fade)
    if (!on) {
      demoPop.on = false
      this.decoyOrb.visible = this.decoyHolo.root.visible = false
      this.body.root.visible = this.disguise.visible = this.rope.visible = this.flame.visible = false
      for (const rig of this.guards) rig.root.visible = false
      for (const b of this.bolts) b.visible = false
      this.victim.root.visible = false
      this.holoMech.root.visible = this.rocketMesh.visible = this.drum.visible = this.blastBall.visible = false
      this.lastT = -1
      if (this.broken) { this.shatter.clear(HOLO_WRECK); this.broken = false }
      return
    }
    if (!playing) { this.lastT = -1; return }
    const f = currentFrame(t)
    const lesson = TRAINING_ROOMS[t.room]!.lesson
    // A new loop (or the replay button): nothing of the last one is still due.
    if (this.lastT > t.demoT) this.lastT = -1
    const floor = heightAt(this.fortress.grid, f.x, f.z)
    const base = floor === VOID ? 0 : floor
    // A climb or a jump: the hologram rises above the floor it starts on.
    const y = Math.max(base, f.y > 0 ? f.y : base)
    this.ghost.root.position.set(f.x, y, f.z)
    this.ghost.root.rotation.set(0, f.yaw, 0)
    const s = this.ghostPose
    const moved = Math.hypot(f.x - this.lastX, f.z - this.lastZ)
    this.lastX = f.x
    this.lastZ = f.z
    s.time = time
    s.stride += moved * mechGaitRate(0, f.crouch)
    s.speed = f.speed
    s.crouch = f.crouch
    s.aim = f.aim
    s.weapon = f.weapon
    s.stab = f.stab
    s.blade = f.stab > 0.01 ? 1 : 0
    s.boxed = f.boxed
    s.loot = f.loot
    s.climb = f.climb
    s.climbPhase = f.y
    s.air = f.air
    s.cable = f.cable
    // The hook (#117): thrown with the whole body, then hand over hand up the
    // line (it hung there stiff in the drop's pose, "as if dead").
    const hooked = !!f.grip && f.hook > 0.01
    s.throwHook = hooked && f.hook < 0.99 ? f.hook : 0
    s.reel = hooked && f.hook >= 0.99 && f.air > 0.05 ? 1 : 0
    s.reelPhase = f.y * 2.4
    if (s.reel) s.air = 0
    s.grab = s.draw = s.plunge = 0
    s.stow = 0
    // The gun up (or down) along the line to what it is aimed at: the
    // launcher at the mech up on its ledge, a rifle at its mark.
    const mark = f.aim > 0.01 ? this.aimMark(t.room, lesson, t.demoT) : null
    s.aimPitch = mark ? Math.atan2(mark.y - (y + MUZZLE_Y), Math.max(0.5, Math.hypot(mark.x - f.x, mark.z - f.z))) : 0
    // Each round kicks the gun back; the minigun's barrels spin through its burst.
    const shot = lastShot(DEMO_SHOTS[lesson], t.demoT)
    s.recoil = shot ? Math.max(0, 1 - (t.demoT - shot.t) / 0.18) : 0
    if (shot && shot.weapon === 'minigun' && t.demoT - shot.t < 0.4) s.spin += dt * 38
    // The backstab (#110): the mech's half as the mission plays it, on the
    // hologram guard where it stands.
    const vf = f.td >= 0 && f.td < VARIANTS[DEMO_BACKSTAB].end ? victimFrame(t.room, t.demoT) : null
    if (vf) {
      s.speed = 0
      poseBackstabMech(this.ghost, s, DEMO_BACKSTAB, f.td, vf.x, 0, vf.z, vf.yaw)
    } else poseMech(this.ghost, s)
    // The disguise: the toaster stands where the mech was (#97).
    const boxed = f.boxed > 0.5
    this.disguise.visible = boxed
    if (boxed) {
      this.ghost.root.visible = false
      this.disguise.position.set(f.x, y, f.z)
      this.disguise.rotation.y = f.yaw
    }
    this.props(t.room, f, y, time)
    this.rounds(t.room, lesson, time)
    this.fireRocket(t.room, f, time, dt)
    this.lastT = t.demoT
    this.pops(f, y, camera)
    this.throwDecoy(f, y, time)
    this.gateMat.opacity = 0.26 + 0.08 * Math.sin(time * 3)
  }

  /**
   * The key of each control the hologram uses pops up over its head (#114):
   * on screen, from the hologram's head, it rises and fades (DemoPop.vue).
   */
  private pops(f: DemoFrame, y: number, camera?: Camera): void {
    if (!camera || !f.press) { demoPop.on = false; if (!f.press) this.lastPress = ''; return }
    const key = `${f.press.hint}@${(this.state.demoT - f.press.t).toFixed(2)}`
    if (key !== this.lastPress) { this.lastPress = key; demoPop.seq++ }
    // Just over the hologram's head (it stood a metre higher, easy to miss up there).
    const p = this.popV.set(f.x, y + MECH_HEIGHT + 0.25, f.z).project(camera)
    demoPop.on = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1
    demoPop.x = (p.x + 1) / 2
    demoPop.y = (1 - p.y) / 2
    demoPop.hint = f.press.hint
  }

  /** The decoy lesson's decoy (#114): it arcs from the hologram's hand and stands where it lands, flickering. */
  private throwDecoy(f: DemoFrame, y: number, time: number): void {
    const d = f.decoy
    this.decoyOrb.visible = !!d && d.t < DECOY_FLY_S
    this.decoyHolo.root.visible = !!d && d.t >= DECOY_FLY_S
    if (!d) return
    if (d.t < DECOY_FLY_S) {
      const k = d.t / DECOY_FLY_S
      const hx = f.x + Math.sin(f.yaw) * 0.6
      const hz = f.z + Math.cos(f.yaw) * 0.6
      this.decoyOrb.position.set(hx + (d.x - hx) * k, y + 1.6 + Math.sin(k * Math.PI) * 2.5 - 1.2 * k, hz + (d.z - hz) * k)
      return
    }
    // Standing where it fell, facing back the way it came, juggling.
    const r = this.decoyHolo.root
    r.position.set(d.x, 0, d.z)
    r.rotation.y = f.yaw + Math.PI
    r.scale.setScalar(Math.max(0.01, Math.min(1, (d.t - DECOY_FLY_S) / 0.25)))
    this.decoyHolo.update(time, d.t - DECOY_FLY_S, this.fade)
  }

  /**
   * The rocket room (#146): the armoured mech stands on its ledge; the rocket
   * leaves the launcher's nose (the same tip the mission fires from) and flies
   * straight into it; the mech comes apart into its own parts, in the same light.
   */
  private fireRocket(room: number, f: DemoFrame, time: number, dt: number): void {
    const r = TRAINING_ROOMS[room]!
    const here = r.lesson === 'rocket'
    const rk = f.rocket
    const hit = !!rk && rk.t >= ROCKET_FLY_S
    // A new loop: the mech whole again.
    if (this.broken && (!here || !hit)) { this.shatter.clear(HOLO_WRECK); this.broken = false }
    this.shatter.update(dt)
    const tx = (r.x0 + ROCKET_HOLO[0] - 1) * CELL + CELL / 2
    const tz = (r.z0 + ROCKET_HOLO[1] - 1) * CELL + CELL / 2
    this.holoMech.root.visible = here && !hit
    if (this.holoMech.root.visible) {
      this.holoMech.root.position.set(tx, ROCKET_LEDGE_H, tz)
      this.holoMech.root.rotation.y = 0
      poseEnforcer(this.holoMech, { time, stride: 0, speed: 0, power: 1, aimYaw: 0, aimPitch: -0.15, recoilL: 0, recoilR: 0, deadT: 0 })
    }
    this.rocketMesh.visible = here && !!rk && !hit
    if (this.rocketMesh.visible && rk) {
      // From the hole in the ghost's tube as it is posed now (#167).
      const from = muzzleWorld(this.ghost, 'rocket', this.muzzleV) ?? this.muzzleV.copy(this.ghost.root.position)
      const to = new Vector3(tx, ROCKET_LEDGE_H + ROCKET_CHEST_Y, tz)
      const k = Math.min(1, rk.t / ROCKET_FLY_S)
      this.rocketMesh.position.copy(from).lerp(to, k)
      this.rocketMesh.lookAt(to)
      // Its trail: puffs of light it leaves hanging behind it.
      const p = this.fx?.particles
      const q = this.rocketMesh.position
      p?.emit({ x: q.x, y: q.y, z: q.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.3, vz: (Math.random() - 0.5) * 0.6, color: GATE_COLOR, size: 0.2, sizeEnd: 0.6, life: 0.45, drag: 2 })
    }
    // It lands (this frame): the blast, where the mech stands.
    if (here && rk && rk.t >= ROCKET_FLY_S && rk.t - (this.state.demoT - Math.max(0, this.lastT)) < ROCKET_FLY_S) this.blast(tx, ROCKET_LEDGE_H + 1.6, tz, ROCKET_LEDGE_H, 0.75)
    if (here && hit && !this.broken) {
      this.holoMech.root.visible = true
      this.holoMech.root.updateMatrixWorld(true)
      this.broken = this.shatter.break(HOLO_WRECK, this.holoMech, { dirX: -0.3, dirZ: 1, force: 7, seed: 0.3, material: this.holo })
      this.holoMech.root.visible = false
    }
  }

  /** The alarm post: ready (a low red glow) while its room is drawn; going off, its beam turns and the view pulses red. */
  private soundAlarm(time: number, camera?: Camera): void {
    const shown = this.alarmRoom >= this.cullLo && this.alarmRoom <= this.cullHi
    const on = this.alarmOn && shown
    this.alarmPost.group.visible = shown
    if (shown) poseBeacon(this.alarmPost, on ? 'lit' : 'ready', 1, time)
    // Flashing: the dome on and off as the siren wails.
    if (on && Math.sin(time * 14) < 0) this.alarmPost.lampMat.color.set('#55202c')
    this.alarmWash.visible = on && !!camera
    if (!this.alarmWash.visible || !camera) return
    // Just in front of the camera, square to it: the whole view, its edges reddest.
    const fwd = this.washV.set(0, 0, -1).applyQuaternion(camera.quaternion)
    this.alarmWash.position.copy(camera.position).addScaledVector(fwd, 0.5)
    this.alarmWash.quaternion.copy(camera.quaternion)
    ;(this.alarmWash.material as MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(time * 7)
  }

  /** What the ghost's gun is aimed at, `time` into room `room`'s demo (metres): the rocket room's mech, the round in flight or the next. */
  private aimMark(room: number, lesson: LessonId, time: number): { x: number; y: number; z: number } | null {
    const r = TRAINING_ROOMS[room]!
    const toX = (v: number): number => (r.x0 + v - 1) * CELL + CELL / 2
    const toZ = (v: number): number => (r.z0 + v - 1) * CELL + CELL / 2
    if (lesson === 'rocket') return { x: toX(ROCKET_HOLO[0]), y: ROCKET_LEDGE_H + ROCKET_CHEST_Y, z: toZ(ROCKET_HOLO[1]) }
    const shots = DEMO_SHOTS[lesson]
    if (!shots?.length) return null
    // The round now (or last) fired, or the first still to come.
    const q = lastShot(shots, time) ?? shots[0]!
    const at = q.target === 'drum' ? DEMO_DRUM : DEMO_TARGETS[lesson]?.[q.target]?.at
    return at ? { x: toX(at[0]), y: q.y, z: toZ(at[1]) } : null
  }

  /**
   * The demo's rounds and what they take (#168 follow-up: guards fell with
   * nothing to say why). Each round flies out of the ghost's muzzle as a bolt
   * of light, with a flash at the muzzle; where it lands, a burst of light, and
   * only then does its guard go down. The rifle's leaves its line hanging, the
   * minigun's are a stream. The barrel room's round goes into a hologram drum
   * among five guards: a spark, the blast, and all five thrown off their feet.
   */
  private rounds(room: number, lesson: LessonId, time: number): void {
    const now = this.state.demoT
    const was = this.lastT
    const targets = DEMO_TARGETS[lesson] ?? []
    const shots = DEMO_SHOTS[lesson] ?? []
    const r = TRAINING_ROOMS[room]!
    const toX = (v: number): number => (r.x0 + v - 1) * CELL + CELL / 2
    const toZ = (v: number): number => (r.z0 + v - 1) * CELL + CELL / 2
    const p = this.fx?.particles
    // The guards: standing round, until what takes them lands.
    const blast = drumBlast(lesson)
    this.guards.forEach((rig, k) => {
      const tg = targets[k]
      rig.root.visible = !!tg
      if (!tg) return
      const down = now - targetDies(lesson, k)
      let x = toX(tg.at[0])
      let z = toZ(tg.at[1])
      let y = 0
      // Thrown by the blast: further out along the way its fall carries it, and higher.
      if (tg.fling !== undefined && down > 0) {
        const f = Math.min(1, down / FLING_S)
        const out = tg.fling * (1 - (1 - f) * (1 - f))
        x -= Math.sin(tg.yaw) * out
        z -= Math.cos(tg.yaw) * out
        y = (tg.lift ?? 0) * Math.sin(f * Math.PI)
      }
      rig.root.position.set(x, y, z)
      rig.root.rotation.y = tg.yaw
      // Round the drum they stand easy, looking about; struck, the fall the target has.
      const easy = blast >= 0 && down <= 0
      poseGuard(rig, {
        ...restGuardPose(), time: time + tg.at[0], seed: (k * 0.37) % 1, lookYaw: easy ? Math.sin(time * 0.9 + k * 1.7) * 0.4 : 0,
        deadT: down > 0 ? Math.max(1e-3, down) : 0, death: tg.death
      })
    })
    // The drum: whole until the blast; hit, it flares for the beat before.
    this.drum.visible = blast >= 0 && now < blast
    const dx = toX(DEMO_DRUM[0])
    const dz = toZ(DEMO_DRUM[1])
    if (this.drum.visible) {
      const hit = shots.find(q => q.target === 'drum')!
      const lit = now >= hit.t + hit.fly
      this.drum.position.set(dx, 0.55, dz)
      // It breathes, so the eye finds it among the guards.
      this.drum.scale.setScalar(lit ? 1.12 + 0.06 * Math.sin(time * 80) : 1 + 0.04 * Math.sin(time * 5))
    }
    if (blast >= 0 && was < blast && now >= blast) this.blast(dx, 0.9, dz, 0, 1)
    // The fireball's shell: out to the blast's reach and gone.
    const ball = blast >= 0 ? (now - blast) / 0.45 : -1
    this.blastBall.visible = ball >= 0 && ball < 1
    if (this.blastBall.visible) {
      this.blastBall.position.set(dx, 0.6, dz)
      this.blastBall.scale.setScalar(0.4 + BARREL_RADIUS * 0.85 * (1 - (1 - ball) * (1 - ball)))
      this.blastMat.opacity = 0.3 * (1 - ball) * (1 - ball) * this.fade
    }
    // The rounds in flight, out of the ghost's muzzle as it is posed now.
    let used = 0
    for (const q of shots) {
      const age = now - q.t
      if (age < 0) continue
      const landed = age >= q.fly
      if (landed && was >= q.t + q.fly) continue
      const tg = q.target === 'drum' ? DEMO_DRUM : targets[q.target]?.at
      if (!tg) continue
      const from = muzzleWorld(this.ghost, q.weapon, this.fromV) ?? this.fromV.copy(this.ghost.root.position).setY(1.7)
      const to = this.toV.set(toX(tg[0]), q.y, toZ(tg[1]))
      const len = Math.max(0.1, from.distanceTo(to))
      const ux = (to.x - from.x) / len
      const uy = (to.y - from.y) / len
      const uz = (to.z - from.z) / len
      // Fired this frame: the flash at the muzzle.
      if (p && was < q.t) {
        p.flash(from.x, from.y, from.z, '#ffffff', q.weapon === 'sniper' ? 0.7 : 0.4, 0.06)
        p.flash(from.x, from.y, from.z, GATE_COLOR, q.weapon === 'sniper' ? 1.3 : 0.75, 0.12)
      }
      if (!landed) {
        const b = this.bolts[used++]
        if (!b) continue
        // A bolt its own length, its head where the round is now.
        const head = len * (age / q.fly)
        const bl = Math.max(0.05, Math.min(BOLT_LEN[q.weapon], head))
        b.position.set(from.x + ux * (head - bl), from.y + uy * (head - bl), from.z + uz * (head - bl))
        const w = q.weapon === 'sniper' ? 2.2 : 1.6
        b.scale.set(w, bl, w)
        b.quaternion.setFromUnitVectors(this.upV, this.toV.set(ux, uy, uz))
        b.visible = true
        // A glow at its head: a thin bolt alone is lost across the room.
        p?.emit({ x: from.x + ux * head, y: from.y + uy * head, z: from.z + uz * head, color: HOLO_HOT, size: q.weapon === 'sniper' ? 0.55 : 0.4, sizeEnd: 0.1, life: 0.1 })
        continue
      }
      // Landed this frame: the burst where it went in, and the rifle's line left hanging.
      if (!p) continue
      const big = q.weapon === 'sniper'
      p.flash(to.x, to.y, to.z, '#ffffff', big ? 1.1 : 0.5, 0.08)
      p.flash(to.x, to.y, to.z, GATE_COLOR, big ? 2 : 0.9, 0.18)
      for (let k = 0; k < (big ? 18 : 5); k++) {
        const sp = 2 + Math.random() * (big ? 7 : 4)
        p.emit({
          x: to.x, y: to.y, z: to.z, vx: ux * sp + (Math.random() - 0.5) * 4, vy: Math.random() * 4, vz: uz * sp + (Math.random() - 0.5) * 4,
          color: k % 3 ? GATE_COLOR : HOLO_HOT, size: 0.16, sizeEnd: 0.03, life: 0.3 + Math.random() * 0.3, gravity: 8, drag: 1.5
        })
      }
      if (big) {
        const n = Math.min(40, Math.max(8, Math.floor(len / 0.7)))
        for (let k = 1; k <= n; k++) {
          const d = (k / n) * len
          p.emit({ x: from.x + ux * d, y: from.y + uy * d, z: from.z + uz * d, color: k % 2 ? GATE_COLOR : HOLO_HOT, size: 0.18, sizeEnd: 0.03, life: 0.35 + (k / n) * 0.35 })
        }
      }
    }
    for (let k = used; k < this.bolts.length; k++) this.bolts[k]!.visible = false
  }

  /**
   * A blast in the hologram's light (the drum, the rocket): a white-hot core,
   * the cyan fireball swelling round it, light thrown out and falling, and
   * shock rings racing over the floor. `size` 1 is the drum's.
   */
  private blast(x: number, y: number, z: number, floor: number, size: number): void {
    const fx = this.fx
    if (!fx) return
    const p = fx.particles
    p.flash(x, y, z, '#ffffff', 6 * size, 0.12)
    p.flash(x, y, z, GATE_COLOR, 9 * size, 0.3)
    p.flash(x, y, z, HOLO_DEEP, 11 * size, 0.45)
    for (let k = 0; k < 48 * size; k++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * Math.PI * 0.5
      const sp = (4 + Math.random() * 12) * size
      p.emit({
        x, y, z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 2, vz: Math.sin(a) * Math.cos(e) * sp,
        color: k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? GATE_COLOR : HOLO_DEEP,
        size: 0.35 + Math.random() * 0.45, sizeEnd: 0.05, life: 0.5 + Math.random() * 0.5, gravity: 10, drag: 1.4
      })
    }
    // The drum's shards: heavier, up and out, and down again.
    for (let k = 0; k < 14 * size; k++) {
      const a = (k / 14) * Math.PI * 2
      p.emit({ x, y, z, vx: Math.cos(a) * (3 + Math.random() * 4), vy: 6 + Math.random() * 5, vz: Math.sin(a) * (3 + Math.random() * 4), color: HOLO_HOT, size: 0.26, sizeEnd: 0.12, life: 1.1, gravity: 16, drag: 0.4 })
    }
    // The fireball's body: slow puffs that swell and fade.
    for (let k = 0; k < 12 * size; k++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * 1.6 * size
      p.emit({
        x: x + Math.cos(a) * d, y: y + Math.random(), z: z + Math.sin(a) * d, vx: Math.cos(a) * 1.5, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * 1.5,
        color: k % 2 ? GATE_COLOR : HOLO_DEEP, size: 1.6 * size, sizeEnd: 3.8 * size, life: 0.6 + Math.random() * 0.4, drag: 1.2
      })
    }
    fx.rings.spawn(x, floor + 0.08, z, (BARREL_RADIUS + 1.5) * size, GATE_COLOR, 0.55)
    fx.rings.spawn(x, floor + 0.1, z, 3.6 * size, '#ffffff', 0.35)
  }

  /** The lesson's props: the rope it shoots, the body it burns and the flame. */
  private props(room: number, f: DemoFrame, y: number, time: number): void {
    const r = TRAINING_ROOMS[room]!
    const toX = (v: number): number => (r.x0 + v - 1) * CELL + CELL / 2
    const toZ = (v: number): number => (r.z0 + v - 1) * CELL + CELL / 2
    const dt = this.state.demoT
    // The lesson's hologram guard (#110, #115): it stands (or walks over to the
    // decoy and stares at it, puzzled) until the backstab seizes it, runs it
    // through, and lets it fall.
    const vf = victimFrame(room, dt)
    this.victim.root.visible = !!vf
    if (vf) {
      this.victim.root.position.set(vf.x, 0, vf.z)
      const g = Object.assign(this.victimPose, restGuardPose())
      const puzzled = r.lesson === 'decoy' && f.td < 0 && vf.speed === 0 && dt > 4
      g.time = time
      g.speed = vf.speed
      g.stride = time * 4.5
      g.wary = g.caution = puzzled ? 1 : 0
      g.lookYaw = puzzled ? Math.sin(time * 1.7) * 0.35 : 0
      this.victim.root.rotation.y = f.td >= 0 ? poseBackstabGuard(g, DEMO_BACKSTAB, f.td, vf.yaw) : vf.yaw
      poseGuard(this.victim, g)
    }
    // The rope: from the tower's edge to the platform's, once shot.
    this.rope.visible = f.rope > 0.5
    if (this.rope.visible && !this.ropeBuilt) {
      this.ropeBuilt = true
      const parts = ropeLineParts({ ax: toX(3.5), ay: ROPE_TOWER_H + 0.06, az: toZ(7), bx: toX(7.5), by: ROPE_DECK_H + 0.06, bz: toZ(7) })
      this.rope.geometry.dispose()
      this.rope.geometry = merge(parts)
      for (const p of parts) p.dispose()
    }
    // The hook (#117): out of the raised hand to the top of the wall (or of
    // the deck, out of the jump room's gap, #154), and the line the mech is reeled up on.
    this.hookLine.visible = this.hookHead.visible = !!f.grip && f.hook > 0.01
    if (this.hookLine.visible && f.grip) {
      const hand = lineHandWorld(this.ghost, new Vector3()) ?? new Vector3(f.x + Math.sin(f.yaw) * 0.25, y + 2.05, f.z + Math.cos(f.yaw) * 0.25)
      const top = new Vector3(f.grip.x, f.grip.y, f.grip.z)
      const end = hand.clone().lerp(top, Math.min(1, f.hook))
      const len = Math.max(0.05, hand.distanceTo(end))
      const dir = end.clone().sub(hand).normalize()
      // The cable runs from its foot (the hand) up its length; the head's nose looks along +z.
      this.hookLine.position.copy(hand)
      this.hookLine.scale.set(1, len, 1)
      this.hookLine.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir)
      this.hookHead.position.copy(end)
      this.hookHead.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), dir)
    }
    // The body: down where the guard stood, until the flame takes it.
    this.body.root.visible = f.body > 0.02
    if (this.body.root.visible) {
      this.body.root.position.set(toX(6), 0, toZ(10))
      this.body.root.rotation.y = 0
      this.body.root.scale.setScalar(Math.max(0.05, f.body))
      this.bodyPose.time = time
      poseGuard(this.body, this.bodyPose)
    }
    // The flame: from the mech's hand to the body.
    this.flame.visible = f.burn > 0.5
    if (this.flame.visible) {
      const hx = f.x + Math.sin(f.yaw) * 0.8
      const hz = f.z + Math.cos(f.yaw) * 0.8
      const tgt = new Vector3(toX(6), 0.35, toZ(10))
      const from = new Vector3(hx, y + 1.25, hz)
      const len = Math.max(0.5, from.distanceTo(tgt))
      this.flame.position.copy(from)
      this.flame.scale.set(1 + 0.15 * Math.sin(time * 30), len, 1 + 0.15 * Math.cos(time * 27))
      // The cone's tip is its local origin; it opens along −y toward the body.
      this.flame.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), tgt.sub(from).normalize()))
    }
  }

  dispose(): void {
    disposeBeacon(this.alarmPost)
    this.alarmWash.geometry.dispose()
    ;(this.alarmWash.material as MeshBasicMaterial).map?.dispose()
    ;(this.alarmWash.material as MeshBasicMaterial).dispose()
    this.boltGeo.dispose()
    this.boltMat.dispose()
    this.drum.geometry.dispose()
    this.blastBall.geometry.dispose()
    this.blastMat.dispose()
    this.ghost.mesh.geometry.dispose()
    this.ghost.outline?.geometry.dispose()
    this.ghost.material.dispose()
    this.ghost.glowMaterial.dispose()
    this.holo.dispose()
    this.body.mesh.geometry.dispose()
    this.body.outline?.geometry.dispose()
    this.body.material.dispose()
    this.body.glowMaterial.dispose()
    disposeDisguise(this.disguise)
    this.decoyOrb.geometry.dispose()
    this.decoyHolo.dispose()
    this.victim.mesh.geometry.dispose()
    this.victim.outline?.geometry.dispose()
    this.victim.material.dispose()
    this.victim.glowMaterial.dispose()
    for (const rig of this.guards) { rig.mesh.geometry.dispose(); rig.outline?.geometry.dispose(); rig.material.dispose(); rig.glowMaterial.dispose() }
    this.holoMech.mesh.geometry.dispose()
    this.holoMech.outline?.geometry.dispose()
    this.holoMech.material.dispose()
    this.holoMech.glowMaterial.dispose()
    this.rocketMesh.traverse((o: Object3D) => { if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose() })
    this.shatter.dispose()
    this.rope.geometry.dispose()
    this.hookLine.geometry.dispose()
    this.hookHead.geometry.dispose()
    this.flame.geometry.dispose()
    this.discMat.dispose()
    this.discGeo.dispose()
    this.barsGeo.dispose()
    this.crawlBarsGeo.dispose()
    this.gateMat.dispose()
    this.barMat.dispose()
    this.gateGeo.dispose()
    this.crawlGateGeo.dispose()
    this.barGeo.dispose()
  }
}

/** How far ahead of the searchlight's pool (metres past its edge) the disguise demo stops for it. */
const LIGHT_WARN_M = 1.6

/** The disguise room's alarm post (room cells): at the corridor's far mouth, its north edge, in sight all down the corridor and clear of the walk to the way out. */
const ALARM_POST: readonly [number, number] = [10, 5.6]
const ALARM_RED = '#ff2a4a'

/** A red vignette for the alarm's wash: clear in the middle, full at the edges (built in code: no canvas). */
const vignette = (): DataTexture => {
  const n = 64
  const px = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5
      const dy = (y + 0.5) / n - 0.5
      const r = Math.min(1, Math.hypot(dx, dy) / 0.5)
      const a = Math.round(255 * (0.25 + 0.75 * r * r))
      const i = (y * n + x) * 4
      px[i] = px[i + 1] = px[i + 2] = a
      px[i + 3] = 255
    }
  }
  const t = new DataTexture(px, n, n)
  t.needsUpdate = true
  return t
}

/** The last round a demo has fired by `time`, if any (the gun's kick). */
const lastShot = (shots: readonly DemoShot[] | undefined, time: number): DemoShot | null => {
  let out: DemoShot | null = null
  for (const q of shots ?? []) if (q.t <= time && (!out || q.t > out.t)) out = q
  return out
}
