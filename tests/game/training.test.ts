// R23b (#57, #58): the training ground. A room per lesson, a hologram demo
// that loops until the lesson is done and plays from the start on request
// (R42, #87), gates that open on a lesson done.

import { describe, expect, it } from 'vitest'
import {
  HOOK_WALL_H, LESSON_IDS, ROOM_WALL_H, TRAINING_ROOMS, buildTrainingGround, roomCell
} from '@/game/data/fortresses/training'
import {
  BLADE_VICTIM, DEMOS, demoFrame, demoLength, doorOf, entryOf, lessonDone, makeTraining, replayDemo, roomAt, stepTraining,
  type TrainingContext
} from '@/game/sim/training'
import { CELL, cellHeight, cellMid, findHoles, findPath, heightAt } from '@/game/world/grid'
import { GRAPPLE_MAX } from '@/game/sim/grapple'
import { validateFortress } from '@/game/world/validate'

const ctx = (x: number, z: number, more: Partial<TrainingContext> = {}): TrainingContext => ({
  x, y: 0, z, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0,
  supplies: 0, stocked: false, burns: 0, ropes: 0, ...more
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
      if (r.lesson === 'jump') {
        // The jump is the way through: there is no way on foot.
        const a = entryOf(i)
        const d = doorOf(i)!
        const c = (v: number): number => Math.floor(v / CELL)
        expect(findPath(f.grid, c(a.x), c(a.z), c(d.x) + 1, c(d.z)).length).toBe(0)
      } else if (r.lesson === 'hook') {
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
    for (const p of f.posts) expect(LESSON_IDS[roomAt(p.x)]).toMatch(/cover|weapons|rocket|blade|burn|decoy|box/)
  })
})

