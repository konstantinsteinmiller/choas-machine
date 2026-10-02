// Round 2, R5: the grappling hook, and the noise it makes.

import { describe, expect, it } from 'vitest'
import {
  FLY_S, GRAPPLE_EARSHOT, GRAPPLE_MAX, OVER_S, TAUT_S, cancelGrapple, canCancel, findGrapple, hookAt, startGrapple, stepGrapple,
  type GrappleEvent, type GrappleRun
} from '@/game/sim/grapple'
import { makePlayer, MANTLE_MAX, type Player } from '@/game/sim/player'
import { CELL, CellKind, makeGrid, cellMid, heightAt, type Grid } from '@/game/world/grid'
import { MECH_RADIUS } from '@/game/models/mech'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison, stepGarrison, drainEvents, wonderAt, voidNoise, WONDER_S, type Garrison, type Target } from '@/game/sim/garrison'

const DT = 1 / 60
const yard = (wallH: number): Grid => {
  const g = makeGrid(20, 20)
  g.h.fill(0)
  g.kind.fill(CellKind.Ground)
  // A wall across the yard at cz = 10, four cells thick so there is a top to stand on.
  for (let cz = 10; cz < 14; cz++) for (let cx = 0; cx < 20; cx++) { g.h[cz * 20 + cx] = wallH; g.kind[cz * 20 + cx] = CellKind.Block }
  return g
}
const run = (r: GrappleRun, p: Player, seconds: number): GrappleEvent[] => {
  const out: GrappleEvent[] = []
  for (let i = 0; i < Math.round(seconds / DT) && r.phase !== 'done'; i++) out.push(...stepGrapple(r, p, DT))
  return out
}

describe('where the hook can go', () => {
  it('a wall straight ahead, too high to pull up onto: the hook takes it', () => {
    const g = yard(4)
    const spot = findGrapple(g, cellMid(5), 0, cellMid(9), 0)!
    expect(spot).toBeTruthy()
    expect(spot.rise).toBe(4)
    // The foot is at the wall's face, the top a body's width inside the edge.
    expect(spot.edge.z).toBeCloseTo(10 * CELL, 6)
    expect(spot.foot.z).toBeCloseTo(10 * CELL - MECH_RADIUS - 0.12, 6)
    expect(spot.top.z).toBeGreaterThan(10 * CELL + MECH_RADIUS)
    expect(heightAt(g, spot.top.x, spot.top.z)).toBe(4)
    expect(heightAt(g, spot.foot.x, spot.foot.z)).toBe(0)
    // Facing the wall.
    expect(Math.cos(spot.yaw)).toBeCloseTo(1, 6)
  })

  it('not from too far away, not when looking along the wall, not with nothing ahead', () => {
    const g = yard(4)
    expect(findGrapple(g, cellMid(5), 0, cellMid(5), 0)).toBeNull()
    expect(findGrapple(g, cellMid(5), 0, cellMid(9), Math.PI / 2)).toBeNull()
    expect(findGrapple(g, cellMid(5), 0, cellMid(9), Math.PI)).toBeNull()
  })

  it('a low block is the mantle\'s, a tower past the line\'s length is nobody\'s', () => {
    expect(findGrapple(yard(MANTLE_MAX), cellMid(5), 0, cellMid(9), 0)).toBeNull()
    expect(findGrapple(yard(MANTLE_MAX + 0.4), cellMid(5), 0, cellMid(9), 0)).toBeTruthy()
    expect(findGrapple(yard(GRAPPLE_MAX), cellMid(5), 0, cellMid(9), 0)).toBeTruthy()
    expect(findGrapple(yard(GRAPPLE_MAX + 0.5), cellMid(5), 0, cellMid(9), 0)).toBeNull()
  })

  it('works on all four faces of a block', () => {
    const g = makeGrid(20, 20)
    g.h.fill(0)
    for (let cz = 8; cz < 12; cz++) for (let cx = 8; cx < 12; cx++) { g.h[cz * 20 + cx] = 5; g.kind[cz * 20 + cx] = CellKind.Block }
    const cases: Array<[number, number, number]> = [
      [cellMid(10), cellMid(7), 0], [cellMid(10), cellMid(12), Math.PI], [cellMid(7), cellMid(10), Math.PI / 2], [cellMid(12), cellMid(10), -Math.PI / 2]
    ]
    for (const [x, z, yaw] of cases) {
      const s = findGrapple(g, x, 0, z, yaw)!
      expect(s, `from ${x},${z}`).toBeTruthy()
      expect(heightAt(g, s.top.x, s.top.z)).toBe(5)
      expect(heightAt(g, s.foot.x, s.foot.z)).toBe(0)
    }
  })
})

