// The training's hologram demos draw their rounds (#168 follow-up): a
// playtester saw the weapons room's guards fall with nothing to say why.
// Every round flies from the ghost's muzzle and its target goes down only
// once it lands. The barrel room's demo is a hologram drum out in front of the
// real one, with five guards round it that its blast throws off their feet;
// the marker points at the real drum until it has gone up.

import { describe, expect, it } from 'vitest'
import { Mesh, Scene } from 'three'
import {
  BARREL_PLINTH, BARREL_WALL_X, LESSON_IDS, TRAINING_ROOMS, buildTrainingGround, roomCell, type LessonId
} from '@/game/data/fortresses/training'
import {
  DEMO_DRUM, DEMO_SHOTS, DEMO_TARGETS, demoFrame, demoLength, doorOf, drumBlast, targetDies
} from '@/game/sim/training'
import { THROWN_M, TrainingDirector, type DemoFx } from '@/game/sim/trainingDirector'
import { BARREL_RADIUS, ignite, stepBarrels, type Barrel } from '@/game/sim/barrels'
import { makeGarrison } from '@/game/sim/garrison'
import { CELL, cellMid } from '@/game/world/grid'
import type { Rig } from '@/game/models/kit'

const room = (id: LessonId): number => LESSON_IDS.indexOf(id)
const dist = (a: readonly [number, number], b: readonly [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]) * CELL

/** A stand-in for the mission's sparks and rings: what went off, and when. */
const fakeFx = (): DemoFx & { log: string[] } => {
  const log: string[] = []
  return {
    log,
    particles: { flash: () => log.push('flash'), emit: () => log.push('emit') },
    rings: { spawn: () => log.push('ring') }
  } as unknown as DemoFx & { log: string[] }
}

type Inside = TrainingDirector & { state: { room: number; demoT: number; done: boolean[] }; guards: Rig[]; bolts: Mesh[]; drum: Mesh }

/** A director with its demo `lesson` playing, stepped frame by frame up to `until` seconds in. */
const playTo = (d: Inside, lesson: LessonId, until: number, onFrame?: (t: number) => void): void => {
  d.state.room = room(lesson)
  for (let t = 0; t <= until + 1e-9; t += 1 / 60) {
    d.state.demoT = t
    d.update(1 / 60, t)
    onFrame?.(t)
  }
}

describe('every demo round flies before its target falls', () => {
  it('each target goes down only once a round into it (or the drum\'s blast) has landed', () => {
    for (const [lesson, targets] of Object.entries(DEMO_TARGETS) as Array<[LessonId, NonNullable<(typeof DEMO_TARGETS)[LessonId]>]>) {
      const shots = DEMO_SHOTS[lesson]!
      targets.forEach((_, k) => {
        const dies = targetDies(lesson, k)
        const into = shots.filter(q => q.target === k)
        // Something takes it: its own rounds, or the drum.
        expect(into.length > 0 || drumBlast(lesson) >= 0, `${lesson} #${k}`).toBe(true)
        // Never before the first thing that could take it has landed.
        const first = Math.min(...into.map(q => q.t + q.fly), drumBlast(lesson) >= 0 ? drumBlast(lesson) : Infinity)
        expect(dies, `${lesson} #${k}`).toBeGreaterThanOrEqual(first)
        // And it is a visible flight, not a teleport.
        for (const q of into) expect(q.fly, `${lesson} #${k}`).toBeGreaterThanOrEqual(0.05)
        // Dead before the demo ends, so the fall is seen.
        expect(dies + 1, `${lesson} #${k}`).toBeLessThan(demoLength(lesson))
      })
    }
  })

  it('the ghost fires each round with that gun up and aimed', () => {
    for (const [lesson, shots] of Object.entries(DEMO_SHOTS) as Array<[LessonId, NonNullable<(typeof DEMO_SHOTS)[LessonId]>]>) {
      for (const q of shots) {
        const f = demoFrame(room(lesson), q.t)
        expect(f.weapon, `${lesson} @${q.t}`).toBe(q.weapon)
        expect(f.aim, `${lesson} @${q.t}`).toBeGreaterThan(0.9)
      }
    }
  })

  it('the weapons room is the minigun on all three (#201 follow-up): a stream into each, no rifle round', () => {
    const shots = DEMO_SHOTS.weapons!
    expect(shots.filter(q => q.weapon === 'sniper')).toHaveLength(0)
    for (const k of [0, 1, 2]) expect(shots.filter(q => q.weapon === 'minigun' && q.target === k).length).toBeGreaterThanOrEqual(5)
  })

  it('on screen: a bolt is out while the first round flies, and the sentry stands until it lands', () => {
    const f = buildTrainingGround()
    const fx = fakeFx()
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1), fx) as unknown as Inside
    const q = DEMO_SHOTS.weapons![0]!
    const dies = targetDies('weapons', 0)
    let flying = 0
    playTo(d, 'weapons', dies + 0.3, (t) => {
      if (t > q.t + 0.01 && t < q.t + q.fly - 0.01) {
        flying++
        expect(d.bolts.some(b => b.visible)).toBe(true)
      }
      // Standing (its root at its post, upright) until then.
      if (t < dies) expect(d.guards[0]!.root.visible).toBe(true)
    })
    expect(flying).toBeGreaterThan(0)
    // The flash at the muzzle and the burst where it went in.
    expect(fx.log.filter(e => e === 'flash').length).toBeGreaterThanOrEqual(4)
  })
})