describe('the lessons', () => {
  it('a room is entered once; its hologram loops until the lesson is done, and plays from the start on request', () => {
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
    // 30 s in a room whose demo is ~6 s: it went round again and again.
    expect(plays).toBeGreaterThanOrEqual(3)
    stepTraining(t, ctx(e.x, e.z), 1)
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

  it('the weapons room wants a rifle kill, an overheat and a zoom (the launcher has its own room, #146)', () => {
    const i = LESSON_IDS.indexOf('weapons')
    const b = ctx(0, 0)
    expect(lessonDone(i, ctx(0, 0, { sniperKills: 1, overheats: 1 }), b)).toBe(false)
    expect(lessonDone(i, ctx(0, 0, { sniperKills: 1, overheats: 1, zooms: 1 }), b)).toBe(true)
  })

  it('the blade lesson shows a full takedown on a hologram guard; the flame room does not teach it again (#110, #113)', () => {
    const blade = demoFrame(LESSON_IDS.indexOf('blade'), DEMOS.blade.find(k => k.takedown)!.t + 0.5)
    expect(blade.td).toBeGreaterThan(0)
    expect(DEMOS.burn.some(k => k.hint === 'blade' || k.stab !== undefined)).toBe(false)
  })

  it('the decoy lesson throws a decoy that lands where the guard will look; every press pops its key; the blade goes in (#114)', async () => {
    const { VARIANTS } = await import('@/game/sim/backstab')
    const { DEMO_BACKSTAB } = await import('@/game/sim/training')
    const k0 = VARIANTS[DEMO_BACKSTAB].keys[0]!
    const i = LESSON_IDS.indexOf('decoy')
    const k = DEMOS.decoy.find(d => d.decoy)!
    expect(demoFrame(i, k.t - 0.1).decoy).toBeNull()
    const f = demoFrame(i, k.t + 1)
    expect(f.decoy).not.toBeNull()
    expect(f.press?.hint).toBe('decoy')
    const [cx, cz] = roomCell(i, k.decoy![0], k.decoy![1])
    expect(f.decoy!.x).toBeCloseTo(cellMid(cx))
    expect(f.decoy!.z).toBeCloseTo(cellMid(cz))
    // The takedown starts where the backstab's first key puts the mech behind the hologram guard.
    const b = LESSON_IDS.indexOf('blade')
    const td = DEMOS.blade.find(d => d.takedown)!
    const at = demoFrame(b, td.t)
    const r = TRAINING_ROOMS[b]!
    const vx = (r.x0 + BLADE_VICTIM[0] - 1) * CELL + CELL / 2
    const vz = (r.z0 + BLADE_VICTIM[1] - 1) * CELL + CELL / 2
    expect(Math.hypot(at.x - vx, at.z - vz)).toBeCloseTo(Math.hypot(k0.mx, k0.mz), 1)
  })

  it('the weapons room also opens once every defender in it is down, however they fell (#109)', () => {
    const i = LESSON_IDS.indexOf('weapons')
    expect(lessonDone(i, ctx(0, 0, { sniperKills: 1, cleared: true }), ctx(0, 0))).toBe(true)
    expect(lessonDone(i, ctx(0, 0, { cleared: false }), ctx(0, 0))).toBe(false)
  })

  it('the hook room is done by being over its wall', () => {
    const i = LESSON_IDS.indexOf('hook')
    const next = entryOf(i + 1)
    expect(lessonDone(i, ctx(next.x, next.z), ctx(0, 0))).toBe(true)
    const here = entryOf(i)
    expect(lessonDone(i, ctx(here.x, here.z), ctx(0, 0))).toBe(false)
  })

  it('the round-4 rooms: a supply taken (or nothing wanted), a body burnt, a rope shot', () => {
    const s = LESSON_IDS.indexOf('supply')
    const d = doorOf(s)!
    expect(lessonDone(s, ctx(0, 0, { supplies: 1 }), ctx(0, 0))).toBe(true)
    expect(lessonDone(s, ctx(d.x - CELL, d.z), ctx(0, 0))).toBe(false)
    expect(lessonDone(s, ctx(d.x - CELL, d.z, { stocked: true }), ctx(0, 0))).toBe(true)
    expect(lessonDone(LESSON_IDS.indexOf('burn'), ctx(0, 0, { burns: 1 }), ctx(0, 0))).toBe(true)
    expect(lessonDone(LESSON_IDS.indexOf('burn'), ctx(0, 0, { bladeKills: 1 }), ctx(0, 0))).toBe(false)
    expect(lessonDone(LESSON_IDS.indexOf('rope'), ctx(0, 0, { ropes: 1 }), ctx(0, 0))).toBe(true)
  })

  it('the jump room gap is a jump wide; the rope room platform is in reach of a rope from the tower', async () => {
    const { findRopeShot } = await import('@/game/sim/ropes')
    const f = buildTrainingGround()
    const r = LESSON_IDS.indexOf('rope')
    const [tx, tz] = roomCell(r, 3, 7)
    const [px, pz] = roomCell(r, 8, 7)
    const shot = findRopeShot(f.grid, cellMid(tx), cellHeight(f.grid, tx, tz), cellMid(tz), cellMid(px), cellHeight(f.grid, px, pz), cellMid(pz), 1)
    expect(shot).not.toBeNull()
    const j = LESSON_IDS.indexOf('jump')
    const [ax, az] = roomCell(j, 4, 7)
    const [gx, gz] = roomCell(j, 5, 7)
    const [bx, bz] = roomCell(j, 6, 7)
    expect(cellHeight(f.grid, ax, az)).toBe(cellHeight(f.grid, bx, bz))
    expect(cellHeight(f.grid, ax, az) - cellHeight(f.grid, gx, gz)).toBeGreaterThan(2)
  })

  it('the jump room can be crossed: a run and a jump from the first deck lands on the second; a walk falls in the pit', async () => {
    const { makePlayer, stepPlayer } = await import('@/game/sim/player')
    const f = buildTrainingGround()
    const j = LESSON_IDS.indexOf('jump')
    const [sx, sz] = roomCell(j, 2, 7)
    const [ex] = roomCell(j, 4, 7)
    const edge = (ex + 1) * CELL
    for (const jump of [true, false]) {
      const p = makePlayer(cellMid(sx), cellHeight(f.grid, sx, sz), cellMid(sz), Math.PI / 2)
      let jumped = false
      for (let k = 0; k < 240; k++) {
        const go = jump && !jumped && p.x > edge - 0.5
        if (go) jumped = true
        stepPlayer(p, f.grid, { mx: 1, mz: 0, crouch: false, aiming: false, aimYaw: 0, sprint: false, jump: go }, 1 / 60)
        if (p.mode === 'ground' && p.x > edge + CELL + 0.6) break
      }
      if (jump) expect(p.y).toBeCloseTo(cellHeight(f.grid, sx, sz), 1)
      else expect(p.y).toBeLessThan(0.5)
    }
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
      // The rope demo starts on its tower (#116: the climb is not the lesson).
      if (TRAINING_ROOMS[i]!.lesson === 'rope') continue
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

describe('seen in a training room (#67)', () => {
  it('the rewind calms a defender from another room too, so it cannot fire again on the next step', async () => {
    const { makeGarrison } = await import('@/game/sim/garrison')
    const { rewindRoom } = await import('@/game/sim/training')
    const f = buildTrainingGround()
    const gar = makeGarrison(f, 1)
    // A sentry of an earlier room fighting the mech, now in a later room.
    const first = roomAt(gar.units[0]!.homeX)
    const other = gar.units.find(u => roomAt(u.homeX) === first)!
    const later = roomAt(gar.units.find(u => roomAt(u.homeX) > first)!.homeX)
    expect(other).toBeTruthy()
    other.state = 'combat'
    other.x = other.homeX - 2
    rewindRoom(gar, later)
    expect(gar.units.filter(u => u.state === 'combat')).toEqual([])
    expect(other.x).toBe(other.homeX)
    // A defender elsewhere that is at peace is left where it is.
    const calm = gar.units.find(u => u.state === 'patrol' && roomAt(u.homeX) !== later && u !== other)
    if (calm) {
      calm.x = calm.homeX + 1
      rewindRoom(gar, later)
      expect(calm.x).toBe(calm.homeX + 1)
    }
  })
})

describe('the decoy lesson plays the whole trick (#115)', () => {
  it('the hologram guard walks to the decoy and stares at it; the mech comes up behind it and the takedown lines up', async () => {
    const { victimFrame } = await import('@/game/sim/training')
    const { VARIANTS } = await import('@/game/sim/backstab')
    const { DEMO_BACKSTAB } = await import('@/game/sim/training')
    const k0 = VARIANTS[DEMO_BACKSTAB].keys[0]!
    const i = LESSON_IDS.indexOf('decoy')
    const start = victimFrame(i, 0)!
    const there = victimFrame(i, 6)!
    expect(Math.hypot(there.x - start.x, there.z - start.z)).toBeGreaterThan(CELL * 2)
    expect(there.speed).toBe(0)
    const td = DEMOS.decoy.find(k => k.takedown)!
    const g = demoFrame(i, td.t)
    const v = victimFrame(i, td.t)!
    expect(Math.hypot(g.x - v.x, g.z - v.z)).toBeCloseTo(Math.hypot(k0.mx, k0.mz), 1)
    // From behind: the mech is on the far side from where the guard looks.
    const lookX = Math.sin(v.yaw)
    const lookZ = Math.cos(v.yaw)
    expect((g.x - v.x) * lookX + (g.z - v.z) * lookZ).toBeLessThan(0)
  })
})

describe("the demo's backstab lines up with the ghost's path (#110)", () => {
  for (const lesson of ['blade', 'decoy'] as const) {
    it(`${lesson}: the ghost walks up to where the variant starts the mech, facing as it does, and walks off from where it ends`, async () => {
      const { victimFrame, DEMO_BACKSTAB } = await import('@/game/sim/training')
      const { VARIANTS, guardToWorld } = await import('@/game/sim/backstab')
      const v = VARIANTS[DEMO_BACKSTAB]
      const i = LESSON_IDS.indexOf(lesson)
      const td = DEMOS[lesson].find(k => k.takedown)!
      const g = victimFrame(i, td.t)!
      for (const [t, key] of [[td.t, v.keys[0]!], [td.t + v.end, v.keys[v.keys.length - 1]!]] as const) {
        const f = demoFrame(i, t)
        const [x, , z] = guardToWorld(g.x, 0, g.z, g.yaw, key.mx, 0, key.mz)
        expect(Math.hypot(f.x - x, f.z - z)).toBeLessThan(0.02)
      }
      const f = demoFrame(i, td.t)
      const d = f.yaw - (g.yaw + v.keys[0]!.myaw)
      expect(Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))).toBeLessThan(0.02)
      // The takedown runs the variant's length, and the guard has not moved meanwhile.
      expect(demoFrame(i, td.t + v.end - 0.01).td).toBeGreaterThan(0)
      const after = victimFrame(i, td.t + v.end)!
      expect(Math.hypot(after.x - g.x, after.z - g.z)).toBeLessThan(1e-6)
    })
  }
})

describe('a lesson that can no longer be done is set up again', () => {
  it('names the blade room whose guards were shot, the burn room without a body or fuel, the rope room without ropes', async () => {
    const { lessonStuck } = await import('@/game/sim/training')
    const base = { x: 0, y: 0, z: 0, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0, supplies: 0, stocked: false, burns: 0, ropes: 0 }
    const stock = { alive: 2, bodies: 1, fuel: 4, ropes: 3 }
    const blade = LESSON_IDS.indexOf('blade')
    const burn = LESSON_IDS.indexOf('burn')
    const rope = LESSON_IDS.indexOf('rope')
    expect(lessonStuck(blade, base, base, stock)).toBe(false)
    // One bladed, one shot: one blade kill, nobody left to take.
    expect(lessonStuck(blade, { ...base, bladeKills: 1 }, base, { ...stock, alive: 0 })).toBe(true)
    expect(lessonStuck(blade, { ...base, bladeKills: 1 }, base, { ...stock, alive: 1 })).toBe(false)
    expect(lessonStuck(blade, base, base, { ...stock, alive: 0 })).toBe(true)
    expect(lessonStuck(burn, base, base, { ...stock, bodies: 0 })).toBe(true)
    expect(lessonStuck(burn, base, base, { ...stock, fuel: 0 })).toBe(true)
    expect(lessonStuck(burn, { ...base, burns: 1 }, base, { ...stock, bodies: 0 })).toBe(false)
    expect(lessonStuck(rope, base, base, { ...stock, ropes: 0 })).toBe(true)
    expect(lessonStuck(LESSON_IDS.indexOf('move'), base, base, { alive: 0, bodies: 0, fuel: 0, ropes: 0 })).toBe(false)
  })
})
