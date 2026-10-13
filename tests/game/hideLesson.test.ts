// The shoot-and-hide room: no playtester understood that a shot gives away
// where it came from. A sentry to shoot, and a drone that flies to the spot
// the shot was fired from and sweeps its light there: a mech still standing
// there is found (the room starts over, with the warning); one that moved off
// behind the crates is not, and the door opens once the drone gives up.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  HIDE_COVER, HIDE_SPOT, HIDE_TARGET, LESSON_IDS, TRAINING_ROOMS, buildTrainingGround, roomCell
} from '@/game/data/fortresses/training'
import {
  DEMOS, DEMO_SHOTS, DOOR_LINES, HIDE_FIRE, demoFrame, droneAt, lessonDone, lessonStuck, roomAt, targetDies, type TrainingContext
} from '@/game/sim/training'
import { SPOT_RADIUS, isAlive, killUnit, makeGarrison, shotPassed, spotCentre, stepGarrison, type Target } from '@/game/sim/garrison'
import { CELL, cellHeight } from '@/game/world/grid'

const ROOM = LESSON_IDS.indexOf('hide')
const DT = 1 / 30
const at = (lx: number, lz: number): { x: number; z: number } => {
  const r = TRAINING_ROOMS[ROOM]!
  return { x: (r.x0 + lx - 1) * CELL + CELL / 2, z: (r.z0 + lz - 1) * CELL + CELL / 2 }
}
const ctx = (extra: Partial<TrainingContext> = {}): TrainingContext => ({
  x: 0, y: 0, z: 0, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0,
  supplies: 0, stocked: false, burns: 0, ropes: 0, ...extra
})
const mech = (x: number, z: number, crouched = false): Target => ({ x, y: 0, z, height: crouched ? 1.5 : 2.6, crouched, visible: true })

/** The training ground's drill, the room's sentry shot dead from (fx, fz): the round heard as the mission reports it. */
const shoot = (fx: number, fz: number) => {
  const f = buildTrainingGround()
  const gar = makeGarrison(f, 1)
  gar.drill = true
  const here = gar.units.filter(u => roomAt(u.homeX) === ROOM)
  const sentry = here.find(u => u.kind !== 'drone')!
  const drone = here.find(u => u.kind === 'drone')!
  shotPassed(gar, mech(fx, fz), { x: fx, y: 0, z: fz }, fx, 1.7, fz, sentry.x, 1.4, sentry.z, 1.5, 12, sentry.id)
  killUnit(gar, sentry.id, fx, fz, 'shot')
  return { f, gar, sentry, drone }
}

