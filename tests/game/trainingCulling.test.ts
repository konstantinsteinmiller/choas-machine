// Perf (a weak phone at 10 fps on 230 draw calls in the training's first room):
// the training ground is one long row of rooms behind 16 m walls, looked
// straight down, so frustum culling kept all of it. Only the room the mech is
// in, the one behind and the two ahead (through the glass gates) are drawn;
// a gate is two draws (glass, its bars), a projector disc one.

import { describe, expect, it } from 'vitest'
import { Mesh, Scene } from 'three'
import { TrainingDirector } from '@/game/sim/trainingDirector'
import { buildTrainingGround, TRAINING_ROOMS } from '@/game/data/fortresses/training'
import { makeGarrison } from '@/game/sim/garrison'
import { CELL } from '@/game/world/grid'

const make = () => {
  const f = buildTrainingGround()
  const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1))
  return d as unknown as TrainingDirector & { gates: Array<Mesh | null>; discs: Mesh[]; state: { room: number } }
}

describe('the training draws only the rooms round the mech', () => {
  it('the one it is in, the one behind and the two ahead', () => {
    const d = make()
    d.state.room = 0
    expect(d.cullRooms()).toMatchObject({ lo: 0, hi: 2 })
    d.state.room = 5
    const s = d.cullRooms()
    expect(s).toMatchObject({ lo: 4, hi: 7 })
    expect(s.xMin).toBeLessThanOrEqual(TRAINING_ROOMS[4]!.x0 * CELL)
    expect(s.xMax).toBeGreaterThanOrEqual((TRAINING_ROOMS[7]!.x1 + 1) * CELL)
    d.state.room = TRAINING_ROOMS.length - 1
    expect(d.cullRooms().hi).toBe(TRAINING_ROOMS.length - 1)
  })

  it('gates and discs outside that span are not drawn; a gate is two draws, a disc one', () => {
    const d = make()
    d.state.room = 5
    d.cullRooms()
    d.update(1 / 60, 0)
    d.gates.forEach((g, i) => {
      if (!g) return
      expect(g.visible, `gate ${i}`).toBe(i >= 4 && i <= 7)
      let meshes = 0
      g.traverse(o => { if ((o as Mesh).isMesh) meshes++ })
      expect(meshes, `gate ${i}`).toBe(2)
    })
    d.discs.forEach((disc, i) => {
      expect(disc.children.length).toBe(0)
      if (i < 4 || i > 7) expect(disc.visible, `disc ${i}`).toBe(false)
    })
  })
})

