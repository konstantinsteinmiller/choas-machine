// Round 5 (#146): the rocket launcher's own training room. An armoured mech
// stands up on a ledge behind a parapet: nothing walks up there, rounds and
// the blade glance off it, and only a rocket's blast takes it. The hologram
// shows the launcher drawn (3), the rocket leaving its nose, the mech coming
// apart.

import { describe, expect, it } from 'vitest'
import {
  LESSON_IDS, ROCKET_LEDGE_H, ROCKET_PARAPET_H, ROCKET_TARGET, ROCKET_TARGET_HP, TRAINING_ROOMS, buildTrainingGround, roomCell
} from '@/game/data/fortresses/training'
import { CELL, WALK, cellMid, findPath, heightAt } from '@/game/world/grid'
import { alarmUnit, makeGarrison } from '@/game/sim/garrison'
import { blast } from '@/game/sim/damage'
import { DEMOS, demoFrame, entryOf, lessonDone, roomAt, type TrainingContext } from '@/game/sim/training'
import { findStrike } from '@/game/sim/melee'

const ROOM = LESSON_IDS.indexOf('rocket')
const f = buildTrainingGround()
const target = (): ReturnType<typeof makeGarrison>['units'][number] => {
  const gar = makeGarrison(f, 1)
  return gar.units.find(u => roomAt(u.homeX) === ROOM)!
}
const ctx = (extra: Partial<TrainingContext> = {}): TrainingContext => ({
  x: 0, y: 0, z: 0, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0,
  supplies: 0, stocked: false, burns: 0, ropes: 0, ...extra
})

describe('the rocket room (#146)', () => {
  it('comes right after the weapons room', () => {
    expect(ROOM).toBe(LESSON_IDS.indexOf('weapons') + 1)
  })

  it('holds one armoured training mech, up on the ledge behind its parapet', () => {
    const here = f.posts.filter(p => roomAt(p.x) === ROOM)
    expect(here).toHaveLength(1)
    const p = here[0]!
    expect(p.kind).toBe('enforcer')
    expect(p.armoured).toBe(true)
    expect(p.dummy).toBe(true)
    expect(p.hp).toBe(ROCKET_TARGET_HP)
    expect(heightAt(f.grid, p.x, p.z)).toBe(ROCKET_LEDGE_H)
    // The parapet stands between it and the room.
    const [cx, cz] = roomCell(ROOM, ROCKET_TARGET[0], 4)
    expect(heightAt(f.grid, cellMid(cx), cellMid(cz))).toBeCloseTo(ROCKET_PARAPET_H, 4)
  })

  it('nothing walks up to it', () => {
    const e = entryOf(ROOM)
    const p = f.posts.find(q => roomAt(q.x) === ROOM)!
    expect(findPath(f.grid, e.x, e.z, p.x, p.z, WALK)).toEqual([])
  })

  it('never wakes, whatever hits it, and no blade is offered on it', () => {
    const gar = makeGarrison(f, 1)
    const u = gar.units.find(q => roomAt(q.homeX) === ROOM)!
    expect(u.armoured).toBe(true)
    alarmUnit(gar, u.id, u.x - 6, u.z + 6)
    expect(u.state).toBe('dormant')
    expect(findStrike(gar, f.grid, u.x - 1, u.y, u.z, 0, true)).toBeNull()
  })

  it('a rocket into it takes it; one onto the parapet beside it does not, two do', () => {
    const direct = makeGarrison(f, 1)
    const u = direct.units.find(q => roomAt(q.homeX) === ROOM)!
    expect(blast(direct, f.grid, u.x, u.y + 1.6, u.z, u.id).kills).toContain(u.id)
    const near = makeGarrison(f, 1)
    const v = near.units.find(q => roomAt(q.homeX) === ROOM)!
    const top = ROCKET_PARAPET_H + 0.15
    const pz = v.z + 2 * CELL
    expect(blast(near, f.grid, v.x, top, pz, -1).kills).not.toContain(v.id)
    expect(v.hp).toBeLessThan(ROCKET_TARGET_HP)
    expect(blast(near, f.grid, v.x, top, pz, -1).kills).toContain(v.id)
    void target
  })

  it('is done once the mech is down, and not before', () => {
    expect(lessonDone(ROOM, ctx({ rockets: 2 }), ctx())).toBe(false)
    expect(lessonDone(ROOM, ctx({ cleared: true }), ctx())).toBe(true)
  })

  it('the hologram draws the launcher (its key pops up), then fires at the mech', () => {
    const keys = DEMOS.rocket
    const press = keys.find(k => k.hint === 'rocket')!
    const shot = keys.find(k => k.rocket)!
    expect(press.t).toBeLessThan(shot.t)
    expect(keys.some(k => k.weapon === 'rocket' && k.t <= shot.t)).toBe(true)
    expect(demoFrame(ROOM, shot.t - 0.05).rocket).toBeNull()
    const fr = demoFrame(ROOM, shot.t + 0.2)
    expect(fr.weapon).toBe('rocket')
    expect(fr.rocket).not.toBeNull()
    const [cx, cz] = roomCell(ROOM, ROCKET_TARGET[0], ROCKET_TARGET[1])
    expect(fr.rocket!.x).toBeCloseTo(cellMid(cx))
    expect(fr.rocket!.z).toBeCloseTo(cellMid(cz))
    void TRAINING_ROOMS
  })
})