describe('the shoot-and-hide room', () => {
  it('comes after the launcher\'s room (the mech knows how to shoot), before the supplies', () => {
    expect(ROOM).toBe(LESSON_IDS.indexOf('rocket') + 1)
    expect(LESSON_IDS.indexOf('supply')).toBe(ROOM + 1)
    expect(TRAINING_ROOMS[ROOM]!.door).not.toBeNull()
  })

  it('holds a sentry with its back to the room, an armoured drone on its beat, and crates to hide behind', () => {
    const f = buildTrainingGround()
    const here = f.posts.filter(p => roomAt(p.x) === ROOM)
    const sentry = here.find(p => p.kind === 'sentry')!
    const drone = here.find(p => p.kind === 'drone')!
    expect(here).toHaveLength(2)
    expect(sentry.x).toBeCloseTo(at(...HIDE_TARGET).x)
    // Facing the north wall: it never sees the way in.
    expect(sentry.facing).toBeCloseTo(Math.PI)
    // Not a target: rounds glance off it.
    expect(drone.armoured).toBe(true)
    const [cx, cz] = roomCell(ROOM, ...HIDE_COVER)
    expect(cellHeight(f.grid, cx, cz)).toBeGreaterThan(1)
  })

  it('a shot sends the drone to the very spot it was fired from, even on the drill', () => {
    const fire = at(...HIDE_FIRE)
    const { f, gar, drone } = shoot(fire.x, fire.z)
    expect(drone.state).toBe('suspicious')
    expect(drone.hunt).toBeGreaterThan(0)
    let closest = Infinity
    // Somebody far off: only where its light goes matters here.
    for (let k = 0; k < 10 / DT; k++) {
      stepGarrison(gar, f.grid, { ...mech(0, 0), visible: false }, DT)
      const c = spotCentre(drone)
      closest = Math.min(closest, Math.hypot(c.x - fire.x, c.z - fire.z))
    }
    expect(closest).toBeLessThan(1)
  })

  it('a mech that stays where it fired from is found', () => {
    const fire = at(...HIDE_FIRE)
    const { f, gar } = shoot(fire.x, fire.z)
    let found = false
    for (let k = 0; k < 15 / DT && !found; k++) {
      stepGarrison(gar, f.grid, mech(fire.x, fire.z), DT)
      found = gar.units.some(u => u.state === 'combat')
    }
    expect(found).toBe(true)
  })

  it('one that moved off behind the crates is not; the drone gives up, and the lesson is done', () => {
    const fire = at(...HIDE_FIRE)
    const { f, gar, sentry, drone } = shoot(fire.x, fire.z)
    const hide = at(...HIDE_SPOT)
    let hunted = false
    let k = 0
    for (; k < 40 / DT; k++) {
      stepGarrison(gar, f.grid, mech(hide.x, hide.z, true), DT)
      expect(gar.units.some(u => u.state === 'combat'), `found at ${(k * DT).toFixed(1)} s`).toBe(false)
      hunted ||= drone.hunt > 0
      if (drone.state !== 'suspicious') break
    }
    expect(k * DT).toBeLessThan(40)
    const c = ctx({ shotDown: !isAlive(sentry), hunted, searching: drone.state === 'suspicious' })
    expect(lessonDone(ROOM, c, ctx())).toBe(true)
  })

  it('is not done before the drone has come and gone; the sentry down with no hunt sets the room up again', () => {
    expect(lessonDone(ROOM, ctx({ shotDown: true, hunted: true, searching: true }), ctx())).toBe(false)
    expect(lessonDone(ROOM, ctx({ shotDown: false, hunted: true, searching: false }), ctx())).toBe(false)
    const stock = { alive: 1, bodies: 1, fuel: 0, ropes: 0, drones: 1 }
    expect(lessonStuck(ROOM, ctx({ shotDown: true, hunted: false, searching: false }), ctx(), stock)).toBe(true)
    expect(lessonStuck(ROOM, ctx({ shotDown: true, hunted: true, searching: true }), ctx(), stock)).toBe(false)
    // The drone brought down after all: set up again.
    expect(lessonStuck(ROOM, ctx(), ctx(), { ...stock, drones: 0 })).toBe(true)
  })

  it('found after its shot, the room says why: hide after shooting', () => {
    const mission = readFileSync('src/game/sim/mission.ts', 'utf8')
    expect(mission).toMatch(/lesson === 'hide'\) return this\.hideHunted \? 'reset\.hide' : 'reset\.seen'/)
    expect(DOOR_LINES.hide?.line).toBe('door.hide')
  })
})

describe('its hologram: the shot, the run, the drone at the empty spot', () => {
  it('fires from the firing spot, runs for the crates crouched, and the drone arrives after it has gone', () => {
    const shot = DEMO_SHOTS.hide![0]!
    const f = demoFrame(ROOM, shot.t)
    const fire = at(...HIDE_FIRE)
    expect(Math.hypot(f.x - fire.x, f.z - fire.z)).toBeLessThan(0.2)
    expect(f.aim).toBeGreaterThan(0.9)
    // The hologram's sentry goes down only once its round lands.
    expect(targetDies('hide', 0)).toBeGreaterThanOrEqual(shot.t + shot.fly)
    // The drone reaches the spot well after the shot…
    let arrive = -1
    for (let t = shot.t; t < 12; t += 0.05) {
      const d = droneAt(t)
      if (Math.hypot(d.x - HIDE_FIRE[0], d.z - HIDE_FIRE[1]) < 0.2) { arrive = t; break }
    }
    expect(arrive).toBeGreaterThan(shot.t + 1)
    // …by when the ghost is out of its light, down behind the crates.
    const g = demoFrame(ROOM, arrive)
    expect(Math.hypot(g.x - fire.x, g.z - fire.z)).toBeGreaterThan(SPOT_RADIUS)
    expect(g.crouch).toBeGreaterThan(0.9)
    const hide = at(...HIDE_SPOT)
    expect(Math.hypot(g.x - hide.x, g.z - hide.z)).toBeLessThan(0.5)
    // It sweeps the empty spot, then goes back.
    expect(droneAt(arrive + 1.5).sweep).toBeGreaterThan(0.5)
    const end = DEMOS.hide[DEMOS.hide.length - 1]!.t
    expect(Math.hypot(droneAt(end).x - HIDE_FIRE[0], droneAt(end).z - HIDE_FIRE[1])).toBeGreaterThan(3)
  })
})
