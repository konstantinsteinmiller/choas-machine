// Round 5 (#146): the rocket launcher's own training room. An armoured mech
// stands up on a ledge behind a parapet: nothing walks up there, rounds and
// the blade glance off it, and only a rocket's blast takes it. Since a
// playtest: not armoured, anything that takes it down opens the door. The hologram
// shows the launcher drawn (3), the rocket leaving its nose, the mech coming
// apart.

import { describe, expect, it } from 'vitest'
import {
  LESSON_IDS, ROCKET_HOLO, ROCKET_LEDGE_H, ROCKET_PARAPET_H, ROCKET_TARGET, ROCKET_TARGET_HP, TRAINING_ROOMS, buildTrainingGround, roomCell
} from '@/game/data/fortresses/training'
import { Scene } from 'three'
import { TrainingDirector } from '@/game/sim/trainingDirector'
import { MANTLE_MAX } from '@/game/sim/player'
import { CELL, WALK, cellMid, findPath, hasLineOfSight, heightAt } from '@/game/world/grid'
import { alarmUnit, makeGarrison } from '@/game/sim/garrison'
import { blast, shotDamage } from '@/game/sim/damage'
import { DEMOS, demoFrame, entryOf, lessonDone, rewindRoom, roomAt, type TrainingContext } from '@/game/sim/training'
import { findGrapple } from '@/game/sim/grapple'
import { MINIGUN_BELT } from '@/game/sim/weapons'

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

  it('holds one training mech, up on the ledge behind its parapet', () => {
    const here = f.posts.filter(p => roomAt(p.x) === ROOM)
    expect(here).toHaveLength(1)
    const p = here[0]!
    expect(p.kind).toBe('enforcer')
    // Not armoured: rounds hurt it too (a playtester raged at a mech they glanced off).
    expect(p.armoured).toBeFalsy()
    expect(p.dummy).toBe(true)
    expect(p.hp).toBe(ROCKET_TARGET_HP)
    expect(heightAt(f.grid, p.x, p.z)).toBe(ROCKET_LEDGE_H)
    // The parapet stands between it and the room.
    const [cx, cz] = roomCell(ROOM, ROCKET_TARGET[0], 4)
    expect(heightAt(f.grid, cellMid(cx), cellMid(cz))).toBeCloseTo(ROCKET_PARAPET_H, 4)
  })

  it('its parapet is low: from the back half of the room a rocket at its chest clears it', () => {
    const p = f.posts.find(q => roomAt(q.x) === ROOM)!
    for (let lz = 8; lz <= 10; lz++) {
      for (let lx = 1; lx <= 10; lx++) {
        const [cx, cz] = roomCell(ROOM, lx, lz)
        const x = cellMid(cx)
        const z = cellMid(cz)
        expect(hasLineOfSight(f.grid, x, 1.7, z, p.x, ROCKET_LEDGE_H + 1.6, p.z), `from ${lx},${lz}`).toBe(true)
      }
    }
  })

  it('nothing walks up to it', () => {
    const e = entryOf(ROOM)
    const p = f.posts.find(q => roomAt(q.x) === ROOM)!
    expect(findPath(f.grid, e.x, e.z, p.x, p.z, WALK)).toEqual([])
  })

  it('never wakes, whatever hits it, nor when the room is started over', () => {
    const gar = makeGarrison(f, 1)
    const u = gar.units.find(q => roomAt(q.homeX) === ROOM)!
    expect(u.armoured).toBe(false)
    alarmUnit(gar, u.id, u.x - 6, u.z + 6)
    expect(u.state).toBe('dormant')
    rewindRoom(gar, ROOM)
    expect(u.state).toBe('dormant')
  })

  it('the hook takes the ledge from the room floor, and rounds alone can finish it', () => {
    const p = f.posts.find(q => roomAt(q.x) === ROOM)!
    // At the parapet's foot, facing it (north).
    const [, cz] = roomCell(ROOM, ROCKET_TARGET[0], 5)
    const spot = findGrapple(f.grid, p.x, 0, cellMid(cz) + 0.2, Math.PI)
    expect(spot).not.toBeNull()
    expect(spot!.edge.y).toBeCloseTo(ROCKET_PARAPET_H, 4)
    // A full stock: ten rifle rounds in the head, or the belt in its body.
    expect(10 * shotDamage('sniper', 'enforcer', 'head', 1, ROCKET_TARGET_HP)).toBeGreaterThanOrEqual(ROCKET_TARGET_HP)
    expect(MINIGUN_BELT * shotDamage('minigun', 'enforcer', 'body', 1, ROCKET_TARGET_HP)).toBeGreaterThanOrEqual(ROCKET_TARGET_HP)
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
    // At the hologram's own mech, beside the real one.
    const r = TRAINING_ROOMS[ROOM]!
    expect(fr.rocket!.x).toBeCloseTo((r.x0 + ROCKET_HOLO[0] - 1) * CELL + CELL / 2)
    expect(fr.rocket!.z).toBeCloseTo((r.z0 + ROCKET_HOLO[1] - 1) * CELL + CELL / 2)
  })

  it('its ledge is low enough for an easy shot from the way in, too high to climb', () => {
    expect(ROCKET_LEDGE_H).toBeLessThanOrEqual(3)
    expect(ROCKET_LEDGE_H).toBeGreaterThan(MANTLE_MAX)
    // From the way in, standing, a rocket at its chest is in the clear.
    const p = f.posts.find(q => roomAt(q.x) === ROOM)!
    const e = entryOf(ROOM)
    expect(hasLineOfSight(f.grid, e.x, 1.7, e.z, p.x, ROCKET_LEDGE_H + 1.6, p.z)).toBe(true)
  })

  it('the hologram mech stands aside of the real one, on the ledge', () => {
    const d = Math.hypot(ROCKET_HOLO[0] - ROCKET_TARGET[0], ROCKET_HOLO[1] - ROCKET_TARGET[1]) * CELL
    // Clear of the real mech's body (it is 2 m wide).
    expect(d).toBeGreaterThan(2.5)
    const [cx, cz] = roomCell(ROOM, Math.round(ROCKET_HOLO[0]), Math.round(ROCKET_HOLO[1]))
    expect(heightAt(f.grid, cellMid(cx), cellMid(cz))).toBe(ROCKET_LEDGE_H)
  })

  it('the ghost aims the launcher up at it, and its rocket clears the parapet', () => {
    const shot = DEMOS.rocket.find(k => k.rocket)!
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1)) as unknown as TrainingDirector & {
      state: { room: number; demoT: number }; ghostPose: { aimPitch: number }
    }
    d.state.room = ROOM
    for (let t = 0; t <= shot.t + 1e-9; t += 1 / 30) {
      d.state.demoT = t
      d.update(1 / 30, t)
    }
    const fr = demoFrame(ROOM, shot.t)
    const r = TRAINING_ROOMS[ROOM]!
    const tx = (r.x0 + ROCKET_HOLO[0] - 1) * CELL + CELL / 2
    const tz = (r.z0 + ROCKET_HOLO[1] - 1) * CELL + CELL / 2
    const up = Math.atan2(ROCKET_LEDGE_H + 1.9 - 1.7, Math.hypot(tx - fr.x, tz - fr.z))
    expect(d.ghostPose.aimPitch).toBeGreaterThan(0.1)
    expect(d.ghostPose.aimPitch).toBeCloseTo(up, 2)
    // The straight line from about the launcher's nose to its chest is open.
    expect(hasLineOfSight(f.grid, fr.x, 1.9, fr.z, tx, ROCKET_LEDGE_H + 1.9, tz)).toBe(true)
  })
})

describe('the rifle on the ledge mech: "too weak"', () => {
  it('a sniper round into the rocket room\'s mech pops the label at the hit for 2 s, in every language', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { WEAK_POP_S } = await import('@/game/state/hud')
    expect(WEAK_POP_S).toBe(2)
    const mission = readFileSync('src/game/sim/mission.ts', 'utf8')
    expect(mission).toMatch(/if \(w === 'sniper'\) this\.tooWeak\(u, h\.x, h\.y, h\.z\)/)
    expect(mission).toMatch(/lesson !== 'rocket'\) return/)
    expect(readFileSync('src/components/hud/WeakPop.vue', 'utf8')).toMatch(/weak-wobble 2s/)
    for (const f of readdirSync('src/i18n/locales')) {
      expect(readFileSync(`src/i18n/locales/${f}`, 'utf8'), f).toMatch(/^    'tooWeak': '.+',$/m)
    }
  })
})