describe('the barrel room\'s demo: one round, the drum, the lot of them', () => {
  const i = room('barrel')
  const r = TRAINING_ROOMS[i]!
  const guards = DEMO_TARGETS.barrel!
  const ladder: readonly [number, number] = [BARREL_PLINTH[0] - 1, BARREL_PLINTH[1]]

  it('has at least three hologram guards round a hologram drum, all out in front of the real one', () => {
    expect(guards.length).toBeGreaterThanOrEqual(3)
    for (const p of [DEMO_DRUM, ...guards.map(g => g.at)]) {
      // West of the wall the real drum stands in, clear of it and of the room's west wall.
      expect(p[0]).toBeLessThan(BARREL_WALL_X - 1)
      expect(p[0]).toBeGreaterThan(1.5)
      expect(p[1]).toBeGreaterThan(1.5)
      expect(p[1]).toBeLessThan(r.z1 - r.z0)
    }
    // Every one of them in the blast.
    for (const g of guards) expect(dist(g.at, DEMO_DRUM)).toBeLessThan(BARREL_RADIUS)
  })

  it('the blast throws them out, and each lands inside the room, off the ladder', () => {
    for (const g of guards) {
      const out = (g.fling ?? 0) + THROWN_M
      const x = g.at[0] - (Math.sin(g.yaw) * out) / CELL
      const z = g.at[1] - (Math.cos(g.yaw) * out) / CELL
      // Further from the drum than it stood.
      expect(dist([x, z], DEMO_DRUM)).toBeGreaterThan(dist(g.at, DEMO_DRUM))
      expect(x).toBeGreaterThan(1)
      expect(x).toBeLessThan(BARREL_WALL_X - 1.05)
      expect(z).toBeGreaterThan(1)
      expect(z).toBeLessThan(r.z1 - r.z0 + 1 - 0.5)
      expect(Math.abs(x - ladder[0]) < 0.5 && Math.abs(z - ladder[1]) < 0.5).toBe(false)
    }
  })

  it('the round lands in the drum, it goes up, then they fall; the ghost fires from out of its reach', () => {
    const q = DEMO_SHOTS.barrel!.find(s => s.target === 'drum')!
    expect(drumBlast('barrel')).toBeGreaterThan(q.t + q.fly)
    guards.forEach((_, k) => expect(targetDies('barrel', k)).toBeGreaterThanOrEqual(drumBlast('barrel')))
    const f = demoFrame(i, q.t)
    const at = [(f.x / CELL) - r.x0 + 0.5, (f.z / CELL) - r.z0 + 0.5] as const
    expect(dist(at, DEMO_DRUM)).toBeGreaterThan(BARREL_RADIUS + 1)
    // Its round passes no guard on the way to the drum.
    for (const g of guards) {
      const [ax, az] = at
      const [bx, bz] = DEMO_DRUM
      const len = Math.hypot(bx - ax, bz - az)
      const along = ((g.at[0] - ax) * (bx - ax) + (g.at[1] - az) * (bz - az)) / len
      const off = Math.abs((g.at[0] - ax) * (bz - az) - (g.at[1] - az) * (bx - ax)) / len
      if (along > 0 && along < len) expect(off * CELL).toBeGreaterThan(1)
    }
  })

  it('on screen: the drum stands until the blast; the blast rings out once; the guards fly up', () => {
    const f = buildTrainingGround()
    const fx = fakeFx()
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1), fx) as unknown as Inside
    const blast = drumBlast('barrel')
    let rings = 0
    let airborne = 0
    playTo(d, 'barrel', blast + 0.9, (t) => {
      expect(d.drum.visible).toBe(t < blast)
      if (t < blast) expect(fx.log.filter(e => e === 'ring')).toHaveLength(0)
      if (t > blast + 0.3 && t < blast + 0.5) airborne += d.guards.filter(g => g.root.visible && g.root.position.y > 0.5).length
    })
    rings = fx.log.filter(e => e === 'ring').length
    expect(rings).toBe(2)
    expect(airborne).toBeGreaterThan(0)
  })
})

describe('the barrel room\'s marker', () => {
  it('points at the drum on the plinth until it has gone up, then at the door', () => {
    const f = buildTrainingGround()
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1)) as unknown as Inside
    const i = room('barrel')
    d.state.room = i
    const [px, pz] = roomCell(i, ...BARREL_PLINTH)
    const w = d.waypoint()!
    expect(Math.hypot(w.x - cellMid(px), w.z - cellMid(pz))).toBeLessThan(0.1)
    // Over the drum, up on its plinth.
    expect(w.y).toBeGreaterThan(4)
    // It goes up: the marker moves on to the door.
    const list: Barrel[] = (f.barrels ?? []).map(b => ({ ...b, live: true, fuse: -1 }))
    ignite(list.find(b => b.cx === px && b.cz === pz)!)
    stepBarrels(list, f.grid, 0.01)
    const door = doorOf(i)!
    expect(Math.hypot(d.waypoint()!.x - door.x, d.waypoint()!.z - door.z)).toBeLessThan(0.5)
  })
})
