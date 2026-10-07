// R35: ammunition runs out and is picked up (#76), armor mends only by kits
// (#101), and red barrels go up (#78).

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { CELL, cellHeight, cellMid } from '@/game/world/grid'
import { MINIGUN_BELT, SNIPER_MAG, SNIPER_RESERVE, isDry, makeArsenal, stepArsenal, type Trigger } from '@/game/sim/weapons'
import { makeArmor } from '@/game/sim/armor'
import { CRATE_BELT, CRATE_RIFLE, POUCH_ROUNDS_MAX, supplyUnderfoot, take, type Supply } from '@/game/sim/supplies'
import { BARREL_RADIUS, CHAIN_S, barrelAt, ignite, stepBarrels, type Barrel } from '@/game/sim/barrels'
import { blast } from '@/game/sim/damage'
import { makeGarrison } from '@/game/sim/garrison'
import { BASE_LOADOUT, RACK_BELT, RACK_RIFLE, loadoutOf } from '@/game/data/upgrades'

const DT = 1 / 60
const idle: Trigger = { aimHeld: false, aimReleased: false, firePressed: false, fireHeld: false, touch: false, reload: false, select: null, cycle: false }
const step = (a: ReturnType<typeof makeArsenal>, t: Partial<Trigger>, s = DT): number => stepArsenal(a, { ...idle, ...t }, s)

describe('ammunition runs out (#76)', () => {
  it('the rifle reloads from its reserve, and with nothing left in reserve it is dry', () => {
    const a = makeArsenal(6, 5, 0.4, 5)
    let fired = 0
    for (let s = 0; s < 40; s += DT) {
      fired += step(a, { firePressed: true })
    }
    expect(fired).toBe(SNIPER_MAG + 5)
    expect(a.sniperMag).toBe(0)
    expect(a.sniperReserve).toBe(0)
    expect(isDry(a)).toBe(true)
  })

  it('the mini-gun stops when its belt is spent', () => {
    const a = makeArsenal(6, 1e9, 9, 15, 30)
    step(a, { select: 'minigun' })
    let rounds = 0
    for (let s = 0; s < 20; s += DT) rounds += step(a, { fireHeld: true })
    expect(rounds).toBe(30)
    expect(a.minigunBelt).toBe(0)
    expect(isDry(a)).toBe(true)
  })

  it('the factory fit and the Ammo racks track', () => {
    expect([BASE_LOADOUT.rifleReserve, BASE_LOADOUT.belt]).toEqual([SNIPER_RESERVE, MINIGUN_BELT])
    const l = loadoutOf({ tiers: { sniper: 1, minigun: 1, rocket: 1 }, upgrades: { ammoRacks: 3 } })
    expect(l.rifleReserve).toBe(SNIPER_RESERVE + 3 * RACK_RIFLE)
    expect(l.belt).toBe(MINIGUN_BELT + 3 * RACK_BELT)
  })

  it('a pouch tops both up; a crate adds rifle rounds, belt and a rocket; a full mech walks past', () => {
    const a = makeArsenal(6, 5, 0.4, 15, 300)
    const armor = makeArmor()
    a.sniperReserve = 2
    a.minigunBelt = 10
    a.rockets = 1
    const list: Supply[] = [
      { kind: 'pouch', x: 0, y: 0, z: 0, taken: false, rounds: POUCH_ROUNDS_MAX },
      { kind: 'crate', x: 10, y: 0, z: 0, taken: false }
    ]
    const p = supplyUnderfoot(list, 0.5, 0, 0, a, armor, 6)!
    take(p, a, armor, 6)
    // Rifle rounds only (#183).
    expect([a.sniperReserve, a.minigunBelt]).toEqual([2 + POUCH_ROUNDS_MAX, 10])
    const c = supplyUnderfoot(list, 10, 0, 0.4, a, armor, 6)!
    take(c, a, armor, 6)
    expect(a.sniperReserve).toBe(Math.min(15, 2 + POUCH_ROUNDS_MAX + CRATE_RIFLE))
    expect(a.minigunBelt).toBe(10 + CRATE_BELT)
    expect(a.rockets).toBe(2)
    const full = makeArsenal()
    expect(supplyUnderfoot([{ kind: 'pouch', x: 0, y: 0, z: 0, taken: false }], 0, 0, 0, full, armor, 6)).toBeNull()
  })
})

describe('exploding barrels (#78)', () => {
  const yard = (): ReturnType<FortressBuilder['build']> => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
    b.fuel(10, 10).fuel(11, 10).fuel(20, 20)
    b.guard([[12, 12]], 0)
    return b.build()
  }

  it('a barrel is cover until it goes up; then its cell is floor again, and the one beside it follows a beat later', () => {
    const f = yard()
    const list: Barrel[] = f.barrels!.map(b => ({ ...b, live: true, fuse: -1 }))
    expect(cellHeight(f.grid, 10, 10)).toBeGreaterThan(1)
    ignite(barrelAt(list, 10, 10)!, 0)
    const first = stepBarrels(list, f.grid, DT)
    expect(first.map(b => [b.cx, b.cz])).toEqual([[10, 10]])
    expect(cellHeight(f.grid, 10, 10)).toBe(0)
    // Its neighbour is lit, not gone yet; the far one is untouched.
    expect(list[1]!.live).toBe(true)
    let later: Barrel[] = []
    for (let s = 0; s < CHAIN_S + 0.05; s += DT) later = later.concat(stepBarrels(list, f.grid, DT))
    expect(later.map(b => [b.cx, b.cz])).toEqual([[11, 10]])
    expect(list[2]!.live).toBe(true)
  })

  it('its blast hurts a guard standing in it', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const g = gar.units[0]!
    const hp = g.hp
    blast(gar, f.grid, cellMid(11), 0.7, cellMid(11), -1, BARREL_RADIUS, 0.75)
    expect(g.hp).toBeLessThan(hp)
    expect(CELL).toBe(2)
  })
})

describe('a supply picked up flies into its bar (#111)', () => {
  it('it leaves the floor, shrinks on its way, and arrives once', async () => {
    const { SupplyView, FLY_S } = await import('@/game/fx/supplyView')
    const { Vector3 } = await import('three')
    const s = { kind: 'crate' as const, x: 2, y: 0, z: 2, taken: true }
    const v = new SupplyView([s], [])
    const before = v.group.children.length
    v.fly(s)
    expect(v.group.children.length).toBe(before + 1)
    const to = new Vector3(0, 5, 0)
    expect(v.stepFlights(FLY_S * 0.5, () => to)).toEqual([])
    const flying = v.group.children[v.group.children.length - 1]!
    expect(flying.position.y).toBeGreaterThan(0.5)
    expect(flying.scale.x).toBeLessThan(1)
    expect(v.stepFlights(FLY_S, () => to)).toEqual([s])
    expect(v.group.children.length).toBe(before)
    expect(v.stepFlights(FLY_S, () => to)).toEqual([])
    v.dispose()
  })
})
