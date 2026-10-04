// R26: the base learns the last raid's habits and answers them in the next.

import { describe, expect, it } from 'vitest'
import { BOX_AT, HELMETS_AT, PERCH_AT, answersTo } from '@/game/sim/adapt'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid, hasLineOfSight, heightAt } from '@/game/world/grid'
import { drainEvents, helmetPops, makeGarrison, spotCentre, stepGarrison, type Target } from '@/game/sim/garrison'
import { shotDamage } from '@/game/sim/damage'

describe('what the base answers', () => {
  it('nothing for a quiet raid; each habit past its line', () => {
    expect(answersTo(null)).toEqual({ helmets: false, boxCheck: false, perchLight: false })
    expect(answersTo({ headshots: HELMETS_AT - 1, boxUses: BOX_AT - 1, perchKills: PERCH_AT - 1 })).toEqual({ helmets: false, boxCheck: false, perchLight: false })
    expect(answersTo({ headshots: HELMETS_AT, boxUses: 0, perchKills: 0 }).helmets).toBe(true)
    expect(answersTo({ headshots: 0, boxUses: BOX_AT, perchKills: 0 }).boxCheck).toBe(true)
    expect(answersTo({ headshots: 0, boxUses: 0, perchKills: PERCH_AT }).perchLight).toBe(true)
  })
})

describe('helmets', () => {
  it('the guards wear them; a round to the head knocks the helmet off and still drops the guard (#77)', () => {
    const f = buildBastion(1, 0, { helmets: true, boxCheck: false, perchLight: false })
    const gar = makeGarrison(f, 1)
    const g = gar.units.find(u => u.kind === 'guard')!
    expect(g.helmet).toBe(true)
    expect(helmetPops(g, 'body')).toBe(false)
    expect(g.helmet).toBe(true)
    expect(helmetPops(g, 'head')).toBe(true)
    expect(g.helmet).toBe(false)
    expect(shotDamage('sniper', 'guard', 'head', 1, g.maxHp)).toBeGreaterThanOrEqual(g.maxHp)
    expect(helmetPops(g, 'head')).toBe(false)
    // Without the answer, no helmets.
    expect(makeGarrison(buildBastion(1), 1).units.some(u => u.helmet)).toBe(false)
  })
})

describe('box checkers', () => {
  // #111: a still disguise is never taken for the mech; a box checker comes to
  // test it from further off (it fires its round from BOX_CHECK_M, not INSPECT_M).
  const watch = (check: boolean): string => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
    b.guard([[10, 6]], 0)
    const f = b.build()
    f.answers = { helmets: false, boxCheck: check, perchLight: false }
    const gar = makeGarrison(f, 1)
    const t: Target = { x: cellMid(10), y: 0, z: cellMid(10), height: 1.8, crouched: true, visible: true, box: 'still' }
    let fired = false
    for (let k = 0; k < 30 * 14; k++) { stepGarrison(gar, f.grid, t, 1 / 30); if (drainEvents(gar).some(e => e.type === 'fire')) fired = true }
    return fired ? 'tested' : gar.units[0]!.state
  }
  it('a box that sits still 8 m off is left alone, until the base has learned the box: then it gets a test round', () => {
    expect(watch(false)).toBe('patrol')
    expect(watch(true)).toBe('tested')
  })
})

describe('the perch light', () => {
  it('a searchlight on the battery sweeps the perch, and its light reaches it', () => {
    const f = buildBastion(1, 0, { helmets: false, boxCheck: false, perchLight: true })
    const gar = makeGarrison(f, 1)
    const lights = gar.units.filter(u => u.kind === 'searchlight')
    const near = lights.find(u => u.route.some(w => Math.hypot(w.x - f.insert.x, w.z - f.insert.z) < 4))
    expect(near).toBeDefined()
    const c = spotCentre(near!)
    expect(c).toBeDefined()
    const top = heightAt(f.grid, f.insert.x, f.insert.z)
    expect(hasLineOfSight(f.grid, near!.x, near!.y, near!.z, f.insert.x, top + 1, f.insert.z)).toBe(true)
    expect(buildBastion(1).posts.filter(p => p.kind === 'searchlight').length).toBe(lights.length - 1)
  })
})
