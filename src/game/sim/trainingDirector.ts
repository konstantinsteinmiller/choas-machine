import { AdditiveBlending, BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, type Scene } from 'three'
import { CELL, CellKind, cellMid, heightAt, VOID, type Grid } from '../world/grid'
import type { Fortress } from '../world/fortress'
import { ROOM_WALL_H, TRAINING_ROOMS } from '../data/fortresses/training'
import { buildMech, poseMech, restPose, type MechPose } from '../models/mech'
import type { Rig } from '../models/kit'
import type { Garrison } from './garrison'
import {
  demoFrame, doorOf, entryOf, makeTraining, replayDemo, rewindRoom, roomAt, stepTraining,
  type Training, type TrainingContext, type TrainingEvent
} from './training'
import type { HintId } from './coach'

/**
 * ─── The training ground, on screen ──────────────────────────────────────────
 *
 * Draws what `training.ts` decides: the ghost that shows each lesson, and the
 * light gates in the doorways that open once a lesson is done. The gates
 * stand in the grid too (a column of wall the height of the room's), raised
 * after the fortress mesh is built, so the floor under them is drawn and
 * nothing walks or sees through them until they open.
 *
 * Being seen sends the mech back to the room's door and the room's defenders
 * back to their places (`resetRoom`): the training ground has no alarm.
 */

const GATE_COLOR = '#5fe9ff'

export class TrainingDirector {
  readonly state: Training = makeTraining()
  readonly group = new Group()
  private ghost: Rig
  private ghostMat: MeshBasicMaterial
  private ghostPose: MechPose = restPose()
  private gates: Array<Mesh | null> = []
  private gateMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })
  private barMat = new MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  private gateGeo: BoxGeometry
  private barGeo: BoxGeometry
  private lastX = 0
  private lastZ = 0

  constructor(scene: Scene, private fortress: Fortress, private gar: Garrison) {
    this.ghost = buildMech()
    this.ghostMat = new MeshBasicMaterial({ color: '#8ff4ff', transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    this.ghost.mesh.material = this.ghostMat
    if (this.ghost.outline) this.ghost.outline.visible = false
    this.ghost.root.visible = false
    this.group.add(this.ghost.root)
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

  /** The replay button. */
  replay(): boolean {
    return replayDemo(this.state)
  }

  /** The control the demo is showing right now, if one is playing. */
  hint(): HintId | null {
    const t = this.state
    if (t.demoT < 0 || t.room < 0) return null
    return demoFrame(t.room, t.demoT).hint
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
      case 'weapons': case 'blade': return done && door ? at(door.x, door.z) : null
      default: return door ? at(door.x, door.z) : null
    }
  }

  /** Seen: the room's defenders back at their places, the mech at its door. */
  resetRoom(place: (x: number, z: number, yaw: number) => void): void {
    const t = this.state
    const room = Math.max(0, t.room)
    t.resets++
    rewindRoom(this.gar, room)
    const e = entryOf(room)
    place(e.x, e.z, Math.PI / 2)
  }

  /** Pose the ghost for this frame. */
  update(dt: number, time: number): void {
    const t = this.state
    const on = t.demoT >= 0 && t.room >= 0
    this.ghost.root.visible = on
    if (!on) return
    const f = demoFrame(t.room, t.demoT)
    const floor = heightAt(this.fortress.grid, f.x, f.z)
    const base = floor === VOID ? 0 : floor
    // A hook demo climbs a wall: the ghost rises above the floor it starts on.
    const y = Math.max(base, f.y > 0 ? f.y : base)
    this.ghost.root.position.set(f.x, y, f.z)
    this.ghost.root.rotation.y = f.yaw
    const s = this.ghostPose
    const moved = Math.hypot(f.x - this.lastX, f.z - this.lastZ)
    this.lastX = f.x
    this.lastZ = f.z
    s.time = time
    s.stride += moved * 2.2
    s.speed = f.speed
    s.crouch = f.crouch
    s.aim = f.aim
    s.weapon = f.weapon
    s.stab = f.stab
    s.blade = f.stab > 0.01 ? 1 : 0
    s.boxed = f.boxed
    s.loot = f.loot
    s.climb = f.y > 0.3 && f.y < 5.8 ? 1 : 0
    s.climbPhase = f.y
    poseMech(this.ghost, s)
    // It breathes, so it reads as a show and not a second mech.
    this.ghostMat.opacity = 0.32 + 0.1 * Math.sin(time * 4)
    this.gateMat.opacity = 0.26 + 0.08 * Math.sin(time * 3)
    void dt
  }

  dispose(): void {
    this.ghost.mesh.geometry.dispose()
    this.ghost.outline?.geometry.dispose()
    this.ghost.material.dispose()
    this.ghost.glowMaterial.dispose()
    this.ghostMat.dispose()
    this.gateMat.dispose()
    this.barMat.dispose()
    this.gateGeo.dispose()
    this.barGeo.dispose()
  }
}
