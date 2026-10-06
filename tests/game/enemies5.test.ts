// R40: new defenders. #72 the Roombas (the Peashooter's SMG, the Buckshot's
// shotgun; the dome is the weak spot); #90 a guard with a riot shield, the
// grenadier, the marksman on a tower with a laser sight.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { SPECS, drainEvents, makeGarrison, stepGarrison, type GarrisonEvent, type Target } from '@/game/sim/garrison'
import { GRENADE_FUSE_S, MARKSMAN_AIM_S, gunOf, stepFire } from '@/game/sim/chaos'
import { castShot, type ShotHit } from '@/game/sim/hitscan'
import { blast, shotDamage } from '@/game/sim/damage'

const DT = 1 / 30
const yard = (w = 50): FortressBuilder => {
  const b = new FortressBuilder('t', w, w)
  b.ground(0, 0, w - 1, w - 1).insert(1, 1).extract(w - 2, w - 2)
  return b
}
const at = (x: number, z: number): Target => ({ x, y: 0, z, height: 2.6, crouched: false, visible: true })
const hit = (): ShotHit => ({ kind: 'none', unit: -1, zone: 'body', t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 }) as ShotHit
type G = ReturnType<typeof makeGarrison>
type F = ReturnType<FortressBuilder['build']>
const run = (gar: G, f: F, t: Target, s: number): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    stepFire(gar, f.grid, t, DT)
    all.push(...drainEvents(gar))
  }
  return all
}
const fight = (gar: G, t: Target): void => {
  for (const u of gar.units) { u.state = 'combat'; u.detect = 1; u.fought = true; u.seenX = t.x; u.seenZ = t.z; u.sees = true }
  gar.lkp = { x: t.x, y: t.y, z: t.z, t: 0 }
}

