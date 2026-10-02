import { describe, expect, it } from 'vitest'
import { FortressBuilder, WALL_H, type Fortress } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  GOLIATH_HULL_TURN, GOLIATH_TURRET_TURN, WAKE_S, WAVE_AT_S, WAVE_SIZE, drainEvents, isAlive, livingCount, makeGarrison,
  noiseAt, stepGarrison, threatOf, type Garrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { GUNS, SHELL_RADIUS, SHELL_WARN_S, hitChance, stepFire } from '@/game/sim/chaos'
import { ARMOR_MAX, REGEN_AFTER_S, hurtArmor, makeArmor, stepArmor } from '@/game/sim/armor'
import { castShot, makeShotHit } from '@/game/sim/hitscan'
import { buildProvingGround } from '@/game/data/fortresses/proving'
import { MECH_HEIGHT } from '@/game/models/mech'

const DT = 1 / 60
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 30, 30)
  b.ground(0, 0, 29, 29)
  b.insert(1, 1).extract(28, 28)
  return b
}
const mech = (cx: number, cz: number): Target => ({
  x: cellMid(cx), y: 0, z: cellMid(cz), height: MECH_HEIGHT, crouched: false, visible: true, moving: 0
})
/** Run garrison and guns together, as the mission does. */
const run = (gar: Garrison, f: Fortress, target: Target, seconds: number, each?: (t: number) => void): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let t = 0; t < seconds; t += DT) {
    stepGarrison(gar, f.grid, target, DT)
    stepFire(gar, f.grid, target, DT)
    all.push(...drainEvents(gar))
    each?.(t)
  }
  return all
}
const of = <T extends GarrisonEvent['type']>(e: GarrisonEvent[], type: T) => e.filter((x): x is Extract<GarrisonEvent, { type: T }> => x.type === type)
const damageOf = (e: GarrisonEvent[]): number => of(e, 'fire').reduce((n, x) => n + x.damage, 0)

describe('armor', () => {
  it('takes hits, and goes down on the one that empties it', () => {
    const a = makeArmor()
    expect(hurtArmor(a, 40)).toBe(false)
    expect(a.hp).toBe(ARMOR_MAX - 40)
    expect(hurtArmor(a, 100)).toBe(true)
    expect(a.down).toBe(true)
    expect(hurtArmor(a, 10)).toBe(false)
  })
  it('mends once the mech has been out of the fire for a while, not before', () => {
    const a = makeArmor()
    hurtArmor(a, 60)
    for (let t = 0; t < REGEN_AFTER_S - 0.5; t += DT) stepArmor(a, DT)
    expect(a.hp).toBe(40)
    for (let t = 0; t < 10; t += DT) stepArmor(a, DT)
    expect(a.hp).toBe(ARMOR_MAX)
  })
  it('a hit restarts the wait', () => {
    const a = makeArmor()
    hurtArmor(a, 50)
    for (let t = 0; t < REGEN_AFTER_S - 0.2; t += DT) stepArmor(a, DT)
    hurtArmor(a, 1)
    for (let t = 0; t < 1; t += DT) stepArmor(a, DT)
    expect(a.hp).toBe(49)
  })
  it('a downed mech does not mend', () => {
    const a = makeArmor()
    hurtArmor(a, 999)
    for (let t = 0; t < 20; t += DT) stepArmor(a, DT)
    expect(a.hp).toBe(0)
  })
})

describe('the base shoots back', () => {
  it('a round is likelier to hit up close, on a standing, still mech', () => {
    const gun = GUNS.guard!
    const t = mech(0, 0)
    expect(hitChance(gun, 2, t)).toBeGreaterThan(hitChance(gun, 22, t) * 2)
    expect(hitChance(gun, 10, { ...t, moving: 1 })).toBeLessThan(hitChance(gun, 10, t) * 0.7)
    expect(hitChance(gun, 10, { ...t, crouched: true })).toBeLessThan(hitChance(gun, 10, t))
  })

  it('a guard that has made the mech fires bursts at it, and the same fight replays the same', () => {
    const fight = (): GarrisonEvent[] => {
      const f = yard().sentry(10, 5, 0).build()
      const gar = makeGarrison(f)
      return run(gar, f, mech(10, 9), 20)
    }
    const a = fight()
    const shots = of(a, 'fire')
    expect(shots.length).toBeGreaterThan(8)
    expect(damageOf(a)).toBeGreaterThan(0)
    // Some miss: nobody is a perfect shot.
    expect(shots.some(s => s.damage === 0)).toBe(true)
    expect(damageOf(fight())).toBe(damageOf(a))
  })

  it('nobody fires at what it cannot see', () => {
    const f = yard().sentry(10, 5, 0).wall(4, 8, 16, 8, WALL_H).build()
    const gar = makeGarrison(f)
    const target = mech(10, 12)
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    // (Given time it walks round the wall; until then, nothing.)
    expect(of(run(gar, f, target, 2.5), 'fire')).toHaveLength(0)
  })

  it('a calm guard does not shoot', () => {
    const f = yard().sentry(10, 5, Math.PI).build()
    const gar = makeGarrison(f)
    expect(of(run(gar, f, mech(10, 12), 10), 'fire')).toHaveLength(0)
  })
})

