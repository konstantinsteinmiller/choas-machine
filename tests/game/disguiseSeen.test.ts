// #111, after a playtest: a mech that shot from a spot and put its toaster
// on right there, under a guard's nose, sat on untouched while the guard
// clipped into it. A disguise fools only who did not see the mech for what
// it is: not one that watched it go on, not one hunting where the shots came
// from, not one walking into it. Whoever lost the mech and finds a box round
// the corner later is fooled as before. And a guard facing a mech up on a
// platform sees it, whatever the height: the platform's own lip hides nothing.

import { describe, expect, it } from 'vitest'
import { FortressBuilder, type Fortress } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { exposure } from '@/game/sim/perception'
import {
  BOX_BUMP_M, HOT_M, LOST_TRACK_S, drainEvents, estimateShot, makeGarrison, stepGarrison, type Garrison, type Target
} from '@/game/sim/garrison'
import { MECH_HEIGHT, MECH_HEIGHT_CROUCH } from '@/game/models/mech'
import { stepFire } from '@/game/sim/chaos'

const DT = 1 / 30

/** A flat yard, one guard at (10, 6) looking along +z. */
const yard = (): { f: Fortress; gar: Garrison } => {
  const b = new FortressBuilder('t', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  b.guard([[10, 6]], 0)
  const f = b.build()
  return { f, gar: makeGarrison(f, 1) }
}

const at = (cx: number, cz: number, box?: 'still' | 'creep', visible = true): Target => ({
  x: cellMid(cx), y: 0, z: cellMid(cz), height: box ? MECH_HEIGHT_CROUCH : MECH_HEIGHT, crouched: !!box, visible, ...(box ? { box } : {})
})

/** Step for `s` seconds; whether the guard went for the mech. */
const run = (gar: Garrison, f: Fortress, t: Target, s: number): boolean => {
  let spotted = false
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    if (drainEvents(gar).some(e => e.type === 'spotted')) spotted = true
  }
  return spotted || gar.units[0]!.state === 'combat'
}

describe('a disguise fools only who did not see the mech', () => {
  it('a guard that watched the disguise go on is not fooled', () => {
    const { f, gar } = yard()
    const g = gar.units[0]!
    // In plain sight 8 m ahead, until the guard has begun to take it in…
    for (let k = 0; k < 120 && !(g.sees && g.detect > 0.1); k++) stepGarrison(gar, f.grid, at(10, 10), DT)
    expect(g.sees).toBe(true)
    expect(g.state).not.toBe('combat')
    // …then the toaster, right there, still.
    expect(run(gar, f, at(10, 10, 'still'), 3)).toBe(true)
  })

  it('one that lost it, then finds a still box round the corner much later, is fooled as before', () => {
    const { f, gar } = yard()
    const g = gar.units[0]!
    for (let k = 0; k < 120 && !(g.sees && g.detect > 0.1); k++) stepGarrison(gar, f.grid, at(10, 10), DT)
    // Gone from sight for a while…
    run(gar, f, at(10, 10, undefined, false), 12)
    // …and a box well away from where it was last seen (more than HOT_M).
    expect(Math.hypot(cellMid(14) - cellMid(10), cellMid(14) - cellMid(10))).toBeGreaterThan(HOT_M)
    expect(run(gar, f, at(14, 14, 'still'), 6)).toBe(false)
  })

  it('a box that was never seen going on is left alone by a guard at ease', () => {
    const { f, gar } = yard()
    expect(run(gar, f, at(10, 10, 'still'), 10)).toBe(false)
  })

  it('a guard hunting the spot the shots came from knows the box there for the mech', () => {
    const { f, gar } = yard()
    // Shots from (10, 10): the base has the spot; the guard is looking that way.
    estimateShot(gar, cellMid(10), 2, cellMid(10), cellMid(10), cellMid(20))
    gar.units[0]!.focusT = 6
    expect(run(gar, f, at(10, 10, 'still'), 3)).toBe(true)
  })

  it('a guard that walks right into it, at ease or not, knows it', () => {
    const { f, gar } = yard()
    const g = gar.units[0]!
    const t = at(10, 6, 'still')
    t.z = g.z + Math.cos(g.yaw) * (BOX_BUMP_M - 0.4)
    t.x = g.x + Math.sin(g.yaw) * (BOX_BUMP_M - 0.4)
    expect(run(gar, f, t, 1.5)).toBe(true)
  })
})

