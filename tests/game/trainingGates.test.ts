// #168, #171: the training rooms' gates and holograms. A room's lesson is
// judged by what is done in that room (never by the room just left), the
// hologram plays by its projector and not through a shut door, a shut door
// says what it wants, the disguise room's lamp no longer stun-locks a mech
// sent back, and a decoy holds whoever comes to look at it.

import { describe, expect, it } from 'vitest'
import { LESSON_IDS, TRAINING_ROOMS, buildTrainingGround, roomCell } from '@/game/data/fortresses/training'
import {
  DEMO_NEAR_M, DOOR_LINES, atShutDoor, doorOf, entryOf, lessonDone, makeTraining, stepTraining, type TrainingContext
} from '@/game/sim/training'
import { CAGED_RADIUS, DECOY_WATCH_S, SPOT_RADIUS, drainEvents, lureTo, makeGarrison, spotCentre, spotRadius, stepGarrison, type Target } from '@/game/sim/garrison'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { MECH_HEIGHT } from '@/game/models/mech'
import en from '@/i18n/locales/en'

const room = (id: (typeof LESSON_IDS)[number]): number => LESSON_IDS.indexOf(id)
const ctx = (x: number, z: number, more: Partial<TrainingContext> = {}): TrainingContext => ({
  x, y: 0, z, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0,
  supplies: 0, stocked: false, burns: 0, ropes: 0, ...more
})
const at = (i: number, lx: number, lz: number): { x: number; z: number } => {
  const [cx, cz] = roomCell(i, lx, lz)
  return { x: cellMid(cx), z: cellMid(cz) }
}
const DT = 1 / 30

describe('a room is judged by what is done in it (#168)', () => {
  it('walking in with the room before emptied does not finish this one', () => {
    const t = makeTraining()
    const w = room('weapons')
    const r = room('rocket')
    t.room = w
    t.done = t.done.map((_, i) => i <= w)
    // The step that walks into the launcher's room, the weapons room behind it emptied.
    const e = at(r, 1, 7)
    const ev = stepTraining(t, ctx(e.x, e.z, { cleared: true }), DT)
    expect(ev.map(x => x.type)).toEqual(['enter'])
    expect(t.done[r]).toBe(false)
    // Its hologram is playing.
    expect(t.demoT).toBeGreaterThanOrEqual(0)
    // Only the launcher's own target down opens it.
    stepTraining(t, ctx(e.x, e.z, { cleared: false }), DT)
    expect(t.done[r]).toBe(false)
    stepTraining(t, ctx(e.x, e.z, { cleared: true }), DT)
    expect(t.done[r]).toBe(true)
  })

  it('the cover room wants one crouch on the way to its door (#171)', () => {
    const c = room('cover')
    const d = doorOf(c)!
    const b = ctx(0, 0, { crouches: 2 })
    expect(lessonDone(c, ctx(d.x - 1, d.z, { crouches: 2 }), b)).toBe(false)
    expect(lessonDone(c, ctx(d.x - 1, d.z, { crouches: 3 }), b)).toBe(true)
  })
})

describe('the hologram plays by its projector (#168)', () => {
  it('stops after its loop once the mech walks off, and plays again when it comes back', () => {
    const t = makeTraining()
    const i = room('rocket')
    t.room = i - 1
    t.done = t.done.map((_, k) => k < i)
    const e = entryOf(i)
    stepTraining(t, ctx(e.x, e.z), DT)
    expect(t.demoT).toBeGreaterThanOrEqual(0)
    // Far down the room: the loop plays out and does not come round again.
    const far = at(i, 9, 2)
    expect(Math.hypot(far.x - e.x, far.z - e.z)).toBeGreaterThan(DEMO_NEAR_M)
    for (let k = 0; k < 30 / DT; k++) stepTraining(t, ctx(far.x, far.z), DT)
    expect(t.demoT).toBe(-1)
    // Back by the disc: at once.
    stepTraining(t, ctx(e.x + 1, e.z), DT)
    expect(t.demoT).toBeGreaterThanOrEqual(0)
  })

  it('never through a shut door: by the next room\'s disc from this side, nothing plays there', () => {
    const t = makeTraining()
    const i = room('rocket')
    t.room = i - 1
    t.done = t.done.map((_, k) => k < i - 1)
    t.demoT = -1
    const d = doorOf(i - 1)!
    stepTraining(t, ctx(d.x - 1.5, d.z), DT)
    expect(t.room).toBe(i - 1)
  })
})