describe('the marker points at what the room asks for', () => {
  it('the burn room: the body, not the door (a playtester was sent to the door); after, the door', async () => {
    const { killUnit } = await import('@/game/sim/garrison')
    const { LESSON_IDS } = await import('@/game/data/fortresses/training')
    const { roomAt, doorOf } = await import('@/game/sim/training')
    const f = buildTrainingGround()
    const gar = makeGarrison(f, 1)
    const d = new TrainingDirector(new Scene(), f, gar) as unknown as TrainingDirector & { state: { room: number; done: boolean[] } }
    const i = LESSON_IDS.indexOf('burn')
    const body = gar.units.find(u => roomAt(u.homeX) === i)!
    killUnit(gar, body.id, body.x, body.z - 1, 'blade')
    d.state.room = i
    const w = d.waypoint()!
    expect(Math.hypot(w.x - body.x, w.z - body.z)).toBeLessThan(0.5)
    d.state.done[i] = true
    const door = doorOf(i)!
    expect(Math.hypot(d.waypoint()!.x - door.x, d.waypoint()!.z - door.z)).toBeLessThan(0.5)
  })

  it('the weapons room marks its three, the blade room its two; each until it is down', async () => {
    const { killUnit } = await import('@/game/sim/garrison')
    const { LESSON_IDS } = await import('@/game/data/fortresses/training')
    const { roomAt } = await import('@/game/sim/training')
    const f = buildTrainingGround()
    const gar = makeGarrison(f, 1)
    const d = new TrainingDirector(new Scene(), f, gar) as unknown as TrainingDirector & { state: { room: number; done: boolean[] } }
    for (const [lesson, n] of [['weapons', 3], ['blade', 2]] as const) {
      const i = LESSON_IDS.indexOf(lesson)
      d.state.room = i
      const marks = d.targetMarks()
      expect(marks, lesson).toHaveLength(n)
      const units = gar.units.filter(u => roomAt(u.homeX) === i)
      // Over each one's head.
      for (const u of units) expect(marks.some(m => Math.hypot(m.x - u.x, m.z - u.z) < 0.1 && m.y > u.y + 1.5), lesson).toBe(true)
      killUnit(gar, units[0]!.id, units[0]!.x, units[0]!.z - 1, 'blade')
      expect(d.targetMarks(), lesson).toHaveLength(n - 1)
      d.state.done[i] = true
      expect(d.targetMarks(), lesson).toHaveLength(0)
    }
    // Not the decoy room's guard (it is to be lured), nor a room without guards.
    d.state.room = LESSON_IDS.indexOf('decoy')
    expect(d.targetMarks()).toHaveLength(0)
    d.state.room = LESSON_IDS.indexOf('move')
    expect(d.targetMarks()).toHaveLength(0)
  })

  it('the rocket room: the objective marker over the mech on the ledge until it is down, then the door', async () => {
    const { killUnit } = await import('@/game/sim/garrison')
    const { LESSON_IDS } = await import('@/game/data/fortresses/training')
    const { roomAt, doorOf } = await import('@/game/sim/training')
    const f = buildTrainingGround()
    const gar = makeGarrison(f, 1)
    const d = new TrainingDirector(new Scene(), f, gar) as unknown as TrainingDirector & { state: { room: number; done: boolean[] } }
    const i = LESSON_IDS.indexOf('rocket')
    d.state.room = i
    const mech = gar.units.find(u => roomAt(u.homeX) === i)!
    const w = d.waypoint()!
    expect(Math.hypot(w.x - mech.x, w.z - mech.z)).toBeLessThan(0.1)
    // Over its head, not inside it.
    expect(w.y).toBeGreaterThan(mech.y + 3)
    // Not twice: no skull mark over it as well.
    expect(d.targetMarks()).toHaveLength(0)
    killUnit(gar, mech.id, mech.x, mech.z + 2, 'blast')
    const door = doorOf(i)!
    expect(Math.hypot(d.waypoint()!.x - door.x, d.waypoint()!.z - door.z)).toBeLessThan(0.5)
  })

  it('the decoy room: no marker while its guard is still to take', async () => {
    const { LESSON_IDS } = await import('@/game/data/fortresses/training')
    const d = make() as unknown as TrainingDirector & { state: { room: number } }
    d.state.room = LESSON_IDS.indexOf('decoy')
    expect(d.waypoint()).toBeNull()
  })
})

describe('the door marker stands in the doorway, not on the wall over it', () => {
  it('in every room, gate shut or open: at the height of the floor inside it (the jump room put it on the wall)', async () => {
    const { doorOf } = await import('@/game/sim/training')
    const { heightAt } = await import('@/game/world/grid')
    const f = buildTrainingGround()
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1)) as unknown as TrainingDirector & { state: { room: number; done: boolean[] } }
    for (let i = 0; i < TRAINING_ROOMS.length; i++) {
      const door = doorOf(i)
      if (!door) continue
      d.state.room = i
      d.state.done[i] = true
      const w = d.waypoint()
      if (!w || Math.hypot(w.x - door.x, w.z - door.z) > 0.5) continue
      const floor = Math.max(0, heightAt(f.grid, door.x - CELL, door.z))
      expect(w.y - floor, `room ${i} (${TRAINING_ROOMS[i]!.lesson})`).toBeCloseTo(1.4, 1)
    }
  })
})
