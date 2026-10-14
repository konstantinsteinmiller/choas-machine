import { describe, expect, it } from 'vitest'
import { FortressBuilder, WALL_H } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { WEAPON_IDS } from '@/game/data/ids'
import { makeGarrison, drainEvents, stepGarrison, isUnaware, SPECS, type Target } from '@/game/sim/garrison'
import { castShot, makeShotHit, rayBox, rayCylinder, raySphere, HEAD_Y } from '@/game/sim/hitscan'
import { BASE_DAMAGE, BLAST_RADIUS, blast, shotDamage } from '@/game/sim/damage'
import {
  MINIGUN_HEAT_S, MINIGUN_RPS, MINIGUN_SPOOL_S, ROCKETS_PER_MISSION, ROCKET_RELOAD_S, SNIPER_BOLT_S, SNIPER_MAG,
  SNIPER_RELOAD_S, SWITCH_S, ammoOf, isDry, makeArsenal, nextWeapon, stepArsenal, type Arsenal, type Trigger
} from '@/game/sim/weapons'
import { DECOY_LIFE_S, DECOY_RANGE, decoySpot, findStrike, stepDecoys, type Decoy } from '@/game/sim/melee'
import { ROCKET_SPEED, fireRocket, stepRockets, type Rocket } from '@/game/sim/rockets'

const DT = 1 / 60
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('test', 24, 24)
  b.ground(0, 0, 23, 23)
  b.insert(1, 1).extract(22, 22)
  return b
}
const idle: Trigger = { aimHeld: false, aimReleased: false, firePressed: false, fireHeld: false, touch: true, reload: false, select: null, cycle: false }
const hands = (over: Partial<Trigger>): Trigger => ({ ...idle, ...over })
/** Run the arsenal for `seconds` with the same trigger; total rounds fired. */
const hold = (a: Arsenal, t: Trigger, seconds: number): number => {
  let n = 0
  for (let s = 0; s < seconds - 1e-9; s += DT) n += stepArsenal(a, t, DT)
  return n
}

describe('ray shapes', () => {
  it('a sphere is hit from outside, at its near side', () => {
    expect(raySphere(0, 0, 0, 0, 0, 1, 0, 0, 10, 1)).toBeCloseTo(9)
    expect(raySphere(0, 0, 0, 0, 0, 1, 3, 0, 10, 1)).toBe(Infinity)
    expect(raySphere(0, 0, 0, 0, 0, -1, 0, 0, 10, 1)).toBe(Infinity)
    expect(raySphere(0, 0, 10, 0, 0, 1, 0, 0, 10, 1)).toBe(Infinity)
  })
  it('a cylinder is hit only between its two heights', () => {
    expect(rayCylinder(0, 1, 0, 0, 0, 1, 0, 10, 0.5, 0, 2)).toBeCloseTo(9.5)
    expect(rayCylinder(0, 3, 0, 0, 0, 1, 0, 10, 0.5, 0, 2)).toBe(Infinity)
  })
  it('a turned box is hit on the face that is turned to the ray', () => {
    // A 2 × 2 × 6 box end-on is 3 away from its centre; side-on, 1.
    expect(rayBox(0, 0, 0, 0, 0, 1, 0, 0, 10, 0, 1, 1, 3)).toBeCloseTo(7)
    expect(rayBox(0, 0, 0, 0, 0, 1, 0, 0, 10, Math.PI / 2, 1, 1, 3)).toBeCloseTo(9)
    expect(rayBox(5, 0, 0, 0, 0, 1, 0, 0, 10, 0, 1, 1, 3)).toBe(Infinity)
  })
})

