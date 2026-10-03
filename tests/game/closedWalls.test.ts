// #79: no holes in the walls. Wherever two neighbouring cells show different
// heights, the mesh has a vertical face on the edge between them covering the
// whole step (the top few centimetres are the chamfer's). Checked over every
// fortress and every threat level, and over every rotation of the Bastion's
// live piles and patrols.

import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { buildFortressMesh, shownHeight, BEVEL } from '@/game/world/fortressMesh'
import { CELL, VOID } from '@/game/world/grid'
import type { Fortress } from '@/game/world/fortress'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { buildProvingGround } from '@/game/data/fortresses/proving'

type Tri = [number, number, number, number, number, number]
/** Vertical, axis-aligned triangles, by the plane they lie in: 'x:12' or 'z:30'. */
const wallTris = (geoms: BufferGeometry[]): Map<string, Tri[]> => {
  const out = new Map<string, Tri[]>()
  for (const g of geoms) {
    const p = g.attributes.position!.array as Float32Array
    const idx = g.index!.array
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]! * 3
      const b = idx[i + 1]! * 3
      const c = idx[i + 2]! * 3
      let key = ''
      if (Math.abs(p[a]! - p[b]!) < 1e-4 && Math.abs(p[a]! - p[c]!) < 1e-4) key = 'x:' + Math.round(p[a]! * 100)
      else if (Math.abs(p[a + 2]! - p[b + 2]!) < 1e-4 && Math.abs(p[a + 2]! - p[c + 2]!) < 1e-4) key = 'z:' + Math.round(p[a + 2]! * 100)
      else continue
      const u = key[0] === 'x' ? 2 : 0
      const t: Tri = [p[a + u]!, p[a + 1]!, p[b + u]!, p[b + 1]!, p[c + u]!, p[c + 1]!]
      let list = out.get(key)
      if (!list) out.set(key, (list = []))
      list.push(t)
    }
  }
  return out
}

const inside = (t: Tri, u: number, y: number): boolean => {
  const [x1, y1, x2, y2, x3, y3] = t
  const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
  if (Math.abs(d) < 1e-9) return false
  const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (y - y3)) / d
  const l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (y - y3)) / d
  const l3 = 1 - l1 - l2
  return l1 >= -1e-5 && l2 >= -1e-5 && l3 >= -1e-5
}

const holesIn = async (f: Fortress): Promise<string[]> => {
  const g = f.grid
  const planes = wallTris((await buildFortressMesh(f)).chunks.map(c => c.geometry))
  const holes: string[] = []
  const check = (key: string, u0: number, lo: number, hi: number, where: string): void => {
    const tris = planes.get(key) ?? []
    for (const du of [0.25, 1, 1.75]) {
      for (let y = lo + 0.05; y < hi - BEVEL - 0.08; y += 0.25) {
        if (!tris.some(t => inside(t, u0 + du, y))) { holes.push(`${where} y=${y.toFixed(2)}`); return }
      }
    }
  }
  for (let cz = 0; cz < g.d; cz++) {
    for (let cx = 0; cx < g.w; cx++) {
      const h = shownHeight(g, cx, cz)
      if (h === VOID) continue
      const e = shownHeight(g, cx + 1, cz)
      if (e !== VOID && Math.abs(e - h) > 0.3) check('x:' + Math.round((cx + 1) * CELL * 100), cz * CELL, Math.min(h, e), Math.max(h, e), `${f.id} ${cx},${cz}|${cx + 1},${cz}`)
      const s = shownHeight(g, cx, cz + 1)
      if (s !== VOID && Math.abs(s - h) > 0.3) check('z:' + Math.round((cz + 1) * CELL * 100), cx * CELL, Math.min(h, s), Math.max(h, s), `${f.id} ${cx},${cz}|${cx},${cz + 1}`)
    }
  }
  return holes
}

describe('no holes in the walls (#79)', () => {
  const cases: Array<[string, () => Fortress]> = [
    ['training ground', buildTrainingGround],
    ['proving ground', buildProvingGround],
    ...[1, 2, 3, 4, 5].flatMap(l => [0, 1, 2, 3].map(run => [`Bastion ${l}, run ${run}`, () => buildBastion(l, run)] as [string, () => Fortress]))
  ]
  for (const [name, build] of cases) {
    it(name, async () => {
      expect(await holesIn(build())).toEqual([])
    })
  }
})
