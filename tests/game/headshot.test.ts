// #77: one round from the rifle to the head drops any guard or sentry, at
// every threat level, helmet or not.

import { describe, expect, it } from 'vitest'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { damageUnit, helmetPops, isAlive, makeGarrison } from '@/game/sim/garrison'
import { shotDamage } from '@/game/sim/damage'

describe('one headshot, one guard (#77)', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    it(`threat level ${level}, with the helmets the base learned`, () => {
      const gar = makeGarrison(buildBastion(level, 0, { helmets: true, boxCheck: true, perchLight: true }), level)
      const soft = gar.units.filter(u => (u.kind === 'guard' || u.kind === 'sentry') && !u.boss && isAlive(u))
      expect(soft.length).toBeGreaterThan(0)
      for (const u of soft) {
        helmetPops(u, 'head')
        // Even with the best damage upgrades left out (mul 1).
        expect(damageUnit(gar, u.id, shotDamage('sniper', u.kind, 'head', 1, u.maxHp), 0, 0)).toBe(true)
      }
    })
  }
})
