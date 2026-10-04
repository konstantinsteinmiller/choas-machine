// R24 (#59): the Bastion rebuilt. Three rings that the perch cannot read
// (or shoot clean), an early high point that sees into the inner ward,
// thickets and shadow, and a raid that is not the same twice.

import { describe, expect, it } from 'vitest'
import { BASTION_PAD as P, buildBastion } from '@/game/data/fortresses/bastion'
import { CELL, Shade, cellHeight, cellMid, hasLineOfSight, heightAt, VOID } from '@/game/world/grid'
import { FortressBuilder } from '@/game/world/fortress'
import { drainEvents, makeGarrison, stepGarrison, type Target } from '@/game/sim/garrison'

const EYE = 2.2

/** Share of the cells in a rectangle (in the Bastion's old 60 × 64 frame) whose floor (1.4 m up) can be seen from a point. */
const seen = (f: ReturnType<typeof buildBastion>, ex: number, ey: number, ez: number, x0: number, z0: number, x1: number, z1: number, below = Infinity): number => {
  let n = 0
  let k = 0
  for (let cz = z0 + P; cz <= z1 + P; cz++) {
    for (let cx = x0 + P; cx <= x1 + P; cx++) {
      const h = cellHeight(f.grid, cx, cz)
      if (h === VOID || h >= below) continue
      n++
      if (hasLineOfSight(f.grid, ex, ey, ez, cellMid(cx), h + 1.4, cellMid(cz))) k++
    }
  }
  return k / Math.max(1, n)
}

describe('sight from the perch', () => {
  const f = buildBastion(1)
  const top = heightAt(f.grid, f.insert.x, f.insert.z)

  it("the inner ward is out of sight from the perch (the keep's roof stands above it)", () => {
    expect(seen(f, f.insert.x, top + EYE, f.insert.z, 19, 15, 42, 36, 5)).toBeLessThan(0.08)
  })

  it('so is most of the west lane, which runs straight north from it', () => {
    expect(seen(f, f.insert.x, top + EYE, f.insert.z, 7, 9, 17, 28)).toBeLessThan(0.6)
  })

  it('most of the outer yard is too', () => {
    expect(seen(f, f.insert.x, top + EYE, f.insert.z, 20, 38, 52, 54)).toBeLessThan(0.5)
  })

  it('the watchtower (hook only) is the early high point that sees into the inner ward', () => {
    const wx = cellMid(37 + P) + 1
    const wz = cellMid(47 + P) + 1
    const wt = heightAt(f.grid, wx, wz)
    expect(wt).toBeGreaterThan(8)
    expect(f.grid.ladders.some(l => Math.abs(l.cx - 37.5 - P) < 2 && Math.abs(l.cz - 47.5 - P) < 2)).toBe(false)
    expect(seen(f, wx, wt + EYE, wz, 19, 15, 42, 36)).toBeGreaterThan(0.2)
  })
})

describe('the rings', () => {
  const f = buildBastion(1)
  it('the battery is up, the inner ward is up, the keep is higher', () => {
    expect(cellHeight(f.grid, 12 + P, 48 + P)).toBe(4)
    expect(cellHeight(f.grid, 30 + P, 30 + P)).toBe(3)
    expect(cellHeight(f.grid, 29 + P, 21 + P)).toBe(8)
  })

  it('the cable from the perch lands on a railed ledge with a ladder down', () => {
    // From threat II the board lands on the perch itself (threat I lands on the platform beside it).
    const p = buildBastion(2)
    const c = f.grid.cables.find(k => Math.hypot(cellMid(k.ax) - p.insert.x, cellMid(k.az) - p.insert.z) < CELL * 2)
    expect(c).toBeDefined()
    expect(f.decor.some(d => d.kind === 'rail' && Math.hypot(d.x - cellMid(c!.bx), d.z - cellMid(c!.bz)) < CELL * 2)).toBe(true)
    expect(f.grid.ladders.some(l => Math.hypot(l.cx - c!.bx, l.cz - c!.bz) <= 1.5)).toBe(true)
  })

  it('the teaching guard on the battery has his back to the ledge', () => {
    const p = f.posts.find(q => q.kind === 'guard' && q.route.length === 0 && cellHeight(f.grid, Math.floor(q.x / CELL), Math.floor(q.z / CELL)) === 4)!
    expect(p).toBeDefined()
    // Facing east (+x), the ledge west of him.
    expect(Math.sin(p.facing)).toBeGreaterThan(0.9)
  })

  it('has thickets and pools of shadow', () => {
    let brush = 0
    let shadow = 0
    for (const v of f.grid.shade) { if (v & Shade.Brush) brush++; if (v & Shade.Shadow) shadow++ }
    expect(brush).toBeGreaterThan(8)
    expect(shadow).toBeGreaterThan(80)
  })
})

describe('a raid is not the same twice', () => {
  const piles = (level: number, run: number): string => buildBastion(level, run).salvage.map(p => `${p.x},${p.z}`).join(' ')
  it('the same run is the same raid (a retry), another run moves the piles', () => {
    expect(piles(1, 3)).toBe(piles(1, 3))
    const distinct = new Set(Array.from({ length: 8 }, (_, r) => piles(1, r)))
    expect(distinct.size).toBeGreaterThan(2)
  })

  it('there are always more piles than the raid needs, the teaching pile and the keep\'s among them', () => {
    for (let level = 1; level <= 5; level++) {
      for (let run = 0; run < 6; run++) {
        const f = buildBastion(level, run)
        expect(f.salvage.length).toBeGreaterThan(Math.min(9, 2 + level) - 1)
        expect(f.salvage.some(p => p.big)).toBe(true)
        expect(f.salvage.some(p => Math.floor(p.x / CELL) === 11 + P && Math.floor(p.z / CELL) === 53 + P)).toBe(true)
      }
    }
  })
})

describe('thickets', () => {
  const yard = (): ReturnType<FortressBuilder['build']> => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
    b.guard([[10, 4]], 0)
    b.thicket(10, 9, 'net', 1)
    return b.build()
  }
  const watch = (brush: boolean, cz: number): number => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const t: Target = { x: cellMid(10), y: 0, z: cellMid(cz), height: 1.8, crouched: true, visible: true, brush }
    for (let k = 0; k < 120; k++) { stepGarrison(gar, f.grid, t, 1 / 30); drainEvents(gar) }
    return gar.units[0]!.detect
  }
  it('crouched in a thicket the mech is not seen at ten metres; it is right up close', () => {
    expect(watch(false, 9)).toBeGreaterThan(0)
    expect(watch(true, 9)).toBe(0)
    expect(watch(true, 5)).toBeGreaterThan(0)
  })
})