describe('machines', () => {
  it('an Enforcer sleeps through the stealth, wakes on full alert, and fires once it is up', () => {
    const f = yard().enforcer(10, 5, 0).build()
    const gar = makeGarrison(f)
    const target = mech(10, 10)
    expect(run(gar, f, target, 5)).toEqual([])
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    const early = run(gar, f, target, WAKE_S - 0.2)
    expect(of(early, 'wake')).toHaveLength(1)
    expect(of(early, 'fire')).toHaveLength(0)
    expect(gar.units[0]!.power).toBeLessThan(1)
    const later = run(gar, f, target, 8)
    expect(gar.units[0]!.power).toBe(1)
    expect(of(later, 'fire').length).toBeGreaterThan(10)
  })

  it('a drone that reports the mech sends the nearest Enforcer, and only that one', () => {
    const f = yard().drone([[10, 10], [10, 11]], 7).enforcer(12, 14, 0).enforcer(26, 26, 0).build()
    const gar = makeGarrison(f)
    const d = gar.units[0]!
    const target: Target = { ...mech(10, 10), x: d.x, z: d.z + 3 }
    const e = run(gar, f, target, 3)
    expect(of(e, 'wake').map(w => w.id)).toEqual([1])
    expect(gar.units[2]!.state).toBe('dormant')
    expect(gar.alert.chaos).toBe(false)
  })

  it('a machine that is shot wakes up', () => {
    const f = yard().enforcer(10, 5, 0).build()
    const gar = makeGarrison(f)
    expect(gar.units[0]!.state).toBe('dormant')
    // The mission calls `alarmUnit` on a hit that does not kill.
    return import('@/game/sim/garrison').then(({ alarmUnit }) => {
      alarmUnit(gar, 0, 0, 0)
      expect(gar.units[0]!.state).toBe('combat')
      expect(of(drainEvents(gar), 'wake')).toHaveLength(1)
    })
  })
})

describe('reinforcements', () => {
  const f = yard().sentry(4, 4, 0).reserve(20, 28).reserve(21, 28).reserve(8, 28).build()

  it('are not in the base during the stealth: not counted, not hit', () => {
    const gar = makeGarrison(f)
    expect(livingCount(gar)).toBe(1)
    expect(gar.units.filter(u => u.state === 'reserve')).toHaveLength(3)
    const r = gar.units[1]!
    const hit = castShot(f.grid, gar.units, r.x, 1, r.z - 10, 0, 0, 1, 30, makeShotHit())
    expect(hit.kind).toBe('none')
    run(gar, f, { ...mech(1, 1), visible: false }, 60)
    expect(livingCount(gar)).toBe(1)
  })

  it('come in by waves once the base is on full alert', () => {
    const gar = makeGarrison(f)
    const target = mech(14, 14)
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    drainEvents(gar)
    const first = run(gar, f, target, WAVE_AT_S[0]! + 0.5)
    expect(of(first, 'wave').map(w => w.n)).toEqual([WAVE_SIZE])
    expect(livingCount(gar)).toBe(1 + WAVE_SIZE)
    const second = run(gar, f, target, WAVE_AT_S[1]! - WAVE_AT_S[0]!)
    expect(of(second, 'wave').map(w => w.n)).toEqual([1])
    expect(gar.units.every(u => isAlive(u))).toBe(true)
    // And they come for the mech.
    expect(gar.units.slice(1).every(u => u.state === 'combat')).toBe(true)
  })
})