describe('the climb', () => {
  const setup = () => {
    const g = yard(4)
    const p = makePlayer(cellMid(5), 0, cellMid(9) - 0.3, 0)
    const spot = findGrapple(g, p.x, p.y, p.z, 0)!
    return { g, p, r: startGrapple(p, spot), spot }
  }

  it('the hook flies, bites, the line goes taut, the mech goes up and over, and stands on top', () => {
    const { g, p, r, spot } = setup()
    const first = run(r, p, FLY_S + 0.02)
    expect(first.map(e => e.type)).toEqual(['bite'])
    expect(r.phase).toBe('climb')
    // Taut: on the ground still.
    run(r, p, TAUT_S * 0.8)
    expect(p.y).toBeLessThan(0.3)
    const rest = run(r, p, 5)
    expect(rest.map(e => e.type)).toEqual(['top'])
    expect(r.phase).toBe('done')
    expect(p.mode).toBe('ground')
    expect(p.y).toBe(4)
    expect(heightAt(g, p.x, p.z)).toBe(4)
    expect(Math.hypot(p.x - spot.top.x, p.z - spot.top.z)).toBeLessThan(1e-6)
  })

  it('goes up without ever going down, and never through the wall', () => {
    const { g, p, r } = setup()
    let last = -1
    for (let i = 0; i < 400 && r.phase !== 'done'; i++) {
      stepGrapple(r, p, DT)
      if (r.phase === 'climb') expect(p.y).toBeGreaterThanOrEqual(last - 1e-6)
      last = p.y
      // Below the top it is on the foot side of the wall.
      if (p.y < 3.5) expect(heightAt(g, p.x, p.z)).toBe(0)
    }
    expect(r.phase).toBe('done')
  })

  it('takes longer for a higher wall, within limits', () => {
    const time = (h: number): number => {
      const g = yard(h)
      const p = makePlayer(cellMid(5), 0, cellMid(9), 0)
      const r = startGrapple(p, findGrapple(g, p.x, p.y, p.z, 0)!)
      let t = 0
      while (r.phase !== 'done' && t < 10) { stepGrapple(r, p, DT); t += DT }
      return t
    }
    expect(time(8)).toBeGreaterThan(time(4) + 0.3)
    expect(time(9)).toBeLessThan(FLY_S + TAUT_S + 1.7 + OVER_S + 0.1)
  })

  it('the hook is on the wall face while it flies and at the edge once it has caught', () => {
    const { p, r, spot } = setup()
    const at = { x: 0, y: 0, z: 0 }
    stepGrapple(r, p, FLY_S * 0.5)
    expect(hookAt(r, at).y).toBeGreaterThan(1.9)
    expect(at.y).toBeLessThan(spot.edge.y)
    run(r, p, FLY_S)
    expect(hookAt(r, at)).toEqual(spot.edge)
  })

  it('recalled on the way up: the mech drops back to the foot of the wall', () => {
    const { p, r, spot } = setup()
    run(r, p, FLY_S + TAUT_S + 0.4)
    expect(p.y).toBeGreaterThan(1)
    expect(canCancel(r)).toBe(true)
    expect(cancelGrapple(r)).toBe(true)
    const e = run(r, p, 3)
    expect(e.map(x => x.type)).toEqual(['landed'])
    expect(p.y).toBe(0)
    expect(p.mode).toBe('ground')
    expect(Math.hypot(p.x - spot.foot.x, p.z - spot.foot.z)).toBeLessThan(0.05)
    expect(r.cancelled).toBe(true)
  })

  it('cannot be recalled once the mech is going over the edge', () => {
    const { p, r } = setup()
    while (r.phase !== 'over') stepGrapple(r, p, DT)
    expect(canCancel(r)).toBe(false)
    expect(cancelGrapple(r)).toBe(false)
    run(r, p, 2)
    expect(p.y).toBe(4)
  })
})

