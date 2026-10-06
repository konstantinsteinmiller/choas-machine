// Round 5 (#144): the Spire, the fourth fortress: five terraces one in the
// other, the way out on top, the Watchtower over the rings, the Airship from
// threat II. Reachability, closed meshes and drones are in the shared suites
// (`validate`, `levelMeshIntegrity`, `noFlyThrough`); here, what is its own.

import { describe, expect, it } from 'vitest'
import { FORTRESSES, loadFortress } from '@/game/data/fortresses/registry'
import { SPIRE_LEVELS, SPIRE_TOP, TERRACES, buildSpire } from '@/game/data/fortresses/spire'
import { cinemaAfterClear } from '@/game/story/cinemaIds'
import { validateFortress } from '@/game/world/validate'
import { cellMid, heightAt } from '@/game/world/grid'
import {
  SPECS, WATCH_PACE, WATCH_RADIUS, damageUnit, makeGarrison, spotCentre, stepGarrison, type Target
} from '@/game/sim/garrison'
import { blast } from '@/game/sim/damage'

describe('the Spire (#144)', () => {
  it('is the fourth fortress, open after the Harbour at threat III, and pays the most', async () => {
    const meta = FORTRESSES.find(f => f.id === 'spire')!
    expect(FORTRESSES.indexOf(meta)).toBe(3)
    expect(meta.unlock).toEqual({ after: 'harbour', threat: 3 })
    expect(meta.pay).toBeGreaterThan(Math.max(...FORTRESSES.filter(f => f.id !== 'spire').map(f => f.pay)))
    expect((await loadFortress('spire', 1, 0)).id).toBe('spire')
  })

  it('climbs: five terraces four metres apart, the way out on the top one', () => {
    const f = buildSpire(1)
    TERRACES.forEach(([a, , h], i) => {
      expect(heightAt(f.grid, cellMid(a + 1), cellMid(a + 1))).toBe(h)
      expect(h).toBe(4 * (i + 1))
    })
    expect(heightAt(f.grid, f.extract.x, f.extract.z)).toBe(SPIRE_TOP)
    expect(heightAt(f.grid, f.insert.x, f.insert.z)).toBeLessThan(SPIRE_TOP)
  })

  it('every threat level and run lays out whole', () => {
    for (let l = 1; l <= SPIRE_LEVELS; l++) for (let r = 0; r < 3; r++) expect(validateFortress(buildSpire(l, r)), `${l}/${r}`).toEqual([])
  })

  it('the Airship comes from threat II; a second Watchtower on III; the outro after its first threat III', () => {
    expect(buildSpire(1).airship).toBeFalsy()
    expect(buildSpire(2).airship).toBe(true)
    expect(buildSpire(3).airship).toBe(true)
    const towers = (l: number): number => buildSpire(l).posts.filter(p => p.watch).length
    expect([towers(1), towers(2), towers(3)]).toEqual([1, 1, 2])
    expect(cinemaAfterClear('spire', 3, true)).toBe('outro')
    expect(cinemaAfterClear('harbour', 3, true)).toBeNull()
  })
})

describe('the Watchtower (#144)', () => {
  const setUp = (): { f: ReturnType<typeof buildSpire>; gar: ReturnType<typeof makeGarrison>; u: ReturnType<typeof makeGarrison>['units'][number] } => {
    const f = buildSpire(1)
    const gar = makeGarrison(f, 1)
    const u = gar.units.find(q => q.watch)!
    return { f, gar, u }
  }

  it('cannot be destroyed: rounds glance off it and a blast does nothing', () => {
    const { f, gar, u } = setUp()
    expect(u.armoured).toBe(true)
    expect(damageUnit(gar, u.id, 1e6, u.x, u.z)).toBe(false)
    blast(gar, f.grid, u.x, u.y, u.z, u.id, 6, 10)
    expect(u.state).not.toBe('dead')
  })

  it('throws a wider pool, and sweeps it slowly', () => {
    const { f, gar, u } = setUp()
    expect(WATCH_RADIUS).toBeGreaterThan(4.5)
    const c0 = { ...spotCentre(u) }
    const away: Target = { x: 1, y: 0, z: 1, height: 2.6, crouched: true, visible: false }
    stepGarrison(gar, f.grid, away, 1)
    const c1 = spotCentre(u)
    expect(Math.hypot(c1.x - c0.x, c1.z - c0.z)).toBeLessThanOrEqual(SPECS.searchlight.walk * WATCH_PACE + 1e-6)
  })

  it('rings the alarm the moment it finds the mech in the open: no uplink', () => {
    const { f, gar, u } = setUp()
    // Its first stop, on the first ring's outer half.
    const c = spotCentre(u)
    expect(heightAt(f.grid, c.x, c.z)).toBe(4)
    const floor = heightAt(f.grid, c.x, c.z)
    const mech: Target = { x: c.x, y: floor, z: c.z, height: 2.6, crouched: false, visible: true }
    let t = 0
    while (!gar.alert.chaos && t < 3) {
      // Hold its beam on the mech's spot (its sweep would carry it off).
      u.spotX = mech.x
      u.spotZ = mech.z
      stepGarrison(gar, f.grid, mech, 1 / 30)
      t += 1 / 30
    }
    expect(gar.alert.chaos).toBe(true)
    expect(t).toBeLessThan(1.2)
  })
})