describe('the Goliath', () => {
  const base = (): FortressBuilder => yard().goliath(14, 6, 0)

  it('marks where its shell will land, then lands it there', () => {
    const f = base().build()
    const gar = makeGarrison(f)
    const target = mech(14, 16)
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    const e = run(gar, f, target, 8)
    const mark = of(e, 'telegraph')[0]!
    const shell = of(e, 'shell')[0]!
    expect(mark.dur).toBe(SHELL_WARN_S)
    expect([shell.x, shell.z]).toEqual([mark.x, mark.z])
    expect(Math.hypot(mark.x - target.x, mark.z - target.z)).toBeLessThan(0.01)
    // Standing on the mark costs armor.
    expect(shell.damage).toBeGreaterThan(20)
  })

  it('a mech that moves off the mark is not hurt', () => {
    const f = base().build()
    const gar = makeGarrison(f)
    const target = mech(14, 16)
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    let moved = false
    const e = run(gar, f, target, 8, () => {
      if (!moved && gar.units[0]!.shellT > 0) {
        moved = true
        target.x += SHELL_RADIUS + 2
      }
    })
    expect(of(e, 'shell')[0]!.damage).toBe(0)
  })

  it('shoots at a decoy in preference to the mech', () => {
    const f = base().build()
    const gar = makeGarrison(f)
    const target = mech(8, 16)
    gar.lures = [{ x: cellMid(20), y: 0, z: cellMid(16) }]
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    const e = run(gar, f, target, 8)
    const mark = of(e, 'telegraph')[0]!
    expect(mark.x).toBeCloseTo(cellMid(20))
    expect(of(e, 'shell').every(s => s.damage === 0)).toBe(true)
  })

  it('turns its turret faster than its hull, so it can be flanked', () => {
    expect(GOLIATH_TURRET_TURN).toBeGreaterThan(GOLIATH_HULL_TURN * 2)
    const f = base().build()
    const gar = makeGarrison(f)
    const u = gar.units[0]!
    // The mech is off to its side.
    const target = mech(24, 6)
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    run(gar, f, target, WAKE_S + 1)
    expect(Math.abs(u.look)).toBeGreaterThan(Math.abs(u.yaw) + 0.3)
  })
})

describe('threat levels', () => {
  it('each level is at least as tough, as hard-hitting and as watchful as the one before', () => {
    for (let l = 2; l <= 5; l++) {
      const a = threatOf(l - 1)
      const b = threatOf(l)
      expect(b.hp).toBeGreaterThanOrEqual(a.hp)
      expect(b.damage).toBeGreaterThanOrEqual(a.damage)
      expect(b.notice).toBeGreaterThanOrEqual(a.notice)
    }
    expect(threatOf(5).hp).toBeGreaterThan(threatOf(1).hp)
    expect(threatOf(0)).toEqual(threatOf(1))
    expect(threatOf(99)).toEqual(threatOf(5))
  })
  it('scale the garrison built for them', () => {
    const f = yard().sentry(10, 5, 0).build()
    expect(makeGarrison(f, 5).units[0]!.hp).toBeGreaterThan(makeGarrison(f, 1).units[0]!.hp)
    const hurt = (level: number): number => {
      const gar = makeGarrison(f, level)
      return damageOf(run(gar, f, mech(10, 9), 30))
    }
    expect(hurt(5)).toBeGreaterThan(hurt(1))
  })
  it('Bastion grows with the level: more defenders, and the Goliath from level III', () => {
    const count = (l: number): number => buildBastion(l).posts.length
    for (let l = 2; l <= 5; l++) expect(count(l)).toBeGreaterThan(count(l - 1))
    const has = (l: number): boolean => buildBastion(l).posts.some(p => p.kind === 'goliath')
    expect([has(1), has(2), has(3), has(4), has(5)]).toEqual([false, false, true, true, true])
    for (let l = 1; l <= 5; l++) expect(buildBastion(l).posts.filter(p => p.kind === 'commander')).toHaveLength(1)
  })
})

describe('the proving ground in full alert', () => {
  it('a mech standing in the open is brought down, but not at once', () => {
    const f = buildProvingGround()
    const gar = makeGarrison(f)
    const armor = makeArmor()
    // In the middle of the yard, by the keep.
    const target: Target = { x: cellMid(20), y: 0, z: cellMid(24), height: MECH_HEIGHT, crouched: false, visible: true, moving: 0 }
    noiseAt(gar, target, target.x, target.z, 5, 'loud')
    let downAt = -1
    for (let t = 0; t < 90 && downAt < 0; t += DT) {
      stepGarrison(gar, f.grid, target, DT)
      stepFire(gar, f.grid, target, DT)
      for (const e of drainEvents(gar)) {
        if ((e.type === 'fire' || e.type === 'shell') && e.damage > 0 && hurtArmor(armor, e.damage)) downAt = t
      }
      stepArmor(armor, DT)
    }
    expect(downAt).toBeGreaterThan(5)
    expect(downAt).toBeLessThan(60)
  })
})