describe('what a shot hits', () => {
  const f = yard().sentry(10, 10, 0).enforcer(14, 10, 0).wall(4, 10, 6, 10).drone([[18, 10], [18, 11]], 6).goliath(10, 18, 0).build()
  const gar = makeGarrison(f)
  const out = makeShotHit()
  const [guard, enforcer, drone, goliath] = gar.units
  const from = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    const d = Math.hypot(tx - x, ty - y, tz - z)
    return castShot(f.grid, gar.units, x, y, z, (tx - x) / d, (ty - y) / d, (tz - z) / d, 100, out)
  }

  it('a round at head height is a headshot, at chest height a body shot', () => {
    const head = from(guard!.x, HEAD_Y, guard!.z + 12, guard!.x, HEAD_Y, guard!.z)
    expect([head.kind, head.unit, head.zone]).toEqual(['unit', 0, 'head'])
    const body = from(guard!.x, 0.9, guard!.z + 12, guard!.x, 0.9, guard!.z)
    expect([body.kind, body.unit, body.zone]).toEqual(['unit', 0, 'body'])
  })
  it('a round that passes over the head misses and flies on', () => {
    expect(from(guard!.x, 2.3, guard!.z + 12, guard!.x, 2.3, guard!.z - 30).kind).toBe('none')
  })
  it('a wall stops a round', () => {
    const h = from(cellMid(5), 1, cellMid(16), cellMid(5), 1, cellMid(2))
    expect(h.kind).toBe('world')
    expect(h.z).toBeCloseTo(22, 1)
    expect(h.nz).toBe(1)
  })
  it('an Enforcer has plate, a head and four joints', () => {
    expect(from(enforcer!.x, 2, enforcer!.z + 12, enforcer!.x, 2, enforcer!.z).zone).toBe('armor')
    expect(from(enforcer!.x, 2.7, enforcer!.z + 12, enforcer!.x, 2.7, enforcer!.z).zone).toBe('head')
    expect(from(enforcer!.x + 0.48, 0.75, enforcer!.z + 12, enforcer!.x + 0.48, 0.75, enforcer!.z).zone).toBe('joint')
    expect(from(enforcer!.x - 1.0, 2.5, enforcer!.z + 12, enforcer!.x - 1.0, 2.5, enforcer!.z).zone).toBe('joint')
  })
  it('a drone is one target', () => {
    const h = from(drone!.x, 0, drone!.z - 10, drone!.x, drone!.y, drone!.z)
    expect([h.kind, h.unit]).toEqual(['unit', 2])
  })
  it('the Goliath is plate from the front and vents from behind', () => {
    // It faces +z: from +z a round meets the bow, from −z the vents.
    expect(from(goliath!.x, 1.35, goliath!.z + 15, goliath!.x, 1.35, goliath!.z).zone).toBe('armor')
    expect(from(goliath!.x, 1.35, goliath!.z - 15, goliath!.x, 1.35, goliath!.z).zone).toBe('weak')
  })
  it('the dead are not hit', () => {
    const g2 = makeGarrison(f)
    g2.units[0]!.state = 'dead'
    const d = castShot(f.grid, g2.units, guard!.x, 0.9, guard!.z + 12, 0, 0, -1, 14, makeShotHit())
    expect(d.kind).toBe('none')
  })
})

describe('what a hit is worth', () => {
  it('one sniper round to the head ends a guard; the Warden (the Commander) is a boss and takes several', () => {
    expect(shotDamage('sniper', 'guard', 'head')).toBeGreaterThan(1000)
    expect(shotDamage('sniper', 'commander', 'head')).toBeLessThan(SPECS.commander.hp)
    // #60: two rounds to the body, three to the legs.
    expect(shotDamage('sniper', 'guard', 'body', 1, 30)).toBeLessThan(30)
    expect(shotDamage('sniper', 'guard', 'body', 1, 30) * 2).toBeGreaterThanOrEqual(30)
    expect(shotDamage('sniper', 'commander', 'body')).toBeLessThan(60)
  })
  it('the minigun is for joints, not plate', () => {
    expect(shotDamage('minigun', 'enforcer', 'joint')).toBe(BASE_DAMAGE.minigun * 3)
    expect(shotDamage('minigun', 'enforcer', 'armor')).toBeLessThan(BASE_DAMAGE.minigun)
  })
  it("the vents are the Goliath's soft spot; its plate still gives a little", () => {
    // The plate is no longer next to nothing (a playtest: three full belts and
    // two rockets left it standing), but the vents stay where a round counts.
    for (const w of ['sniper', 'minigun'] as const) {
      expect(shotDamage(w, 'goliath', 'armor')).toBeGreaterThan(0)
      expect(shotDamage(w, 'goliath', 'armor')).toBeLessThan(shotDamage(w, 'goliath', 'weak') / 3)
    }
  })

  it('a blast kills a cluster, less so further out and behind a wall', () => {
    const f = yard().sentry(10, 10, 0).sentry(11, 10, 0).enforcer(12, 12, 0).wall(8, 8, 8, 12, WALL_H).sentry(7, 10, 0).build()
    const gar = makeGarrison(f)
    const res = blast(gar, f.grid, cellMid(10) + 1, 0.2, cellMid(10), -1)
    expect(res.kills.sort()).toEqual([0, 1])
    expect(gar.units[2]!.hp).toBeLessThan(600)
    expect(gar.units[2]!.hp).toBeGreaterThan(0)
    // Two cells off behind a wall: hurt at most, not dead.
    const far = makeGarrison(f)
    blast(far, f.grid, cellMid(9) + 0.9, 0.2, cellMid(10), -1)
    expect(far.units[3]!.state).not.toBe('dead')
    expect(BLAST_RADIUS).toBeGreaterThan(4)
  })
  it('the Goliath: three rockets on its plate end it, two in its vents (at any threat level)', () => {
    // A playtester's two rockets and three full belts left it standing: plate
    // took 35 % of a flat 400 against 3,450 hit points. A rocket now takes a
    // share of the tank.
    for (const level of [1, 3, 5]) {
      const f = yard().goliath(10, 10, 0).build()
      const bow = makeGarrison(f, level)
      const stern = makeGarrison(f, level)
      const hit = (gar: typeof bow, dz: number) => blast(gar, f.grid, cellMid(10), 1, cellMid(10) + dz, 0)
      expect(hit(bow, 3.4).weakHit).toBe(false)
      expect(hit(stern, -3.4).weakHit).toBe(true)
      expect(stern.units[0]!.maxHp - stern.units[0]!.hp).toBeGreaterThan(bow.units[0]!.maxHp - bow.units[0]!.hp)
      hit(bow, 3.4)
      expect(bow.units[0]!.state, `level ${level}: two on the plate`).not.toBe('dead')
      hit(bow, 3.4)
      expect(bow.units[0]!.state, `level ${level}: three on the plate`).toBe('dead')
      hit(stern, -3.4)
      expect(stern.units[0]!.state, `level ${level}: two in the vents`).toBe('dead')
    }
  })
})

