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

  it('the decoy room: no marker while its guard is still to take', async () => {
    const { LESSON_IDS } = await import('@/game/data/fortresses/training')
    const d = make() as unknown as TrainingDirector & { state: { room: number } }
    d.state.room = LESSON_IDS.indexOf('decoy')
    expect(d.waypoint()).toBeNull()
  })
})