describe('a shut door says what it wants (#171)', () => {
  it('every lesson whose door waits on more than walking up to it has a line, in English', () => {
    for (const [k, r] of TRAINING_ROOMS.entries()) {
      if (!r.door || ['move', 'jump', 'box', 'hook', 'extract'].includes(r.lesson)) continue
      const say = DOOR_LINES[r.lesson]
      expect(say, r.lesson).toBeTruthy()
      const [, key] = say!.line.split('.')
      expect((en.training.door as Record<string, string>)[key!], r.lesson).toBeTruthy()
      void k
    }
  })

  it('only from inside the room, at the door, while the lesson is to do', () => {
    const t = makeTraining()
    const c = room('cover')
    t.room = c
    const d = doorOf(c)!
    expect(atShutDoor(t, c, ctx(d.x - 1.2, d.z))).toBe(true)
    expect(atShutDoor(t, c, ctx(d.x - 8, d.z))).toBe(false)
    t.done[c] = true
    expect(atShutDoor(t, c, ctx(d.x - 1.2, d.z))).toBe(false)
  })
})

describe('the disguise room\'s lamp (#171)', () => {
  const f = buildTrainingGround()
  const gar = makeGarrison(f)
  const lamp = gar.units.find(u => u.kind === 'searchlight' && u.caged)!
  const box = room('box')

  it('is 40 % narrower than a searchlight, then 15 % narrower again', () => {
    expect(spotRadius(lamp)).toBeCloseTo(SPOT_RADIUS * 0.6 * 0.85, 6)
    expect(CAGED_RADIUS).toBeCloseTo(2.295, 6)
  })

  it('starts at the far end: a mech sent back to the way in is not stood in its pool again', () => {
    const e = entryOf(box)
    const c = spotCentre(lamp)
    expect(Math.hypot(c.x - e.x, c.z - e.z)).toBeGreaterThan(spotRadius(lamp) + 6)
  })
})

describe('a decoy holds whoever comes to look (#171)', () => {
  const yard = (): FortressBuilder => {
    const b = new FortressBuilder('test', 24, 24)
    b.ground(0, 0, 23, 23)
    b.insert(1, 1).extract(22, 22)
    return b
  }
  const away: Target = { x: cellMid(1), y: 0, z: cellMid(1), height: MECH_HEIGHT, crouched: false, visible: false }

  it('a guard stands at it for its four seconds and puts one round into it', () => {
    const f = yard().sentry(10, 5, 0).build()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    const dx = cellMid(14)
    const dz = cellMid(12)
    lureTo(gar, f.grid, dx, 0, dz, 20)
    let still = 0
    let shots = 0
    for (let t = 0; t < 30; t += 1 / 60) {
      const x = u.x
      const z = u.z
      stepGarrison(gar, f.grid, away, 1 / 60)
      // A decoy keeps pulsing while it lives.
      if (t < 9 && Math.floor(t / 0.6) !== Math.floor((t + 1 / 60) / 0.6)) lureTo(gar, f.grid, dx, 0, dz, 20)
      shots += drainEvents(gar).filter(e => e.type === 'decoyShot').length
      if (u.decoyWatch > 0 && Math.hypot(u.x - x, u.z - z) < 1e-6) still += 1 / 60
    }
    expect(shots).toBe(1)
    expect(still).toBeGreaterThan(DECOY_WATCH_S - 0.2)
  })

  it('the machines that walk come too', () => {
    const f = yard().build()
    f.posts.push({ kind: 'roomba', x: cellMid(10), z: cellMid(5), facing: 0, route: [] } as never)
    const gar = makeGarrison(f)
    expect(lureTo(gar, f.grid, cellMid(14), 0, cellMid(12), 20)).toBe(1)
  })
})