describe('the weapons', () => {
  it('the sniper fires on release, works its bolt, and reloads after five', () => {
    const a = makeArsenal()
    expect(stepArsenal(a, hands({ aimReleased: true }), DT)).toBe(1)
    expect(ammoOf(a)).toBe(SNIPER_MAG - 1)
    // The bolt: a second pull at once does nothing.
    expect(stepArsenal(a, hands({ aimReleased: true }), DT)).toBe(0)
    hold(a, idle, SNIPER_BOLT_S)
    expect(stepArsenal(a, hands({ aimReleased: true }), DT)).toBe(1)
    for (let i = 0; i < 3; i++) { hold(a, idle, SNIPER_BOLT_S); stepArsenal(a, hands({ aimReleased: true }), DT) }
    expect(ammoOf(a)).toBe(0)
    hold(a, idle, 0.1)
    expect(a.reloading).toBeGreaterThan(0)
    hold(a, idle, SNIPER_RELOAD_S)
    expect(ammoOf(a)).toBe(SNIPER_MAG)
  })
  it('holding the aim fires nothing with the sniper', () => {
    const a = makeArsenal()
    expect(hold(a, hands({ aimHeld: true }), 2)).toBe(0)
  })
  it('a mouse fires with its own trigger, not by letting the aim go', () => {
    const a = makeArsenal()
    expect(stepArsenal(a, hands({ touch: false, aimReleased: true }), DT)).toBe(0)
    expect(stepArsenal(a, hands({ touch: false, firePressed: true, fireHeld: true }), DT)).toBe(1)
  })
  it('a reload can be asked for, but not with a full magazine', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ reload: true }), DT)
    expect(a.reloading).toBe(0)
    stepArsenal(a, hands({ aimReleased: true }), DT)
    stepArsenal(a, hands({ reload: true }), DT)
    expect(a.reloading).toBeGreaterThan(0)
  })
  it('the minigun spools up before its first round, then fires at its rate', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ select: 'minigun' }), DT)
    hold(a, idle, SWITCH_S)
    expect(hold(a, hands({ aimHeld: true }), MINIGUN_SPOOL_S - 0.05)).toBe(0)
    const n = hold(a, hands({ aimHeld: true }), 1.05)
    expect(n).toBeGreaterThanOrEqual(MINIGUN_RPS - 2)
    expect(n).toBeLessThanOrEqual(MINIGUN_RPS + 2)
  })
  it('the minigun overheats, locks, and comes back once it has cooled', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ select: 'minigun' }), DT)
    hold(a, hands({ aimHeld: true }), SWITCH_S + MINIGUN_SPOOL_S + MINIGUN_HEAT_S + 0.2)
    expect(a.overheated).toBe(true)
    expect(hold(a, hands({ aimHeld: true }), 1)).toBe(0)
    hold(a, idle, 3)
    expect(a.overheated).toBe(false)
    expect(hold(a, hands({ aimHeld: true }), MINIGUN_SPOOL_S + 0.5)).toBeGreaterThan(0)
  })
  it('the launcher fires one, reloads itself, and runs out', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ select: 'rocket' }), DT)
    hold(a, idle, SWITCH_S)
    expect(ammoOf(a)).toBe(ROCKETS_PER_MISSION)
    let fired = 0
    for (let i = 0; i < ROCKETS_PER_MISSION + 3; i++) {
      fired += stepArsenal(a, hands({ aimReleased: true }), DT)
      expect(stepArsenal(a, hands({ aimReleased: true }), DT)).toBe(0)
      hold(a, idle, ROCKET_RELOAD_S + 0.1)
    }
    expect(fired).toBe(ROCKETS_PER_MISSION)
    expect(ammoOf(a)).toBe(0)
    expect(isDry(a)).toBe(true)
  })
  it('drawing a weapon takes a moment, and the cycle goes round all three', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ select: 'rocket' }), DT)
    // Not while it comes out; the pull is kept and goes off once it is drawn.
    expect(stepArsenal(a, hands({ aimReleased: true }), DT)).toBe(0)
    expect(hold(a, idle, SWITCH_S - 2 * DT)).toBe(0)
    expect(hold(a, idle, 4 * DT)).toBe(1)
    let w = WEAPON_IDS[0]
    const seen = new Set<string>()
    for (let i = 0; i < WEAPON_IDS.length; i++) { seen.add(w); w = nextWeapon(w) }
    expect(seen.size).toBe(WEAPON_IDS.length)
    expect(w).toBe(WEAPON_IDS[0])
  })
})

