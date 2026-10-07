// R43: the Bastion, revisited. #88 room round the outer wall; #96 roofs with
// skylights from threat II, so the perch cannot read the objectives; #78 more
// barrels; #94 more cables; #72 #90 the new defenders placed; #72 the Goliath
// never shells a mech right over it, and hurts itself only through a decoy.

import { describe, expect, it } from 'vitest'
import { BASTION_PAD as P, buildBastion } from '@/game/data/fortresses/bastion'
import { CELL, VOID, cellHeight, cellMid, cellsLinked, hasLineOfSight, heightAt, roofAt } from '@/game/world/grid'
import { MANTLE_MAX } from '@/game/sim/player'
import { FortressBuilder } from '@/game/world/fortress'
import { GOLIATH_MIN_M, drainEvents, makeGarrison, stepGarrison, type GarrisonEvent, type Target } from '@/game/sim/garrison'
import { stepFire } from '@/game/sim/chaos'

/** The curtain wall in the old frame: x 6..53, z 8..55. */
const WALL = { x0: 6 + P, x1: 53 + P, z0: 8 + P, z1: 55 + P }

describe('room round the outer wall (#88)', () => {
  const f = buildBastion(1)
  const g = f.grid
  it('open ground runs at least 8 m out from the middle of every side of the curtain', () => {
    const mx = Math.round((WALL.x0 + WALL.x1) / 2)
    const mz = Math.round((WALL.z0 + WALL.z1) / 2)
    for (let k = 1; k <= 4; k++) {
      expect(cellHeight(g, WALL.x0 - k, mz)).not.toBe(VOID)
      expect(cellHeight(g, WALL.x1 + k, mz)).not.toBe(VOID)
      expect(cellHeight(g, mx, WALL.z0 - k)).not.toBe(VOID)
      expect(cellHeight(g, mx, WALL.z1 + k)).not.toBe(VOID)
    }
  })

  it('a mech can circle the curtain outside it, on foot, without ever going in', () => {
    const outside = (cx: number, cz: number): boolean => cx < WALL.x0 || cx > WALL.x1 || cz < WALL.z0 || cz > WALL.z1
    const mz = Math.round((WALL.z0 + WALL.z1) / 2)
    const mx = Math.round((WALL.x0 + WALL.x1) / 2)
    // Flood the ring from the west side, on foot, never stepping inside the curtain.
    const seen = new Set<number>()
    const q: Array<[number, number]> = [[WALL.x0 - 3, mz]]
    seen.add((WALL.x0 - 3) + mz * g.w)
    while (q.length > 0) {
      const [cx, cz] = q.pop()!
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx
        const nz = cz + dz
        const k = nx + nz * g.w
        if (seen.has(k) || !outside(nx, nz) || !cellsLinked(g, cx, cz, nx, nz)) continue
        seen.add(k)
        q.push([nx, nz])
      }
    }
    // It reaches the other three sides.
    expect(seen.has((WALL.x1 + 3) + mz * g.w)).toBe(true)
    expect(seen.has(mx + (WALL.z0 - 3) * g.w)).toBe(true)
    expect(seen.has(mx + (WALL.z1 + 3) * g.w)).toBe(true)
  })

  it('two breaches in the curtain are low enough to pull up through', () => {
    let breaches = 0
    for (let cz = WALL.z0 + 1; cz < WALL.z1; cz++) {
      for (const cx of [WALL.x0, WALL.x1]) {
        const h = cellHeight(g, cx, cz)
        if (h > 0.6 && h <= MANTLE_MAX) breaches++
      }
    }
    expect(breaches).toBeGreaterThanOrEqual(4)
  })
})

describe('roofs from threat II (#96)', () => {
  const roofed = (level: number): number => {
    const g = buildBastion(level).grid
    let n = 0
    for (let i = 0; i < g.roof.length; i++) if (g.roof[i]! !== VOID) n++
    return n
  }
  it('none at I; roofs with skylights from II', () => {
    expect(roofed(1)).toBe(0)
    // II and III (their own fortresses) each roof a building, a skylight in it.
    expect(roofed(2)).toBeGreaterThan(20)
    expect(roofed(3)).toBeGreaterThan(20)
    // The old layout's arcade (threat IV still builds it).
    expect(roofed(4)).toBeGreaterThan(60)
    const g = buildBastion(4).grid
    // A skylight: an open cell with roof on both sides of it.
    const [hx, hz] = [33 + P, 35 + P]
    expect(roofAt(g, hx, hz)).toBe(VOID)
    expect(roofAt(g, hx - 1, hz)).not.toBe(VOID)
    expect(roofAt(g, hx + 1, hz)).not.toBe(VOID)
  })

  it('from the perch, under 40 % of the objectives (piles and beacons) can be seen', () => {
    for (const level of [2, 3, 4, 5]) {
      const f = buildBastion(level)
      const eye = heightAt(f.grid, f.insert.x, f.insert.z) + 2.2
      const goals = [...f.salvage, ...f.beacons]
      const seen = goals.filter(o => hasLineOfSight(f.grid, f.insert.x, eye, f.insert.z, o.x, o.y + 1, o.z)).length
      expect(seen / goals.length, `threat ${level}`).toBeLessThan(0.4)
    }
  })
})

