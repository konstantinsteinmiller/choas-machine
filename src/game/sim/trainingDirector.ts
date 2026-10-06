import {
  AdditiveBlending, BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  Quaternion, RingGeometry, SphereGeometry, Vector3, type Camera, type Object3D, type Scene, type ShaderMaterial
} from 'three'
import { demoPop } from '../state/hud'
import { CELL, CellKind, cellMid, heightAt, VOID, type Grid } from '../world/grid'
import type { Fortress } from '../world/fortress'
import { ROCKET_LEDGE_H, ROCKET_TARGET, ROOM_WALL_H, ROPE_DECK_H, ROPE_TOWER_H, TRAINING_ROOMS } from '../data/fortresses/training'
import { VARIANTS } from './backstab'
import { poseBackstabGuard, poseBackstabMech } from './backstabStage'
import { muzzleWorld, buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import { buildEnforcer, buildGuard, poseEnforcer, poseGuard, restGuardPose } from '../models/garrison'
import { Shatter } from '../fx/shatter'
import { mechGaitRate } from './gait'
import { buildDisguise, disposeDisguise } from '../models/disguises'
import { FREE_DISGUISE } from '../models/disguiseIds'
import { makeHologramMaterial, setHologram } from '../fx/hologram'
import type { Rig } from '../models/kit'
import type { Garrison } from './garrison'
import {
  DEMO_BACKSTAB, currentFrame, demoFrame, victimFrame, doorOf, entryOf, makeTraining, replayDemo, rewindRoom, roomAt, stepTraining,
  type DemoFrame, type Training, type TrainingContext, type TrainingEvent
} from './training'
import type { HintId } from './coach'

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
  private rope: Mesh
  private hookLine: Mesh
  private hookHead: Mesh
  private flame: Mesh
  /** The decoy lesson's decoy (#114): an orb in flight, then a hologram of the mech where it lands. */
  private decoyOrb: Mesh
  private decoyHolo: Rig
  private lastPress = ''
  private popV = new Vector3()
  /** The blade room's hologram guard, taken from behind on every loop (#110). */
  private victim: Rig
  private victimPose = restGuardPose()
  /** The weapons room's targets, in the same light: they fall to the demo's rounds (#109). */
  private targets: Array<{ rig: Rig; at: readonly [number, number]; yaw: number; dies: number; death: 'back' | 'front' | 'thrown' }> = []
  /** The weapons room's rounds (#168), drawn as a streak from the muzzle. */
  private streak: Mesh
  /** The rocket room's hologram (#146): the armoured mech on the ledge, the rocket, and the mech in pieces. */
  private holoMech: Rig
  private rocketMesh: Group
  private shatter: Shatter
  private broken = false
  private muzzleV = new Vector3()
  /** A projector disc by each room's way in. */
  private discs: Mesh[] = []
  private discMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  private discGeo = new RingGeometry(0.55, 0.85, 32)
  private discCoreGeo = new CircleGeometry(0.45, 24)
  /** The last frame shown, held while the hologram dissolves after its lesson is done. */
  private fade = 0
  private fadeRoom = -1
  private gates: Array<Mesh | null> = []
  private gateMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
  private barMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  private gateGeo: BoxGeometry
  private barGeo: BoxGeometry
  private lastX = 0
  private lastZ = 0

  constructor(scene: Scene, private fortress: Fortress, private gar: Garrison) {
    this.ghost = buildMech()
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
    this.rope = new Mesh(new CylinderGeometry(0.05, 0.05, 1, 6), this.holo)
    this.rope.visible = false
    this.group.add(this.rope)
    // The grappling hook's line and its three-pronged head (#117), as the mission draws them.
    this.hookLine = new Mesh(new CylinderGeometry(0.03, 0.03, 1, 6), this.holo)
    this.hookHead = new Mesh(new ConeGeometry(0.16, 0.34, 3), this.holo)
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
    this.decoyHolo = buildMech()
    this.decoyHolo.mesh.material = this.holo
    if (this.decoyHolo.outline) this.decoyHolo.outline.visible = false
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
    // The weapons room's rounds (#168): a streak of light from the ghost's muzzle to each target as it falls.
    this.streak = new Mesh(new CylinderGeometry(0.025, 0.025, 1, 6, 1, true), this.holo)
    this.streak.geometry.translate(0, 0.5, 0)
    this.streak.visible = false
    this.group.add(this.streak)
    this.shatter = new Shatter(fortress.grid)
    this.group.add(this.shatter.group)
    // The sentry the rifle takes, the two the minigun cuts down (as the demo's keys time them).
    for (const [at, yaw, dies, death] of [[[10, 2], Math.PI, 1.85, 'back'], [[8, 11], 0, 4.1, 'front'], [[9, 11], 0, 4.4, 'back']] as const) {
      const rig = buildGuard()
      rig.mesh.material = this.holo
      if (rig.outline) rig.outline.visible = false
      rig.root.visible = false
      this.group.add(rig.root)
      this.targets.push({ rig, at, yaw, dies, death })
    }
    TRAINING_ROOMS.forEach((r, i) => {
      // The disc stands where the hologram starts, by the way in.
      const e = entryOf(i)
      const disc = new Mesh(this.discGeo, this.discMat)
      disc.add(new Mesh(this.discCoreGeo, this.discMat))
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
    for (const r of TRAINING_ROOMS) {
      if (!r.door) { this.gates.push(null); continue }
      const g = new Mesh(this.gateGeo, this.gateMat)
      g.position.set(cellMid(r.door.cx), 0, (cellMid(r.door.cz0) + cellMid(r.door.cz1)) / 2)
      for (const y of [0.6, 1.5, 2.4, 3.3]) {
        const bar = new Mesh(this.barGeo, this.barMat)
        bar.position.y = y
        g.add(bar)
      }
      this.group.add(g)
      this.gates.push(g)
      this.setDoor(r.door, true)
    }
    scene.add(this.group)
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
    const ev = stepTraining(this.state, c, dt)
    for (const e of ev) {
      if (e.type !== 'done') continue
      const r = TRAINING_ROOMS[e.room]!
      const g = this.gates[e.room]
      if (r.door && g) { this.setDoor(r.door, false); g.visible = false }
    }
    return ev
  }

  /** DEV CHEAT (#116): every room before `i` done and its gate open, the demo reset. */
  skipTo(i: number): void {
    TRAINING_ROOMS.forEach((r, k) => {
      if (k >= i || this.state.done[k]) return
      this.state.done[k] = true
      const g = this.gates[k]
      if (r.door && g) { this.setDoor(r.door, false); g.visible = false }
    })
    this.state.room = Math.min(this.state.room, i - 1)
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
   * hook wall, the beacon, the pile, the pad), or the open door once the
   * lesson is done; nothing while a weapons or blade lesson is still to do.
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
    const door = doorOf(t.room)
    const done = t.done[t.room]
    switch (r.lesson) {
      case 'hook': return at(cellMid(r.x1 + 1), (r.z0 + 6.5) * CELL, 0.6)
      case 'beacon': {
        const b = this.gar.beacons[0]
        return !done && b ? at(b.x, b.z, 2.2) : door ? at(door.x, door.z) : null
      }
      case 'salvage': {
        const p = this.fortress.salvage[0]
        return !done && p ? at(p.x, p.z, 1.6) : door ? at(door.x, door.z) : null
      }
      case 'extract': return at(this.fortress.extract.x, this.fortress.extract.z, 1.2)
      case 'weapons': case 'blade': case 'rocket': return done && door ? at(door.x, door.z) : null
      default: return door ? at(door.x, door.z) : null
    }
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
    // A projector disc glows while its room's lesson is still to do.
    this.discs.forEach((d, i) => { d.visible = !t.done[i] })
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
      for (const tg of this.targets) tg.rig.root.visible = false
      this.victim.root.visible = false
      this.holoMech.root.visible = this.rocketMesh.visible = this.streak.visible = false
      if (this.broken) { this.shatter.clear(HOLO_WRECK); this.broken = false }
      return
    }
    if (!playing) return
    const f = currentFrame(t)
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
    s.grab = s.draw = s.plunge = 0
    s.stow = 0
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
    this.fireRocket(t.room, f, time, dt)
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
    const p = this.popV.set(f.x, y + 3, f.z).project(camera)
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
    // Standing where it fell, facing back the way it came, breathing.
    const r = this.decoyHolo.root
    r.position.set(d.x, 0, d.z)
    r.rotation.y = f.yaw + Math.PI
    const grow = Math.min(1, (d.t - DECOY_FLY_S) / 0.25)
    r.scale.setScalar(grow * (1 + Math.sin(time * 6) * 0.02))
    poseMech(this.decoyHolo, { ...restPose(), time })
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
    const tx = (r.x0 + ROCKET_TARGET[0] - 1) * CELL + CELL / 2
    const tz = (r.z0 + ROCKET_TARGET[1] - 1) * CELL + CELL / 2
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
      const to = new Vector3(tx, ROCKET_LEDGE_H + 1.9, tz)
      const k = Math.min(1, rk.t / ROCKET_FLY_S)
      this.rocketMesh.position.copy(from).lerp(to, k)
      this.rocketMesh.lookAt(to)
    }
    if (here && hit && !this.broken) {
      this.holoMech.root.visible = true
      this.holoMech.root.updateMatrixWorld(true)
      this.broken = this.shatter.break(HOLO_WRECK, this.holoMech, { dirX: -0.3, dirZ: 1, force: 7, seed: 0.3, material: this.holo })
      this.holoMech.root.visible = false
    }
  }

  /** The lesson's props: the rope it shoots, the body it burns and the flame, the targets that fall. */
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
    this.streak.visible = false
    for (const [k, tg] of this.targets.entries()) {
      tg.rig.root.visible = r.lesson === 'weapons'
      if (!tg.rig.root.visible) continue
      tg.rig.root.position.set(toX(tg.at[0]), 0, toZ(tg.at[1]))
      tg.rig.root.rotation.y = tg.yaw
      const down = dt >= tg.dies
      poseGuard(tg.rig, { ...restGuardPose(), time: time + tg.at[0], deadT: down ? Math.max(1e-3, dt - tg.dies) : 0, death: tg.death })
      // The round that takes it (#168): the rifle's one streak, the mini-gun's
      // flicker of them through its burst; out of the ghost's own muzzle.
      const lead = dt - (tg.dies - (k === 0 ? 0.12 : 0.55))
      const on = lead > 0 && dt < tg.dies && (k === 0 || Math.floor(time * 24) % 2 === 0)
      if (on && !this.streak.visible) {
        const from = muzzleWorld(this.ghost, f.weapon, this.muzzleV) ?? this.muzzleV.copy(this.ghost.root.position)
        const to = new Vector3(toX(tg.at[0]), 1.35, toZ(tg.at[1]))
        const len = from.distanceTo(to)
        this.streak.position.copy(from)
        this.streak.scale.set(1, len, 1)
        this.streak.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.sub(from).normalize())
        this.streak.visible = true
      }
    }
    // The rope: from the tower's edge to the platform's, once shot.
    this.rope.visible = f.rope > 0.5
    if (this.rope.visible) {
      const a = new Vector3(toX(3.5), ROPE_TOWER_H + 0.06, toZ(7))
      const b = new Vector3(toX(7.5), ROPE_DECK_H + 0.06, toZ(7))
      this.rope.position.copy(a).add(b).multiplyScalar(0.5)
      this.rope.scale.set(1, a.distanceTo(b), 1)
      this.rope.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.sub(a).normalize()))
    }
    // The hook (#117): out of the raised hand to the top of the wall (or of
    // the deck, out of the jump room's gap, #154), and the line the mech is reeled up on.
    this.hookLine.visible = this.hookHead.visible = !!f.grip && f.hook > 0.01
    if (this.hookLine.visible && f.grip) {
      const hand = new Vector3(f.x + Math.sin(f.yaw) * 0.25, y + 2.05, f.z + Math.cos(f.yaw) * 0.25)
      const top = new Vector3(f.grip.x, f.grip.y, f.grip.z)
      const end = hand.clone().lerp(top, Math.min(1, f.hook))
      const len = Math.max(0.05, hand.distanceTo(end))
      this.hookLine.position.copy(hand).add(end).multiplyScalar(0.5)
      this.hookLine.scale.set(1, len, 1)
      this.hookLine.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), end.clone().sub(hand).normalize())
      this.hookHead.position.copy(end)
      this.hookHead.quaternion.copy(this.hookLine.quaternion)
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
    this.streak.geometry.dispose()
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
    this.decoyHolo.mesh.geometry.dispose()
    this.decoyHolo.outline?.geometry.dispose()
    this.decoyHolo.material.dispose()
    this.decoyHolo.glowMaterial.dispose()
    this.victim.mesh.geometry.dispose()
    this.victim.outline?.geometry.dispose()
    this.victim.material.dispose()
    this.victim.glowMaterial.dispose()
    for (const tg of this.targets) { tg.rig.mesh.geometry.dispose(); tg.rig.outline?.geometry.dispose(); tg.rig.material.dispose(); tg.rig.glowMaterial.dispose() }
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
    this.discCoreGeo.dispose()
    this.gateMat.dispose()
    this.barMat.dispose()
    this.gateGeo.dispose()
    this.barGeo.dispose()
  }
}