describe('the blade', () => {
  const f = yard().sentry(10, 10, 0).fill(14, 10, 15, 11, WALL_H).sentry(14, 13, 0).build()
  const gar = makeGarrison(f)
  const u = gar.units[0]!

  it('behind a guard it is a backstab; in front of it, a strike', () => {
    expect(findStrike(gar, f.grid, u.x, 0, u.z - 1.5, 0, true)).toEqual({ id: 0, kind: 'backstab' })
    expect(findStrike(gar, f.grid, u.x, 0, u.z + 1.5, Math.PI, true)).toEqual({ id: 0, kind: 'strike' })
  })
  it('out of reach there is nothing, nor in mid-air', () => {
    expect(findStrike(gar, f.grid, u.x, 0, u.z - 4, 0, true)).toBeNull()
    expect(findStrike(gar, f.grid, u.x, 0, u.z - 1.5, 0, false)).toBeNull()
  })
  it('from a ledge above a guard it is a drop', () => {
    const below = gar.units[1]!
    expect(findStrike(gar, f.grid, cellMid(14), WALL_H, cellMid(11) + 0.8, 0, true)).toEqual({ id: below.id, kind: 'drop' })
  })
  it('a dead guard is not on offer', () => {
    const g2 = makeGarrison(f)
    g2.units[0]!.state = 'dead'
    expect(findStrike(g2, f.grid, u.x, 0, u.z - 1.5, 0, true)).toBeNull()
  })
})

describe('decoys', () => {
  it('land ahead of the mech, short of a wall, and never in the void', () => {
    const f = yard().wall(4, 14, 16, 14, WALL_H).build()
    const open = decoySpot(f.grid, cellMid(10), 0, cellMid(2), 0)!
    expect(open.z - cellMid(2)).toBeGreaterThan(DECOY_RANGE - 1.5)
    const walled = decoySpot(f.grid, cellMid(10), 0, cellMid(10), 0)!
    expect(walled.z).toBeLessThan(28)
    expect(walled.z).toBeGreaterThan(cellMid(10) + 1)
    // Thrown off the edge of the island: nowhere to land.
    expect(decoySpot(f.grid, cellMid(23), 0, cellMid(10), Math.PI / 2)).toBeNull()
  })
  it('draw a guard over, hold it, and go out', () => {
    const f = yard().sentry(10, 5, 0).build()
    const gar = makeGarrison(f)
    const away: Target = { x: 2, y: 0, z: 2, height: 2.5, crouched: false, visible: false }
    const decoys: Decoy[] = [{ x: cellMid(13), y: 0, z: cellMid(11), yaw: 0, t: 0, life: DECOY_LIFE_S, pulse: 0 }]
    let nearest = Infinity
    let out = 0
    for (let t = 0; t < DECOY_LIFE_S + 1; t += DT) {
      out += stepDecoys(decoys, gar, f.grid, DT)
      stepGarrison(gar, f.grid, away, DT)
      nearest = Math.min(nearest, Math.hypot(gar.units[0]!.x - cellMid(13), gar.units[0]!.z - cellMid(11)))
    }
    drainEvents(gar)
    // Up to it, arm's length or so, and it stands there watching (#171).
    expect(nearest).toBeLessThan(2.4)
    expect(out).toBe(1)
    expect(decoys).toHaveLength(0)
    expect(gar.alert.level).toBe(0)
    expect(isUnaware(gar.units[0]!) || gar.units[0]!.state === 'search').toBe(true)
  })
})

