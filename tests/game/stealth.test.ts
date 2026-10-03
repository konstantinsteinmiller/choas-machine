import { describe, expect, it } from 'vitest'
import { FortressBuilder, WALL_H, type Fortress } from '@/game/world/fortress'
import { VOID, cellMid, heightAt } from '@/game/world/grid'
import { exposure, noticeRate, CROUCH_FACTOR, type Viewer } from '@/game/sim/perception'
import { ALERT_GAIN, ALERT_MAX, alertSegments, makeAlert, pressAlert, raiseAlert, stepAlert } from '@/game/sim/alert'
import {
  SPOT_AHEAD, drainEvents, isUnaware, killUnit, lureTo, makeGarrison, noiseAt, stepGarrison,
  type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { buildProvingGround } from '@/game/data/fortresses/proving'
import { MECH_HEIGHT, MECH_HEIGHT_CROUCH } from '@/game/models/mech'

const DT = 1 / 60

/** A flat 24 × 24 yard to stage things on. */
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 24, 24)
  b.ground(0, 0, 23, 23)
  b.insert(1, 1).extract(22, 22)
  return b
}

const mech = (cx: number, cz: number, crouched = false): Target => ({
  x: cellMid(cx), y: 0, z: cellMid(cz), height: crouched ? MECH_HEIGHT_CROUCH : MECH_HEIGHT, crouched, visible: true
})

/** Run the garrison for `seconds`, collecting every event. */
const run = (gar: Garrison, f: Fortress, target: Target, seconds: number, each?: () => void): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let t = 0; t < seconds; t += DT) {
    stepGarrison(gar, f.grid, target, DT)
    all.push(...drainEvents(gar))
    each?.()
  }
  return all
}
const types = (e: GarrisonEvent[]): string[] => e.map(x => x.type)

describe('sight', () => {
  const f = yard().cover(10, 14).wall(4, 14, 6, 14).build()
  // A viewer at cell 10,10 looking south (+z).
  const v: Viewer = { x: cellMid(10), y: 1.5, z: cellMid(10), yaw: 0, halfAngle: 0.66, range: 18 }
  const at = (cx: number, cz: number, height = MECH_HEIGHT) => ({ x: cellMid(cx), feetY: 0, z: cellMid(cz), height })

  it('sees what stands in front of it in the open', () => {
    expect(exposure(f.grid, v, at(11, 13))).toBe(1)
  })
  it('does not see behind itself, nor beyond its range', () => {
    expect(exposure(f.grid, v, at(10, 6))).toBe(0)
    expect(exposure(f.grid, v, at(10, 22))).toBe(0)
  })
  it('does not see outside its cone', () => {
    expect(exposure(f.grid, v, at(16, 11))).toBe(0)
  })
  it('notices something right on top of it whatever way it faces', () => {
    expect(exposure(f.grid, v, { x: v.x + 0.5, feetY: 0, z: v.z - 0.6, height: MECH_HEIGHT })).toBeGreaterThan(0)
  })
  it('cover hides a crouched mech and shows the head of a standing one', () => {
    expect(exposure(f.grid, v, at(10, 15, MECH_HEIGHT_CROUCH))).toBe(0)
    expect(exposure(f.grid, v, at(10, 15, MECH_HEIGHT))).toBe(0.5)
  })
  it('a wall hides everything', () => {
    const w: Viewer = { ...v, x: cellMid(5), z: cellMid(10) }
    expect(exposure(f.grid, w, at(5, 16))).toBe(0)
  })
  it('notices faster up close, slower when the mech crouches, not at all when hidden', () => {
    expect(noticeRate(2, 18, 1, false)).toBeGreaterThan(noticeRate(16, 18, 1, false) * 3)
    expect(noticeRate(8, 18, 1, true)).toBeCloseTo(noticeRate(8, 18, 1, false) * CROUCH_FACTOR)
    expect(noticeRate(8, 18, 0, false)).toBe(0)
    expect(noticeRate(8, 18, 0.5, false)).toBeCloseTo(noticeRate(8, 18, 1, false) / 2)
  })
})

describe('the alert level', () => {
  it('adds up by cause and tips into full alert once', () => {
    const a = makeAlert()
    expect(raiseAlert(a, 'miss')).toBe(false)
    expect(a.level).toBe(ALERT_GAIN.miss)
    expect(raiseAlert(a, 'seen')).toBe(false)
    expect(raiseAlert(a, 'body')).toBe(false)
    expect(raiseAlert(a, 'drone')).toBe(true)
    expect(a.chaos).toBe(true)
    expect(a.level).toBe(ALERT_MAX)
    expect(raiseAlert(a, 'seen')).toBe(false)
  })
  it('a loud weapon ends the stealth at once', () => {
    const a = makeAlert()
    expect(raiseAlert(a, 'loud')).toBe(true)
  })
  it('drains only after the base has been calm for a while', () => {
    const a = makeAlert()
    raiseAlert(a, 'seen')
    for (let t = 0; t < 5; t += DT) stepAlert(a, DT, true)
    expect(a.level).toBe(ALERT_GAIN.seen)
    for (let t = 0; t < 30; t += DT) stepAlert(a, DT, false)
    expect(a.level).toBe(ALERT_GAIN.seen)
    for (let t = 0; t < 30; t += DT) stepAlert(a, DT, true)
    expect(a.level).toBe(0)
  })
  it('full alert never drains', () => {
    const a = makeAlert()
    raiseAlert(a, 'loud')
    for (let t = 0; t < 60; t += DT) stepAlert(a, DT, true)
    expect(a.chaos).toBe(true)
    expect(alertSegments(a)).toBe(5)
  })
  it('shows five segments, the last only in full alert', () => {
    const a = makeAlert()
    expect(alertSegments(a)).toBe(0)
    pressAlert(a, 99)
    expect(alertSegments(a)).toBe(4)
    pressAlert(a, 1)
    expect(alertSegments(a)).toBe(5)
  })
})

