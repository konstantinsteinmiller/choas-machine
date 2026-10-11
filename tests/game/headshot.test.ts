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

// A playtester's scoped round through a walking guard's helmet flew past: the
// head sphere sat at a fixed point over the feet while the walk drew the head
// ~0.26 m off it. The test now follows the head as drawn (`Unit.drawnHead`).
describe('the head is hit where it is drawn', async () => {
  const { castShot, makeShotHit, HEAD_Y } = await import('@/game/sim/hitscan')
  const fort = buildBastion(1, 0)
  const gar = makeGarrison(fort, 1)
  const u = gar.units.find(v => v.kind === 'guard' && isAlive(v))!
  const shoot = (tx: number, ty: number, tz: number) => {
    // From 12 m back along x, level with the target.
    const ox = tx - 12, oy = ty, oz = tz
    return castShot(fort.grid, [u], ox, oy, oz, 1, 0, 0, 30, makeShotHit())
  }

  it('posed off its fixed point: a round through the drawn head is a headshot', () => {
    u.drawnHead = { x: u.x, y: u.y + HEAD_Y - 0.17, z: u.z + 0.2 }
    const h = shoot(u.x, u.drawnHead.y + 0.15, u.drawnHead.z + 0.15)
    expect(h.kind).toBe('unit')
    expect(h.zone).toBe('head')
  })

  it('not drawn: the fixed point over the feet still counts', () => {
    u.drawnHead = null
    const h = shoot(u.x, u.y + HEAD_Y, u.z)
    expect(h.kind).toBe('unit')
    expect(h.zone).toBe('head')
  })
})
