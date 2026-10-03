// R23b (#57, #58): the training ground. Ten rooms, one lesson each, a demo
// that plays twice and again on request, gates that open on a lesson done.

import { describe, expect, it } from 'vitest'
import {
  HOOK_WALL_H, LESSON_IDS, ROOM_WALL_H, TRAINING_ROOMS, buildTrainingGround, roomCell
} from '@/game/data/fortresses/training'
import {
  DEMOS, DEMO_PLAYS, demoFrame, demoLength, doorOf, entryOf, lessonDone, makeTraining, replayDemo, roomAt, stepTraining,
  type TrainingContext
} from '@/game/sim/training'
import { CELL, cellHeight, cellMid, findHoles, findPath, heightAt } from '@/game/world/grid'
import { GRAPPLE_MAX } from '@/game/sim/grapple'
import { validateFortress } from '@/game/world/validate'

const ctx = (x: number, z: number, more: Partial<TrainingContext> = {}): TrainingContext => ({
  x, y: 0, z, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0, ...more
})

describe('the layout', () => {
  const f = buildTrainingGround()

  it('one room per lesson, in order, the mech starting in the first and leaving from the last', () => {
    expect(TRAINING_ROOMS.map(r => r.lesson)).toEqual([...LESSON_IDS])
    expect(roomAt(f.insert.x)).toBe(0)
    expect(roomAt(f.extract.x)).toBe(TRAINING_ROOMS.length - 1)
  })

  it('has no hole, and the validator has nothing to say', () => {
    expect(findHoles(f.grid)).toEqual([])
    expect(validateFortress(f)).toEqual([])
  })

  it('every room but the hook room and the last has a doorway on; the hook room\'s wall is one hook high', () => {
    for (let i = 0; i < TRAINING_ROOMS.length - 1; i++) {
      const r = TRAINING_ROOMS[i]!
      if (r.lesson === 'hook') {
        expect(r.door).toBeNull()
        const [cx, cz] = [r.x1 + 1, r.z0 + 6]
        expect(cellHeight(f.grid, cx, cz)).toBe(HOOK_WALL_H)
        expect(HOOK_WALL_H).toBeLessThan(GRAPPLE_MAX)
      } else {
        expect(r.door).not.toBeNull()
        // From the way in to the way out on foot (the gates are open as built).
        const a = entryOf(i)
        const d = doorOf(i)!
        const c = (v: number): number => Math.floor(v / CELL)
        expect(findPath(f.grid, c(a.x), c(a.z), c(d.x) + 1, c(d.z)).length, r.lesson).toBeGreaterThan(0)
      }
    }
  })

  it('the room walls are out of any hook\'s reach', () => {
    expect(ROOM_WALL_H).toBeGreaterThan(GRAPPLE_MAX + 6)
  })

  it('a pile, a beacon and the defenders are where their lessons are', () => {
    expect(f.salvage).toHaveLength(1)
    expect(roomAt(f.salvage[0]!.x)).toBe(LESSON_IDS.indexOf('salvage'))
    expect(roomAt(f.beacons[0]!.x)).toBe(LESSON_IDS.indexOf('beacon'))
    for (const p of f.posts) expect(LESSON_IDS[roomAt(p.x)]).toMatch(/cover|weapons|blade|decoy|box/)
  })
})

describe('the lessons', () => {
  it('a room is entered once; its demo plays twice by itself, then not again until asked', () => {
    const t = makeTraining()
    const e = entryOf(0)
    const ev = stepTraining(t, ctx(e.x, e.z), 1 / 30)
    expect(ev).toEqual([{ type: 'enter', room: 0 }])
    let plays = 0
    let was = false
    for (let k = 0; k < 30 * 30; k++) {
      stepTraining(t, ctx(e.x, e.z), 1 / 30)
      const on = t.demoT >= 0
      if (on && !was) plays++
      was = on
    }
    expect(plays).toBe(DEMO_PLAYS)
    expect(replayDemo(t)).toBe(true)
    expect(t.demoT).toBe(0)
  })

  it('walking to the door finishes the first lessons; the demo cannot be asked for after', () => {
    const t = makeTraining()
    const e = entryOf(0)
    stepTraining(t, ctx(e.x, e.z), 1 / 30)
    const d = doorOf(0)!
    const ev = stepTraining(t, ctx(d.x - CELL, d.z), 1 / 30)
    expect(ev).toContainEqual({ type: 'done', room: 0 })
    expect(replayDemo(t)).toBe(false)
  })

  it('the weapons room wants a rifle kill, two rockets, an overheat and a zoom', () => {
    const i = LESSON_IDS.indexOf('weapons')
    const b = ctx(0, 0)
    expect(lessonDone(i, ctx(0, 0, { sniperKills: 1, rockets: 2, overheats: 1 }), b)).toBe(false)
    expect(lessonDone(i, ctx(0, 0, { sniperKills: 1, rockets: 2, overheats: 1, zooms: 1 }), b)).toBe(true)
  })

  it('the hook room is done by being over its wall', () => {
    const i = LESSON_IDS.indexOf('hook')
    const next = entryOf(i + 1)
    expect(lessonDone(i, ctx(next.x, next.z), ctx(0, 0))).toBe(true)
    const here = entryOf(i)
    expect(lessonDone(i, ctx(here.x, here.z), ctx(0, 0))).toBe(false)
  })

  it('what was done before the room was entered does not count', () => {
    const i = LESSON_IDS.indexOf('blade')
    expect(lessonDone(i, ctx(0, 0, { bladeKills: 2 }), ctx(0, 0, { bladeKills: 2 }))).toBe(false)
    expect(lessonDone(i, ctx(0, 0, { bladeKills: 3 }), ctx(0, 0, { bladeKills: 2 }))).toBe(false)
    // From behind and close in: two.
    expect(lessonDone(i, ctx(0, 0, { bladeKills: 4 }), ctx(0, 0, { bladeKills: 2 }))).toBe(true)
  })
})

describe('the demos', () => {
  const f = buildTrainingGround()

  it('every demo stays inside its own room (or goes over the hook wall) and shows at least one control', () => {
    TRAINING_ROOMS.forEach((r, i) => {
      const len = demoLength(r.lesson)
      let hinted = false
      for (let t = 0; t <= len; t += 0.1) {
        const fr = demoFrame(i, t)
        const room = roomAt(fr.x)
        expect(room === i || (r.lesson === 'hook' && room === i + 1), `${r.lesson} at ${t.toFixed(1)}`).toBe(true)
        expect(heightAt(f.grid, fr.x, fr.z)).not.toBeLessThan(0)
        if (fr.hint) hinted = true
      }
      expect(hinted, r.lesson).toBe(true)
    })
  })

  it('a demo starts at the room\'s way in', () => {
    for (let i = 0; i < TRAINING_ROOMS.length; i++) {
      const fr = demoFrame(i, 0)
      const e = entryOf(i)
      expect(Math.hypot(fr.x - e.x, fr.z - e.z)).toBeLessThan(CELL * 1.2)
    }
  })

  it('every lesson has a demo', () => {
    for (const id of LESSON_IDS) expect(DEMOS[id].length).toBeGreaterThan(1)
    const [cx, cz] = roomCell(0, 1, 1)
    expect(cellMid(cx)).toBeGreaterThan(0)
    expect(cz).toBe(TRAINING_ROOMS[0]!.z0)
  })
})