describe('the garrison', () => {
  const away: Target = { ...mech(1, 1), visible: false }

  it('a guard walks every stop of its route', () => {
    const f = yard().guard([[5, 5], [15, 5, 1], [15, 15], [5, 15]]).build()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    const best = f.posts[0]!.route.map(() => Infinity)
    const events = run(gar, f, away, 70, () => {
      f.posts[0]!.route.forEach((w, i) => { best[i] = Math.min(best[i]!, Math.hypot(w.x - u.x, w.z - u.z)) })
    })
    for (const d of best) expect(d).toBeLessThan(0.3)
    expect(events).toEqual([])
    expect(gar.alert.level).toBe(0)
  })

  it('a mech in the open in front of a sentry is suspected, then spotted, then the base goes loud', () => {
    const f = yard().sentry(10, 5, 0).build()
    const gar = makeGarrison(f)
    const e = run(gar, f, mech(10, 10), 12)
    expect(types(e).filter(t => t !== 'calm')).toEqual(['suspicious', 'spotted', 'chaos'])
    expect(gar.alert.chaos).toBe(true)
    expect(gar.units[0]!.state).toBe('combat')
  })

  it('a mech crouched behind cover is never noticed', () => {
    const f = yard().sentry(10, 5, 0).cover(9, 9, 3).build()
    const gar = makeGarrison(f)
    const e = run(gar, f, mech(10, 10, true), 30)
    expect(e).toEqual([])
    expect(gar.units[0]!.detect).toBe(0)
  })

  it('a glimpse sends a guard over to look; finding nothing, it goes back to its route', () => {
    const f = yard().guard([[10, 4, 60], [10, 5]]).build()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    const target = mech(10, 11)
    let e: GarrisonEvent[] = []
    // Seen just long enough to be suspected, then gone.
    for (let t = 0; t < 20 && u.state === 'patrol'; t += DT) {
      stepGarrison(gar, f.grid, target, DT)
      e.push(...drainEvents(gar))
    }
    expect(u.state).toBe('suspicious')
    target.visible = false
    let nearest = Infinity
    e = e.concat(run(gar, f, target, 40, () => { nearest = Math.min(nearest, Math.hypot(u.x - target.x, u.z - target.z)) }))
    expect(nearest).toBeLessThan(1.5)
    expect(types(e)).toEqual(['suspicious', 'calm'])
    expect(u.state).toBe('patrol')
    expect(gar.alert.level).toBe(0)
  })

  it('breaking the line of sight after being spotted stops the alert climbing', () => {
    const f = yard().sentry(10, 5, 0).build()
    const gar = makeGarrison(f)
    const target = mech(10, 10)
    for (let t = 0; t < 20 && gar.units[0]!.state !== 'combat'; t += DT) stepGarrison(gar, f.grid, target, DT)
    expect(gar.units[0]!.state).toBe('combat')
    target.visible = false
    const level = gar.alert.level
    run(gar, f, target, 3)
    expect(gar.alert.level).toBe(level)
    expect(gar.alert.chaos).toBe(false)
    run(gar, f, target, 60)
    expect(gar.units[0]!.state).toBe('patrol')
    expect(gar.alert.level).toBe(0)
  })

  it('a body in view raises the alert, once', () => {
    const f = yard().sentry(10, 5, 0).sentry(10, 10, 0).build()
    const gar = makeGarrison(f)
    killUnit(gar, 1, cellMid(10), cellMid(20))
    const e = run(gar, f, away, 30)
    expect(types(e).filter(t => t === 'body')).toHaveLength(1)
    expect(gar.units[1]!.found).toBe(true)
    expect(gar.alert.level).toBeLessThanOrEqual(ALERT_GAIN.body)
    expect(gar.units[1]!.state).toBe('dead')
  })

  it('a body out of sight raises nothing, and the dead see nothing', () => {
    const f = yard().sentry(10, 5, 0).sentry(10, 2, Math.PI).build()
    const gar = makeGarrison(f)
    killUnit(gar, 1, 0, 0)
    killUnit(gar, 0, cellMid(10), cellMid(20))
    const e = run(gar, f, mech(10, 8), 20)
    expect(types(e)).toEqual(['kill', 'kill'])
    expect(gar.alert.level).toBe(0)
  })

  it('a guard falls away from where the blow came from', () => {
    const f = yard().sentry(10, 10, 0).sentry(14, 10, 0).build()
    const gar = makeGarrison(f)
    killUnit(gar, 0, cellMid(10), cellMid(20))
    killUnit(gar, 1, cellMid(14), cellMid(2))
    expect(gar.units[0]!.fallDir).toBe(-1)
    expect(gar.units[1]!.fallDir).toBe(1)
  })

  it('a drone spots what stands in its light, and nothing outside it', () => {
    const f = yard().drone([[10, 10], [10, 11]], 7).build()
    const lit = makeGarrison(f)
    const d = lit.units[0]!
    const inLight: Target = { ...mech(10, 10), x: d.x, z: d.z + SPOT_AHEAD }
    expect(types(run(lit, f, inLight, 4))).toContain('spotted')
    expect(lit.alert.level).toBeGreaterThanOrEqual(ALERT_GAIN.drone)
    const dark = makeGarrison(f)
    expect(run(dark, f, mech(18, 18), 10)).toEqual([])
  })

  it('a decoy draws a guard over without worrying the base', () => {
    const f = yard().sentry(10, 5, 0).build()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    expect(lureTo(gar, f.grid, cellMid(14), 0, cellMid(12), 20)).toBe(1)
    expect(isUnaware(u)).toBe(true)
    let nearest = Infinity
    const e = run(gar, f, away, 40, () => { nearest = Math.min(nearest, Math.hypot(u.x - cellMid(14), u.z - cellMid(12))) })
    expect(nearest).toBeLessThan(1.5)
    expect(gar.alert.level).toBe(0)
    expect(types(e)).toEqual(['suspicious', 'calm'])
    // And it walks back to its post.
    expect(Math.hypot(u.x - u.homeX, u.z - u.homeZ)).toBeLessThan(0.5)
  })

  it('a decoy behind a wall draws nobody', () => {
    const f = yard().sentry(10, 5, 0).wall(6, 8, 14, 8, WALL_H).build()
    const gar = makeGarrison(f)
    expect(lureTo(gar, f.grid, cellMid(10), 0, cellMid(12), 20)).toBe(0)
  })

  it('a miss within earshot raises the alert and is looked into; out of earshot it is nothing', () => {
    const f = yard().sentry(10, 5, 0).build()
    const gar = makeGarrison(f)
    expect(noiseAt(gar, away, cellMid(20), cellMid(20), 6, 'miss')).toBe(false)
    expect(gar.alert.level).toBe(0)
    noiseAt(gar, away, cellMid(11), cellMid(6), 6, 'miss')
    expect(gar.alert.level).toBe(ALERT_GAIN.miss)
    expect(gar.units[0]!.state).toBe('suspicious')
  })

  it('a loud weapon brings the whole base, wherever it is fired', () => {
    const f = yard().sentry(4, 4, 0).guard([[18, 18], [18, 12]]).build()
    const gar = makeGarrison(f)
    const target = mech(11, 11)
    expect(noiseAt(gar, target, target.x, target.z, 5, 'loud')).toBe(true)
    expect(types(drainEvents(gar))).toContain('chaos')
    const before = gar.units.map(u => Math.hypot(u.x - target.x, u.z - target.z))
    target.visible = false
    run(gar, f, target, 4)
    expect(gar.units.every(u => u.state === 'combat')).toBe(true)
    // The walker closes in on where the noise was.
    expect(Math.hypot(gar.units[1]!.x - target.x, gar.units[1]!.z - target.z)).toBeLessThan(before[1]! - 4)
    // Nobody finds anything for long enough: the base stands down (round 3,
    // after Odyssey), and the walker goes back to its round on its guard.
    const later = run(gar, f, target, 90)
    expect(types(later)).toContain('standDown')
    expect(gar.alert.chaos).toBe(false)
    expect(gar.units[1]!.state).not.toBe('combat')
  })

  it('machines stay dormant through the stealth phase', () => {
    const f = yard().enforcer(10, 5, 0).build()
    const gar = makeGarrison(f)
    expect(run(gar, f, mech(10, 8), 10)).toEqual([])
    expect(gar.units[0]!.state).toBe('dormant')
  })

  it('the proving ground runs quietly for two minutes with nobody to find', () => {
    const f = buildProvingGround()
    const gar = makeGarrison(f)
    let offIsland = 0
    const e = run(gar, f, away, 120, () => {
      for (const u of gar.units) if (heightAt(f.grid, u.x, u.z) === VOID) offIsland++
    })
    expect(e).toEqual([])
    expect(offIsland).toBe(0)
    expect(gar.alert.level).toBe(0)
    // Every walker has actually gone somewhere.
    for (const u of gar.units) {
      if (u.route.length > 1) expect(Math.hypot(u.x - u.homeX, u.z - u.homeZ) + u.stride).toBeGreaterThan(1)
    }
  })
})