describe('more to use (#78 #94 #76)', () => {
  it('4 to 8 barrels, more cables than before, a kit and a crate out in the ring', () => {
    const f = buildBastion(1)
    expect(f.barrels!.length).toBeGreaterThanOrEqual(4)
    expect(f.barrels!.length).toBeLessThanOrEqual(8)
    expect(f.grid.cables.length).toBeGreaterThanOrEqual(5)
    const outside = (x: number, z: number): boolean => {
      const cx = Math.floor(x / CELL)
      const cz = Math.floor(z / CELL)
      return cx < WALL.x0 || cx > WALL.x1 || cz < WALL.z0 || cz > WALL.z1
    }
    expect(f.supplies!.some(s => s.kind === 'kit' && outside(s.x, s.z))).toBe(true)
    expect(f.supplies!.some(s => s.kind === 'crate' && outside(s.x, s.z))).toBe(true)
  })
})

describe('the new defenders by level (#72 #90)', () => {
  const kinds = (level: number) => buildBastion(level).posts
  it('a shield at the gate, a Peashooter, the Scrap Hound and three drones from I (#176); a grenadier from II; the Buckshot and a marksman from III', () => {
    const one = kinds(1)
    expect(one.filter(p => p.kind === 'guard' && p.shield && !p.boss)).toHaveLength(1)
    expect(one.filter(p => p.kind === 'roomba' && !p.gun)).toHaveLength(1)
    expect(one.filter(p => p.kind === 'hound')).toHaveLength(1)
    expect(one.filter(p => p.kind === 'drone')).toHaveLength(3)
    expect(one.some(p => p.role === 'grenadier' || p.role === 'marksman')).toBe(false)
    const two = kinds(2)
    expect(two.some(p => p.kind === 'roomba' && !p.gun)).toBe(true)
    expect(two.some(p => p.role === 'grenadier')).toBe(true)
    const three = kinds(3)
    expect(three.some(p => p.kind === 'roomba' && p.gun === 'shotgun')).toBe(true)
    expect(three.some(p => p.kind === 'guard' && p.shield && !p.boss)).toBe(true)
    const mk = three.find(p => p.role === 'marksman')!
    expect(mk).toBeDefined()
    // On a tower, well above the yard.
    expect(heightAt(buildBastion(3).grid, mk.x, mk.z)).toBeGreaterThan(8)
  })
})

describe('the Goliath (#72)', () => {
  const DT = 1 / 30
  const setup = () => {
    const b = new FortressBuilder('t', 50, 50)
    b.ground(0, 0, 49, 49).insert(1, 1).extract(48, 48)
    b.goliath(25, 25, 0)
    const f = b.build()
    const gar = makeGarrison(f, 3)
    const u = gar.units[0]!
    u.state = 'combat'
    u.detect = 1
    u.fought = true
    return { f, gar, u }
  }
  const run = (gar: ReturnType<typeof makeGarrison>, f: ReturnType<FortressBuilder['build']>, t: Target, s: number): GarrisonEvent[] => {
    const all: GarrisonEvent[] = []
    for (let k = 0; k < s / DT; k++) {
      stepGarrison(gar, f.grid, t, DT)
      stepFire(gar, f.grid, t, DT)
      all.push(...drainEvents(gar))
    }
    return all
  }

  it('holds fire on a mech nearer than its minimum, and rolls back to where it has the room', () => {
    const { f, gar, u } = setup()
    const t: Target = { x: u.x, y: 0, z: u.z + GOLIATH_MIN_M * 0.6, height: 2.6, crouched: false, visible: true }
    const ev = run(gar, f, t, 6)
    expect(ev.filter(e => e.type === 'telegraph').length).toBe(0)
    expect(Math.hypot(u.x - t.x, u.z - t.z)).toBeGreaterThan(GOLIATH_MIN_M * 0.6 + 1)
  })

  it('shells a mech further off, and its own shell never lands on it unless a decoy called it', () => {
    const { f, gar, u } = setup()
    const t: Target = { x: u.x, y: 0, z: u.z + 20, height: 2.6, crouched: false, visible: true }
    const ev = run(gar, f, t, 10)
    expect(ev.some(e => e.type === 'telegraph')).toBe(true)
    expect(ev.some(e => e.type === 'selfHit')).toBe(false)
    // A decoy at its feet: the old trick still works.
    const { f: f2, gar: g2, u: u2 } = setup()
    g2.lures = [{ x: u2.x + 3, y: 0, z: u2.z + 3 }]
    const far: Target = { ...t, x: u2.x, z: u2.z + 30, visible: false }
    const ev2 = run(g2, f2, far, 12)
    expect(ev2.some(e => e.type === 'selfHit')).toBe(true)
    void cellMid
  })
})