describe('found quicker where the shots came from', () => {
  it('a hunting guard fills its meter faster on a mech that stays by its shooting spot', () => {
    const fill = (hot: boolean): number => {
      const { f, gar } = yard()
      const g = gar.units[0]!
      if (hot) estimateShot(gar, cellMid(10), 2, cellMid(10), cellMid(10), cellMid(20))
      g.focusT = 6
      g.detect = 0
      // Crouched 8 m ahead.
      const t = { ...at(10, 10), crouched: true, height: MECH_HEIGHT_CROUCH }
      for (let k = 0; k < 20; k++) stepGarrison(gar, f.grid, t, DT)
      return g.detect
    }
    expect(fill(true)).toBeGreaterThan(fill(false) * 1.5)
  })
})

describe('sight in all verticality', () => {
  it('a guard facing a mech up on a platform sees it, however far back from the lip it stands', () => {
    for (const h of [1.5, 3, 5]) {
      const g = new FortressBuilder('v', 40, 40).ground(0, 0, 39, 39, 0).fill(20, 0, 39, 39, h).insert(1, 1).extract(38, 38).build().grid
      for (const back of [0.5, 3, 6]) {
        for (const crouched of [false, true]) {
          const e = exposure(g, { x: 38, y: 1.7, z: 20, yaw: Math.PI / 2, halfAngle: 0.8, range: 30 },
            { x: 40 + back, feetY: h, z: 20, height: crouched ? MECH_HEIGHT_CROUCH : MECH_HEIGHT })
          expect(e, `${h} m up, ${back} m back${crouched ? ', crouched' : ''}`).toBe(1)
        }
      }
    }
  })

  it('cover standing on that platform still hides a crouched mech behind it', () => {
    const b = new FortressBuilder('v', 40, 40).ground(0, 0, 39, 39, 0).fill(20, 0, 39, 39, 3).insert(1, 1).extract(38, 38)
    b.fill(21, 9, 21, 11, 3 + 1.4)
    const g = b.build().grid
    expect(exposure(g, { x: 30, y: 1.7, z: 20, yaw: Math.PI / 2, halfAngle: 0.8, range: 30 },
      { x: cellMid(22), feetY: 3, z: 20, height: MECH_HEIGHT_CROUCH })).toBe(0)
  })
})

// A playtester sat in the toaster, fired a rocket, sat out the reload in the
// box unshot and fired again: one fighting the mech is not fooled by the box
// until it has lost the mech from view for LOST_TRACK_S.
describe('a defender in the fight keeps its eyes on the mech, box or no box', () => {
  /** The guard fighting a mech 8 m ahead, in full view. */
  const fighting = (): { f: Fortress; gar: Garrison } => {
    const { f, gar } = yard()
    const g = gar.units[0]!
    for (let k = 0; k < 30 * 6 && g.state !== 'combat'; k++) stepGarrison(gar, f.grid, at(10, 10), DT)
    expect(g.state).toBe('combat')
    return { f, gar }
  }

  it('the mech boxes up in its sight: it keeps shooting at it', () => {
    const { f, gar } = fighting()
    let fired = 0
    for (let k = 0; k < 30 * 4; k++) {
      stepGarrison(gar, f.grid, at(10, 10, 'still'), DT)
      stepFire(gar, f.grid, at(10, 10, 'still'), DT)
      fired += drainEvents(gar).filter(e => e.type === 'fire').length
    }
    expect(gar.units[0]!.state).toBe('combat')
    expect(fired).toBeGreaterThan(0)
  })

  it('lost from view for longer than LOST_TRACK_S, a box well away from the fight fools it again', () => {
    const { f, gar } = fighting()
    const g = gar.units[0]!
    run(gar, f, at(10, 10, undefined, false), LOST_TRACK_S + 1)
    expect(g.eyesOffT).toBeGreaterThan(LOST_TRACK_S)
    // Round a corner, far from where the fight was: the base calms in time and the box is a box.
    gar.units[0]!.state = 'search'
    let fired = 0
    for (let k = 0; k < 30 * 3; k++) {
      stepGarrison(gar, f.grid, at(16, 16, 'still'), DT)
      stepFire(gar, f.grid, at(16, 16, 'still'), DT)
      fired += drainEvents(gar).filter(e => e.type === 'fire').length
    }
    expect(g.state).not.toBe('combat')
    expect(fired).toBe(0)
  })
})