describe('the bite is heard', () => {
  const base = (): { f: ReturnType<FortressBuilder['build']>; gar: Garrison } => {
    const b = new FortressBuilder('t', 40, 40)
    b.ground(0, 0, 39, 39)
    b.insert(2, 2, 0)
    b.extract(37, 37)
    b.sentry(10, 10, 0)
    b.sentry(30, 30, 0)
    const f = b.build()
    return { f, gar: makeGarrison(f) }
  }
  const away: Target = { x: cellMid(2), y: 0, z: cellMid(2), feetY: 0, height: 2.5, crouched: false, visible: false } as Target
  const step = (gar: Garrison, f: { grid: Grid }, seconds: number) => {
    const out = []
    for (let i = 0; i < Math.round(seconds / DT); i++) { stepGarrison(gar, f.grid, away, DT); out.push(...drainEvents(gar)) }
    return out
  }

  it('whoever is in earshot stands and wonders for two seconds, then goes to look', () => {
    const { f, gar } = base()
    const near = gar.units[0]!
    const at = { x: near.x + 6, z: near.z }
    const { token, heard } = wonderAt(gar, at.x, at.z, GRAPPLE_EARSHOT)
    expect(heard).toBe(1)
    expect(token).toBeGreaterThan(0)
    expect(near.state).toBe('suspicious')
    expect(gar.units[1]!.state).toBe('patrol')
    const x0 = near.x
    const z0 = near.z
    step(gar, f, WONDER_S - 0.1)
    // Still on the spot: wondering, not walking.
    expect(Math.hypot(near.x - x0, near.z - z0)).toBeLessThan(0.01)
    expect(near.state).toBe('suspicious')
    step(gar, f, 2)
    // Now it has set off toward where the sound came from.
    expect(Math.hypot(near.x - x0, near.z - z0)).toBeGreaterThan(1)
    expect(Math.hypot(near.x - at.x, near.z - at.z)).toBeLessThan(5.5)
    expect(gar.alert.level).toBe(0)
  })

  it('it looks about while it wonders: the head does not sit still', () => {
    const { f, gar } = base()
    const near = gar.units[0]!
    wonderAt(gar, near.x + 6, near.z, GRAPPLE_EARSHOT)
    const looks = []
    for (let i = 0; i < 60; i++) { stepGarrison(gar, f.grid, away, DT); looks.push(near.look) }
    expect(Math.max(...looks) - Math.min(...looks)).toBeGreaterThan(0.6)
  })

  it('the hook recalled inside the two seconds: they shrug it off and nobody comes', () => {
    const { f, gar } = base()
    const near = gar.units[0]!
    const x0 = near.x
    const z0 = near.z
    const { token } = wonderAt(gar, near.x + 6, near.z, GRAPPLE_EARSHOT)
    step(gar, f, 1.2)
    expect(voidNoise(gar, token)).toBe(1)
    expect(near.state).toBe('patrol')
    const events = step(gar, f, 6)
    expect(Math.hypot(near.x - x0, near.z - z0)).toBeLessThan(0.5)
    expect(events.filter(e => e.type === 'suspicious')).toHaveLength(0)
    expect(gar.alert.level).toBe(0)
  })

  it('recalled too late: they are already on their way', () => {
    const { f, gar } = base()
    const near = gar.units[0]!
    const { token } = wonderAt(gar, near.x + 6, near.z, GRAPPLE_EARSHOT)
    step(gar, f, WONDER_S + 0.3)
    expect(voidNoise(gar, token)).toBe(0)
    expect(near.state).toBe('suspicious')
  })

  it('nobody near: no token is wasted on anyone, and nothing changes', () => {
    const { gar } = base()
    const { heard } = wonderAt(gar, cellMid(20), cellMid(2), 3)
    expect(heard).toBe(0)
    expect(gar.units.every(u => u.state === 'patrol')).toBe(true)
  })
})