describe('Roombas (#72)', () => {
  it('are knee-high, with a gun each: an SMG, or the shotgun for the Buckshot', () => {
    const b = yard()
    b.roomba([[10, 10], [14, 10]], 0).roomba([[20, 20]], 0, true)
    const gar = makeGarrison(b.build(), 1)
    const [pea, buck] = gar.units
    expect(SPECS.roomba.height).toBeLessThan(1)
    expect(pea!.shotgun).toBe(false)
    expect(buck!.shotgun).toBe(true)
    // The shotgun hits far harder up close, and reaches less far.
    expect(gunOf(buck!)!.damage).toBeGreaterThan(gunOf(pea!)!.damage * 3)
    expect(gunOf(buck!)!.range).toBeLessThan(gunOf(pea!)!.range)
  })

  it('a sniper round in the dome ends one; in the shell it does not', () => {
    expect(shotDamage('sniper', 'roomba', 'weak', 1, SPECS.roomba.hp)).toBeGreaterThanOrEqual(SPECS.roomba.hp)
    expect(shotDamage('sniper', 'roomba', 'body', 1, SPECS.roomba.hp)).toBeLessThan(SPECS.roomba.hp)
  })

  it('a round from above finds the dome', () => {
    const b = yard()
    b.roomba([[10, 10]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    u.yaw = 0
    // Down onto the dome (just ahead of the middle) from a height.
    const d = Math.hypot(5.5, 3.12)
    const h = castShot(f.grid, gar.units, u.x, u.y + 6, u.z - 3, 0, -5.5 / d, 3.12 / d, 20, hit())
    expect(h.unit).toBe(u.id)
    expect(h.zone).toBe('weak')
    // Straight down onto the shell's rim: the shell, not nothing.
    const rim = castShot(f.grid, gar.units, u.x - 0.45, u.y + 6, u.z, 0, -1, 0, 20, hit())
    expect(rim.unit).toBe(u.id)
    expect(rim.zone).toBe('body')
  })

  it('fights: it fires at a mech in view', () => {
    const b = yard()
    b.roomba([[20, 20]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 3)
    const t = at(cellMid(24), cellMid(20))
    fight(gar, t)
    const ev = run(gar, f, t, 5)
    expect(ev.some(e => e.type === 'fire')).toBe(true)
  })
})

describe('the riot shield (#90)', () => {
  it('stops a round from in front; the head shows over it while he looks out (#151: otherwise it is up over his head too)', () => {
    const b = yard()
    b.shieldGuard([[10, 10]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    u.yaw = 0
    // Square from in front, at chest height: the shield.
    const chest = castShot(f.grid, gar.units, u.x, u.y + 1, u.z + 10, 0, 0, -1, 20, hit())
    expect(chest.unit).toBe(u.id)
    expect(chest.zone).toBe('armor')
    // At the head, the shield up: on the shield.
    expect(castShot(f.grid, gar.units, u.x, u.y + 1.58, u.z + 10, 0, 0, -1, 20, hit()).zone).toBe('armor')
    // Looking out over it: the head.
    u.peekT = 1
    const head = castShot(f.grid, gar.units, u.x, u.y + 1.58, u.z + 10, 0, 0, -1, 20, hit())
    expect(head.zone).toBe('head')
  })

  it('a blast knocks it away; the Warden keeps his', () => {
    const b = yard()
    b.shieldGuard([[10, 10]], 0).commander([[30, 30]], 0, { shield: true })
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const [g, w] = gar.units
    g!.hp = w!.hp = 1e6
    blast(gar, f.grid, g!.x + 1.5, 0.3, g!.z, -1, 3.5, 0.01)
    blast(gar, f.grid, w!.x + 1.5, 0.3, w!.z, -1, 3.5, 0.01)
    expect(g!.shield).toBe(false)
    expect(w!.shield).toBe(true)
    expect(drainEvents(gar).some(e => e.type === 'shieldDown' && e.id === g!.id)).toBe(true)
  })
})

describe('the grenadier (#90)', () => {
  it('lobs a grenade at the last known position: a ring first, the bang after the fuse', () => {
    const b = yard()
    b.grenadier([[14, 14]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 2)
    const t = at(cellMid(20), cellMid(14))
    fight(gar, t)
    const ev = run(gar, f, t, GRENADE_FUSE_S + 1.5)
    const ring = ev.find(e => e.type === 'telegraph')
    const bang = ev.find(e => e.type === 'shell')
    expect(ring).toBeDefined()
    expect(bang).toBeDefined()
    // The mech stood still in it: it is hurt.
    expect(bang && bang.type === 'shell' ? bang.damage : 0).toBeGreaterThan(0)
  })

  it('a mech that leaves the ring is not hurt', () => {
    const b = yard()
    b.grenadier([[14, 14]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 2)
    const t = at(cellMid(20), cellMid(14))
    fight(gar, t)
    let ev = run(gar, f, t, 0.5)
    expect(ev.some(e => e.type === 'telegraph')).toBe(true)
    const away = { ...t, x: t.x + 8, visible: true }
    ev = run(gar, f, away, GRENADE_FUSE_S)
    const bang = ev.find(e => e.type === 'shell')
    expect(bang).toBeDefined()
    expect(bang && bang.type === 'shell' ? bang.damage : 1).toBe(0)
  })
})

describe('the marksman (#90)', () => {
  it('sees further than a sentry, and its laser draws on the mech before the round', () => {
    const b = yard(80)
    b.marksman(10, 10, Math.PI / 2)
    const f = b.build()
    const gar = makeGarrison(f, 2)
    const u = gar.units[0]!
    expect(u.role).toBe('marksman')
    const t = at(cellMid(10) + 40, cellMid(10))
    fight(gar, t)
    let firstFire = -1
    for (let k = 0; k < 6 / DT; k++) {
      stepGarrison(gar, f.grid, t, DT)
      stepFire(gar, f.grid, t, DT)
      if (drainEvents(gar).some(e => e.type === 'fire' && e.id === u.id) && firstFire < 0) firstFire = k * DT
    }
    // It does fire at 40 m (a guard's rifle would not), and only after the laser had its time.
    expect(firstFire).toBeGreaterThanOrEqual(MARKSMAN_AIM_S - 0.05)
  })
})
