// #40 (R15): one or two bosses a level; none falls to one sniper round; no
// blade takes one; and the first hit on one wakes the whole base (the mission
// calls goLoud: see `sim/mission.ts`, the `u.boss` branch after a hit).

import { describe, expect, it } from 'vitest'
import { buildBastion, BASTION_LEVELS } from '@/game/data/fortresses/bastion'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { makeGarrison, SPECS, type Unit } from '@/game/sim/garrison'
import { castShot, makeShotHit, RIOT_SHIELD } from '@/game/sim/hitscan'
import { shotDamage, BASE_DAMAGE, WARDEN_HEAD } from '@/game/sim/damage'
import { findStrike } from '@/game/sim/melee'

const bosses = (level: number): string[] =>
  makeGarrison(buildBastion(level), level).units.filter(u => u.boss && u.state !== 'reserve').map(u => u.boss!)

describe('who the bosses are', () => {
  it.each(Array.from({ length: BASTION_LEVELS }, (_, i) => i + 1))('level %i has one or two', (level) => {
    const list = bosses(level)
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list.length).toBeLessThanOrEqual(2)
    expect(list).toContain('warden')
  })

  it('they vary: the Foreman at II, the Goliath from III, the Warden\'s shield from IV', () => {
    expect(bosses(1)).toEqual(['warden'])
    expect(bosses(2).sort()).toEqual(['foreman', 'warden'])
    expect(bosses(3).sort()).toEqual(['goliath', 'warden'])
    const warden = (level: number): Unit => makeGarrison(buildBastion(level), level).units.find(u => u.boss === 'warden')!
    expect(warden(3).shield).toBe(false)
    expect(warden(4).shield).toBe(true)
    // The Foreman is tougher than the Enforcer it was (the Sea Fort has no
    // plain one beside it any more: the same post, built without the title).
    const f2 = buildBastion(2)
    const fore = makeGarrison(f2, 2).units.find(u => u.boss === 'foreman')!
    const plain = makeGarrison({ ...f2, posts: f2.posts.map(p => (p.boss === 'foreman' ? { ...p, boss: undefined } : p)) }, 2).units[fore.id]!
    expect(fore.maxHp).toBeGreaterThan(plain.maxHp)
  })
})

describe('no one-shot', () => {
  it('the Warden takes a few headshots at every level', () => {
    for (let level = 1; level <= BASTION_LEVELS; level++) {
      const w = makeGarrison(buildBastion(level), level).units.find(u => u.boss === 'warden')!
      const head = shotDamage('sniper', 'commander', 'head')
      expect(head).toBe(BASE_DAMAGE.sniper * WARDEN_HEAD)
      expect(Math.ceil(w.hp / head)).toBeGreaterThanOrEqual(3)
    }
    // A fully upgraded rifle still needs two.
    expect(SPECS.commander.hp / shotDamage('sniper', 'commander', 'head', 2)).toBeGreaterThan(1)
  })

  it('the riot shield stops a round from in front; from the side, he is hit', () => {
    const f = new FortressBuilder('t', 24, 24).ground(0, 0, 23, 23).insert(1, 1).extract(22, 22)
      .commander([[12, 12]], 0, { shield: true }).build()
    const gar = makeGarrison(f)
    const w = gar.units[0]!
    const out = makeShotHit()
    const shoot = (fx: number, fz: number, y: number) => {
      const tx = w.x
      const tz = w.z
      const d = Math.hypot(tx - fx, tz - fz)
      return castShot(f.grid, gar.units, fx, y, fz, (tx - fx) / d, 0, (tz - fz) / d, 100, out)
    }
    // He faces +z: from in front, at chest height.
    expect(shoot(w.x, w.z + 12, w.y + RIOT_SHIELD.y).zone).toBe('armor')
    expect(shotDamage('sniper', 'commander', 'armor')).toBe(0)
    // From his side, at head height: the helm, not the shield.
    expect(shoot(w.x + 12, w.z, w.y + 1.54).zone).toBe('head')
  })
})

describe('the blade and the bosses', () => {
  it('the Warden is a person: a precise blade takes him from behind, never face to face (R74)', () => {
    const f = new FortressBuilder('t', 24, 24).ground(0, 0, 23, 23).insert(1, 1).extract(22, 22)
      .commander([[12, 12]], 0).build()
    const gar = makeGarrison(f)
    const w = gar.units[0]!
    // Right behind him (he faces +z), looking at his back.
    expect(findStrike(gar, f.grid, w.x, 0, w.z - 1.2, 0, true)).toEqual({ id: w.id, kind: 'backstab' })
    // In front of him: no one-stroke kill.
    expect(findStrike(gar, f.grid, w.x, 0, w.z + 1.2, Math.PI, true)).toBeNull()
    // The same spot behind a guard would be a strike.
    const g = new FortressBuilder('t', 24, 24).ground(0, 0, 23, 23).insert(1, 1).extract(22, 22)
      .guard([[12, 12]], 0).build()
    const gg = makeGarrison(g)
    expect(findStrike(gg, g.grid, cellMid(12), 0, cellMid(12) - 1.2, 0, true)).not.toBeNull()
  })
})
