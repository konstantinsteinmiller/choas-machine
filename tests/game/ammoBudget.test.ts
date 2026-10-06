// Round 5 (#143): the ammunition budget per fortress and threat level.
//
// The factory stock is tight (10 rifle rounds, 100 on the belt, 2 rockets);
// the rest is upgraded or picked up. This pins the curve with plain arithmetic
// over every fortress the registry knows, so a later phase cannot drift it:
//  - a garrison outgrows the factory stock as the threat rises: going loud on
//    threat III takes pickups or upgrades;
//  - the bosses can still be beaten on the factory stock plus the crates;
//  - a fully upgraded mech can take the whole garrison on loud.
// Damage is counted crudely, as an average hit rate per weapon (the rifle
// mostly lands, the mini-gun sprays, a rocket always bursts).

import { describe, expect, it } from 'vitest'
import { FORTRESS_IDS, loadFortress } from '@/game/data/fortresses/registry'
import { SPECS, threatOf } from '@/game/sim/garrison'
import { BASE_DAMAGE } from '@/game/sim/damage'
import { SNIPER_MAG } from '@/game/sim/weapons'
import { CRATE_BELT, CRATE_RIFLE, CRATE_ROCKETS } from '@/game/sim/supplies'
import { BASE_LOADOUT, TRACK_MAX, loadoutOf } from '@/game/data/upgrades'
import { THREAT_LEVELS } from '@/game/sim/rewards'

const HIT = { sniper: 0.8, minigun: 0.5, rocket: 1 }
const worth = (rifle: number, belt: number, rockets: number): number =>
  rifle * BASE_DAMAGE.sniper * HIT.sniper + belt * BASE_DAMAGE.minigun * HIT.minigun + rockets * BASE_DAMAGE.rocket * HIT.rocket

const FACTORY = worth(SNIPER_MAG + BASE_LOADOUT.rifleReserve, BASE_LOADOUT.belt, BASE_LOADOUT.rockets)
const CRATE = worth(CRATE_RIFLE, CRATE_BELT, CRATE_ROCKETS)
const maxed = loadoutOf({ tiers: { sniper: 1, minigun: 1, rocket: 1 }, upgrades: { ammoRacks: TRACK_MAX, rocketAmmo: TRACK_MAX } })
const MAXED = worth(SNIPER_MAG + maxed.rifleReserve, maxed.belt, maxed.rockets)

describe('the ammunition budget (#143)', () => {
  it('the factory stock is 10 rifle rounds, 100 on the belt and 2 rockets', () => {
    expect(SNIPER_MAG + BASE_LOADOUT.rifleReserve).toBe(10)
    expect(BASE_LOADOUT.belt).toBe(100)
    expect(BASE_LOADOUT.rockets).toBe(2)
  })

  it('upgrades and pickups are where the rest comes from', () => {
    expect(maxed.rifleReserve).toBeGreaterThan(BASE_LOADOUT.rifleReserve)
    expect(maxed.belt).toBeGreaterThan(BASE_LOADOUT.belt)
    expect(maxed.rockets).toBeGreaterThan(BASE_LOADOUT.rockets)
    // A maxed stock stays near three times the factory's, not ten.
    expect(MAXED / FACTORY).toBeLessThan(4)
  })

  for (const id of FORTRESS_IDS) {
    it(`${id}: the garrison outgrows the stock, the bosses stay beatable, a maxed mech can go loud`, async () => {
      let last = Infinity
      let lastCrates = 0
      for (let level = 1; level <= THREAT_LEVELS; level++) {
        const f = await loadFortress(id, level, 0)
        const t = threatOf(level)
        const hp = f.posts.reduce((s, p) => s + SPECS[p.kind].hp * t.hp, 0)
        const bossHp = f.posts.filter(p => p.boss).reduce((s, p) => s + SPECS[p.kind].hp * t.hp, 0)
        const crates = (f.supplies ?? []).filter(s => s.kind === 'crate').length
        const ratio = FACTORY / hp
        expect(ratio, `${id} ${level}: factory stock against the garrison`).toBeLessThanOrEqual(last)
        last = ratio
        // Crates grow with the threat.
        expect(crates, `${id} ${level}: crates`).toBeGreaterThanOrEqual(lastCrates)
        lastCrates = crates
        expect(FACTORY + crates * CRATE, `${id} ${level}: stock and crates against the bosses`).toBeGreaterThanOrEqual(1.1 * bossHp)
        expect(MAXED, `${id} ${level}: a maxed stock against the garrison`).toBeGreaterThanOrEqual(hp)
        if (level === THREAT_LEVELS) expect(ratio, `${id} ${level}: loud on III takes pickups`).toBeLessThan(1)
      }
    })
  }
})
