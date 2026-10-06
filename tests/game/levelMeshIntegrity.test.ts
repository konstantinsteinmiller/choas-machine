// The level mesh is closed (#79, and the Sea Fort's open towers): every level
// and every cinema stage, at every threat level and over every rotation of the
// live piles and patrols, is checked for
//  - a top on every cell,
//  - a vertical face on every edge between two cells that show different
//    heights, covering the whole step (the top few centimetres are the
//    chamfer's),
//  - on the island's edge, a face from the cell's top all the way down the lip
//    (a tower standing on the edge included), with the rock skirt under it,
//  - and a material drawn from both sides, so a face seen from behind is
//    never a hole either.

import { describe, expect, it } from 'vitest'
import { DoubleSide, Texture, type BufferGeometry, type Material, type Mesh } from 'three'
import { buildFortressMesh, lipBottom, shownHeight, BEVEL, type FortressMesh } from '@/game/world/fortressMesh'
import { CELL, VOID, type Grid } from '@/game/world/grid'
import type { Fortress } from '@/game/world/fortress'
import { buildBastion, BASTION_LEVELS } from '@/game/data/fortresses/bastion'
import { buildFoundry, FOUNDRY_LEVELS } from '@/game/data/fortresses/foundry'
import { buildHarbour, HARBOUR_LEVELS } from '@/game/data/fortresses/harbour'
import { buildSpire, SPIRE_LEVELS } from '@/game/data/fortresses/spire'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { buildProvingGround } from '@/game/data/fortresses/proving'
import { Cinema } from '@/game/story/cinema'
import { CINEMA_IDS } from '@/game/story/cinemaIds'

type Tri = [number, number, number, number, number, number]
type Tri3 = [number, number, number, number, number, number, number, number, number]

interface Index {
  /** Vertical, axis-aligned triangles by the plane they lie in and the cell along it ('x:1200|7'), in (along, y). */
  walls: Map<string, Tri[]>
  /** Level triangles by height and cell column ('y:400|7'), in (x, z). */
  tops: Map<string, Tri[]>
  /** Every triangle, in world space. */
  all: Tri3[]
}

const key = (v: number): string => String(Math.round(v * 100))

const index = (geoms: BufferGeometry[]): Index => {
  const walls = new Map<string, Tri[]>()
  const tops = new Map<string, Tri[]>()
  const all: Tri3[] = []
  /** Filed under every cell its first coordinate spans, so a lookup reads a handful. */
  const push = (m: Map<string, Tri[]>, k: string, t: Tri): void => {
    const lo = Math.floor((Math.min(t[0], t[2], t[4]) - 1e-3) / CELL)
    const hi = Math.floor((Math.max(t[0], t[2], t[4]) + 1e-3) / CELL)
    for (let c = lo; c <= hi; c++) {
      let list = m.get(k + '|' + c)
      if (!list) m.set(k + '|' + c, (list = []))
      list.push(t)
    }
  }
  for (const g of geoms) {
    const p = g.attributes.position!.array as Float32Array
    const idx = g.index!.array
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]! * 3
      const b = idx[i + 1]! * 3
      const c = idx[i + 2]! * 3
      all.push([p[a]!, p[a + 1]!, p[a + 2]!, p[b]!, p[b + 1]!, p[b + 2]!, p[c]!, p[c + 1]!, p[c + 2]!])
      const same = (o: number): boolean => Math.abs(p[a + o]! - p[b + o]!) < 1e-4 && Math.abs(p[a + o]! - p[c + o]!) < 1e-4
      if (same(1)) push(tops, 'y:' + key(p[a + 1]!), [p[a]!, p[a + 2]!, p[b]!, p[b + 2]!, p[c]!, p[c + 2]!])
      else if (same(0)) push(walls, 'x:' + key(p[a]!), [p[a + 2]!, p[a + 1]!, p[b + 2]!, p[b + 1]!, p[c + 2]!, p[c + 1]!])
      else if (same(2)) push(walls, 'z:' + key(p[a + 2]!), [p[a]!, p[a + 1]!, p[b]!, p[b + 1]!, p[c]!, p[c + 1]!])
    }
  }
  return { walls, tops, all }
}

const inside = (t: Tri, u: number, v: number): boolean => {
  const [x1, y1, x2, y2, x3, y3] = t
  const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
  if (Math.abs(d) < 1e-9) return false
  const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (v - y3)) / d
  const l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (v - y3)) / d
  const l3 = 1 - l1 - l2
  return l1 >= -1e-5 && l2 >= -1e-5 && l3 >= -1e-5
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 2e-3