describe('rockets', () => {
  it('fly straight and go off on the first wall', () => {
    const f = yard().wall(4, 14, 16, 14, WALL_H).build()
    const gar = makeGarrison(f)
    const list: Rocket[] = []
    fireRocket(list, cellMid(10), 1.5, cellMid(4), 0, 0, 1)
    let burst = null
    let steps = 0
    while (!burst && steps++ < 400) burst = stepRockets(list, f.grid, gar.units, DT)[0] ?? null
    expect(burst).not.toBeNull()
    expect(burst!.z).toBeGreaterThan(27.5)
    expect(burst!.z).toBeLessThan(28)
    expect(burst!.direct).toBe(-1)
    expect(list).toHaveLength(0)
    expect(steps * DT).toBeCloseTo((28 - cellMid(4)) / ROCKET_SPEED, 0)
  })
  it('go off on a defender they meet, and on their own when the fuel is out', () => {
    const f = yard().enforcer(10, 12, 0).build()
    const gar = makeGarrison(f)
    const list: Rocket[] = []
    fireRocket(list, cellMid(10), 2, cellMid(2), 0, 0, 1)
    fireRocket(list, cellMid(2), 30, cellMid(2), 0, 1, 0)
    const bursts = []
    for (let t = 0; t < 4; t += DT) bursts.push(...stepRockets(list, f.grid, gar.units, DT))
    expect(bursts).toHaveLength(2)
    expect(bursts[0]!.direct).toBe(0)
    expect(bursts[1]!.direct).toBe(-1)
    expect(bursts[1]!.y).toBeGreaterThan(100)
  })
})

describe('the mini-gun waits for the weapon to be on the line (#110)', () => {
  it('it spins up while the body turns, but fires only once ready', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ select: 'minigun' }), 0.1)
    hold(a, hands({}), SWITCH_S + 0.1)
    const notYet = hold(a, hands({ touch: false, fireHeld: true, ready: false }), 1)
    expect(notYet).toBe(0)
    expect(a.spool).toBe(1)
    const now = hold(a, hands({ touch: false, fireHeld: true, ready: true }), 0.3)
    expect(now).toBeGreaterThan(0)
  })
})

describe('the Goliath against what a raid carries', () => {
  it("two rockets on its plate and three full belts end it at threat III (the playtester's fight)", async () => {
    const { GOLIATH_PLATE_MINIGUN, BASE_DAMAGE } = await import('@/game/sim/damage')
    const { MINIGUN_BELT } = await import('@/game/sim/weapons')
    const f = yard().goliath(10, 10, 0).build()
    const gar = makeGarrison(f, 3)
    const u = gar.units[0]!
    blast(gar, f.grid, cellMid(10), 1, cellMid(10) + 3.4, 0)
    blast(gar, f.grid, cellMid(10), 1, cellMid(10) + 3.4, 0)
    const belts = 3 * MINIGUN_BELT * BASE_DAMAGE.minigun * GOLIATH_PLATE_MINIGUN
    expect(u.hp - belts).toBeLessThanOrEqual(0)
    // …and the rockets are still the tool: two belts alone are not.
    expect(u.maxHp - 2 * MINIGUN_BELT * BASE_DAMAGE.minigun * GOLIATH_PLATE_MINIGUN).toBeGreaterThan(u.maxHp * 0.7)
  })
})

describe('a click while the weapon comes out is not lost', () => {
  // Players pressed 3 and clicked at once: nothing left, and they took the
  // launcher for one that wants the right button held first.
  for (const w of ['rocket', 'sniper'] as const) {
    it(`the ${w} goes off once drawn, the left button alone`, () => {
      const a = makeArsenal()
      if (w === 'sniper') { a.current = 'rocket'; a.switching = 0 }
      stepArsenal(a, hands({ select: w, touch: false }), DT)
      expect(stepArsenal(a, hands({ firePressed: true, fireHeld: true, touch: false }), DT)).toBe(0)
      expect(hold(a, hands({ touch: false }), SWITCH_S + 0.05)).toBe(1)
    })
  }

  it('the minigun needs only the left button held: it spins up and fires', () => {
    const a = makeArsenal()
    stepArsenal(a, hands({ select: 'minigun', touch: false }), DT)
    hold(a, idle, SWITCH_S + 0.05)
    expect(hold(a, hands({ fireHeld: true, touch: false }), MINIGUN_SPOOL_S + 0.3)).toBeGreaterThan(0)
  })
})
