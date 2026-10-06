// Round 5 (#149): the fly-over's findings, kept fixed. Every fortress the
// registry knows, at every threat level: each prop stands on the floor of its
// cell (a solid prop's cell is raised to its top on purpose, and is left out),
// each cable is tied to the island at both ends, and every cell's floor has a
// pool under it. The island's closed underside is pinned in `fortressMesh.test.ts`
// and the closed level mesh in `levelMeshIntegrity.test.ts`.

import { describe, expect, it } from 'vitest'
import { FORTRESS_IDS, loadFortress } from '@/game/data/fortresses/registry'
import { THREAT_LEVELS } from '@/game/sim/rewards'
import { Surf, VOID, cellSurf, heightAt, toCell } from '@/game/world/grid'

describe('the maps hold together (#149)', () => {
  for (const id of FORTRESS_IDS) {
    for (let level = 1; level <= THREAT_LEVELS; level++) {
      it(`${id} at threat ${level}: props on their floors, cables tied at both ends`, async () => {
        const f = await loadFortress(id, level, 0)
        const g = f.grid
        const off: string[] = []
        for (const d of f.decor) {
          if (cellSurf(g, toCell(d.x), toCell(d.z)) === Surf.Heap) continue
          const h = heightAt(g, d.x, d.z)
          if (h === VOID || Math.abs(d.y - h) > 0.05) off.push(`${d.kind} at ${d.x},${d.z}: ${d.y} on a floor at ${h}`)
        }
        for (const c of g.cables) {
          if (g.h[c.az * g.w + c.ax] === VOID || g.h[c.bz * g.w + c.bx] === VOID) off.push(`a cable ${c.ax},${c.az} → ${c.bx},${c.bz} off the island`)
        }
        expect(off).toEqual([])
      })
    }
  }
})
