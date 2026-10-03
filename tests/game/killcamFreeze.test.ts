// #91: during a kill-cam the base holds still. Nobody thinks, walks or
// shoots; the base's clock stops; only the fallen go on falling.

import { describe, expect, it } from 'vitest'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { isAlive, killUnit, makeGarrison, stepFallen } from '@/game/sim/garrison'

describe('the world holds still for a kill-cam (#91)', () => {
  it('living units do not move, the clock stops, the dead keep falling', () => {
    const f = buildBastion(3)
    const gar = makeGarrison(f, 3)
    const victim = gar.units.find(u => u.kind === 'guard' && isAlive(u))!
    killUnit(gar, victim.id, victim.x + 3, victim.z, 'shot')
    const live = gar.units.filter(isAlive).map(u => ({ id: u.id, x: u.x, z: u.z, yaw: u.yaw, state: u.state, detect: u.detect }))
    const clock = gar.time
    for (let i = 0; i < 120; i++) stepFallen(gar, f.grid, 1 / 60)
    expect(gar.time).toBe(clock)
    for (const s of live) {
      const u = gar.units[s.id]!
      expect([u.x, u.z, u.yaw, u.state, u.detect]).toEqual([s.x, s.z, s.yaw, s.state, s.detect])
    }
    expect(victim.deadT).toBeGreaterThan(1.9)
  })
})