/** Everything wrong with one level's mesh, as readable lines. */
const problemsIn = (name: string, g: Grid, mesh: FortressMesh): string[] => {
  const ix = index(mesh.chunks.map(c => c.geometry))
  const out: string[] = []
  const lip = lipBottom(g)

  for (const m of mesh.chunks) {
    const mat = (m as Mesh).material as Material
    if (mat.side !== DoubleSide) { out.push(`${name}: ${m.name} is drawn from one side only`); break }
  }

  /** A face over the step on the edge `plane` from u0 to u0 + CELL, between heights lo and hi. */
  const face = (plane: string, u0: number, lo: number, hi: number, where: string): void => {
    const tris = ix.walls.get(plane + '|' + Math.round(u0 / CELL)) ?? []
    for (const du of [0.25, 1, 1.75]) {
      for (let y = lo + 0.05; y < hi - BEVEL - 0.08; y += 0.25) {
        if (!tris.some(t => inside(t, u0 + du, y))) { out.push(`${name} ${where}: no face at y=${y.toFixed(2)}`); return }
      }
    }
  }
  // Triangles that hang down from the lip's foot, by the corners they have there.
  const hanging = new Map<string, Set<Tri3>>()
  for (const t of ix.all) {
    if (Math.min(t[1], t[4], t[7]) >= lip - 1) continue
    for (const o of [0, 3, 6]) {
      if (!near(t[o + 1]!, lip)) continue
      const k = key(t[o]!) + ',' + key(t[o + 2]!)
      let set = hanging.get(k)
      if (!set) hanging.set(k, (set = new Set()))
      set.add(t)
    }
  }
  /** The skirt hanging from the lip's foot along the edge (ax, az) – (bx, bz). */
  const skirt = (ax: number, az: number, bx: number, bz: number, where: string): void => {
    const a = hanging.get(key(ax) + ',' + key(az))
    const b = hanging.get(key(bx) + ',' + key(bz))
    if (!a || !b || ![...a].some(t => b.has(t))) out.push(`${name} ${where}: no skirt under the lip`)
  }

  for (let cz = 0; cz < g.d; cz++) {
    for (let cx = 0; cx < g.w; cx++) {
      const h = shownHeight(g, cx, cz)
      if (h === VOID) continue
      const tops = ix.tops.get('y:' + key(h) + '|' + cx) ?? []
      const mx = (cx + 0.5) * CELL
      const mz = (cz + 0.5) * CELL
      if (!tops.some(t => inside(t, mx, mz))) out.push(`${name} ${cx},${cz}: no top at y=${h}`)

      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = shownHeight(g, cx + dx, cz + dz)
        const where = `${cx},${cz}|${cx + dx},${cz + dz}`
        const plane = dx !== 0 ? 'x:' + key((cx + (dx > 0 ? 1 : 0)) * CELL) : 'z:' + key((cz + (dz > 0 ? 1 : 0)) * CELL)
        const u0 = dx !== 0 ? cz * CELL : cx * CELL
        if (n === VOID) {
          face(plane, u0, lip, h, `${where} (edge)`)
          const ex = (cx + (dx > 0 ? 1 : 0)) * CELL
          const ez = (cz + (dz > 0 ? 1 : 0)) * CELL
          if (dx !== 0) skirt(ex, cz * CELL, ex, (cz + 1) * CELL, where)
          else skirt(cx * CELL, ez, (cx + 1) * CELL, ez, where)
        } else if (dx + dz > 0 && Math.abs(n - h) > 0.3) {
          face(plane, u0, Math.min(h, n), Math.max(h, n), where)
        }
      }
      if (out.length > 12) return out
    }
  }
  return out
}

const fortressCase = (build: () => Fortress) => async (): Promise<string[]> => {
  const f = build()
  const mesh = await buildFortressMesh(f)
  try {
    return problemsIn(f.id, f.grid, mesh)
  } finally {
    mesh.dispose()
  }
}

describe('every level mesh is closed', () => {
  const runs = [0, 1, 2, 3]
  const cases: Array<[string, () => Promise<string[]>]> = [
    ['training ground', fortressCase(buildTrainingGround)],
    ['proving ground', fortressCase(buildProvingGround)],
    ...Array.from({ length: BASTION_LEVELS }, (_, i) => i + 1).flatMap(l => runs.map(r => [`Bastion ${l}, run ${r}`, fortressCase(() => buildBastion(l, r))] as [string, () => Promise<string[]>])),
    ...Array.from({ length: FOUNDRY_LEVELS }, (_, i) => i + 1).flatMap(l => runs.map(r => [`Foundry ${l}, run ${r}`, fortressCase(() => buildFoundry(l, r))] as [string, () => Promise<string[]>])),
    ...Array.from({ length: HARBOUR_LEVELS }, (_, i) => i + 1).flatMap(l => runs.map(r => [`Harbour ${l}, run ${r}`, fortressCase(() => buildHarbour(l, r))] as [string, () => Promise<string[]>])),
    ...Array.from({ length: SPIRE_LEVELS }, (_, i) => i + 1).flatMap(l => runs.map(r => [`Spire ${l}, run ${r}`, fortressCase(() => buildSpire(l, r))] as [string, () => Promise<string[]>]))
  ]
  for (const [name, check] of cases) {
    it(name, async () => {
      expect(await check()).toEqual([])
    })
  }

  for (const id of CINEMA_IDS) {
    it(`the ${id} cinema's stage`, async () => {
      const c = await Cinema.create(id, undefined, new Texture())
      const { grid, mesh } = c as unknown as { grid: Grid; mesh: FortressMesh }
      try {
        expect(problemsIn(`cinema-${id}`, grid, mesh)).toEqual([])
      } finally {
        c.dispose()
      }
    })
  }

  it('the check finds a hole: a tower on the edge drawn only down the old lip fails it', async () => {
    const f = buildBastion(2)
    const mesh = await buildFortressMesh(f)
    // Cut every triangle of the edge towers' outer faces below 6 m away.
    for (const m of mesh.chunks) {
      const p = m.geometry.attributes.position!.array as Float32Array
      const idx = m.geometry.index!.array as Uint32Array | Uint16Array
      for (let i = 0; i < idx.length; i += 3) {
        const ys = [idx[i]!, idx[i + 1]!, idx[i + 2]!].map(v => p[v * 3 + 1]!)
        if (Math.max(...ys) < 6 && Math.min(...ys) > 0.1) idx[i] = idx[i + 1] = idx[i + 2] = 0
      }
    }
    expect(problemsIn('cut', f.grid, mesh).some(l => l.includes('(edge)'))).toBe(true)
    mesh.dispose()
  })
})
