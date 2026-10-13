// #201: the mech is on a rope only where the rope is: it steps on at the line's
// end, off past the far one, and a rope shot down to the ground runs to where
// it was aimed, not down the wall and along the ground.
import { describe, expect, it } from 'vitest'
import { makePlayer, stepPlayer, type Player, type Wish } from '@/game/sim/player'
import { findRopeShot } from '@/game/sim/ropes'
import { FortressBuilder } from '@/game/world/fortress'
import { cableEnds, cableSpan, cellMid, type Grid } from '@/game/world/grid'

const DT = 1 / 60
const wish = (mx = 0, mz = 0): Wish => ({ mx, mz, crouch: false, aiming: false, aimYaw: 0 })

/** Walk until `done`, noting where the mech was each step and in what mode. */
const walk = (p: Player, g: Grid, w: Wish, done: (p: Player) => boolean, max = 12): Array<{ x: number; mode: string }> => {
  const out: Array<{ x: number; mode: string }> = []
  for (let i = 0; i < max / DT && !done(p); i++) {
    stepPlayer(p, g, w, DT)
    out.push({ x: p.x, mode: p.mode })
  }
  return out
}

describe('a rope is walked only where it is strung (#201)', () => {
  // Two wide platforms, 4 cells each (8 m), with a rope from the middle of one to the middle of the other.
  const wide = (): Grid => {
    const b = new FortressBuilder('t', 30, 8)
    b.ground(0, 0, 29, 7).insert(0, 0).extract(29, 7)
    b.fill(1, 2, 4, 5, 6).fill(15, 2, 18, 5, 4).cable(2, 3, 16, 3)
    return b.build().grid
  }

  it('steps on at the line\'s near end, not across the platform before it', () => {
    const g = wide()
    const e = cableEnds(g, g.cables[0]!)
    const p = makePlayer(cellMid(1), 6, cellMid(3))
    const path = walk(p, g, wish(1, 0), q => q.mode === 'cable')
    expect(p.mode).toBe('cable')
    // The ground walk took the mech to the edge; it is on the rope only there.
    const first = path.find(s => s.mode === 'cable')!
    expect(Math.abs(first.x - e.ax)).toBeLessThan(0.1)
    expect(path.filter(s => s.mode === 'ground').every(s => s.x < e.ax)).toBe(true)
  })

  it('steps off past the far end: no balancing on past the piton', () => {
    const g = wide()
    const e = cableEnds(g, g.cables[0]!)
    const p = makePlayer(cellMid(1), 6, cellMid(3))
    const path = walk(p, g, wish(1, 0), q => q.x > cellMid(18))
    // Never on the rope beyond either end of its line.
    for (const s of path.filter(q => q.mode === 'cable')) {
      expect(s.x).toBeGreaterThanOrEqual(e.ax - 0.05)
      expect(s.x).toBeLessThanOrEqual(e.bx + 0.05)
    }
    expect(p.mode).toBe('ground')
    expect(p.y).toBeCloseTo(4)
    // It walked on across the platform, on its feet.
    expect(path.filter(q => q.x > e.bx + 0.5).every(q => q.mode === 'ground')).toBe(true)
  })

  it('is taken back from the far end, at the far end', () => {
    const g = wide()
    const e = cableEnds(g, g.cables[0]!)
    const p = makePlayer(cellMid(18), 4, cellMid(3))
    const path = walk(p, g, wish(-1, 0), q => q.mode === 'cable')
    expect(p.mode).toBe('cable')
    expect(Math.abs(path[path.length - 1]!.x - e.bx)).toBeLessThan(0.1)
  })
})

describe('a rope from a platform down to the ground (#201)', () => {
  const yard = (): Grid => {
    const b = new FortressBuilder('t', 30, 8)
    b.ground(0, 0, 29, 7).insert(0, 0).extract(29, 7)
    b.fill(1, 2, 4, 5, 6)
    return b.build().grid
  }

  it('runs from the edge to the spot it was aimed at, a slope, not a drop and a walk across the ground', () => {
    const g = yard()
    // From the platform's east edge cell, aimed at the ground 10 m out.
    const shot = findRopeShot(g, cellMid(4), 6, cellMid(3), cellMid(10), 0, cellMid(3), 1)
    expect(shot).not.toBeNull()
    g.cables.push(shot!.cable)
    const s = cableSpan(g, shot!.cable)
    const e = cableEnds(g, shot!.cable)
    // Leaves at the edge (x 10), lands at the aimed cell's middle.
    expect(e.ax).toBeCloseTo(10, 0)
    expect(e.bx).toBeCloseTo(cellMid(10), 0)
    expect(s.tb).toBeCloseTo(1, 5)
    // So it slopes: no steeper than the drop over the run.
    expect(e.ay - e.by).toBeLessThan((e.bx - e.ax) * 1.2)

    // Walked down it: on the line, sloping all the way, and off where it lands.
    const p = makePlayer(cellMid(3), 6, cellMid(3))
    const path: Array<{ x: number; y: number; mode: string }> = []
    for (let i = 0; i < 10 / DT && p.x < cellMid(12); i++) {
      stepPlayer(p, g, wish(1, 0), DT)
      path.push({ x: p.x, y: p.y, mode: p.mode })
    }
    const on = path.filter(q => q.mode === 'cable')
    expect(on.length).toBeGreaterThan(10)
    // No flat stretch on the rope at ground level.
    expect(on.filter(q => q.y < 0.2).every(q => q.x > e.bx - 0.5)).toBe(true)
    for (const q of on) expect(q.x).toBeLessThanOrEqual(e.bx + 0.05)
    expect(p.mode).toBe('ground')
    expect(p.y).toBeCloseTo(0)
  })

})
