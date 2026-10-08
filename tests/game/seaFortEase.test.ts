// The Sea Fort (the Bastion at threat II, the second fortress): a playtester on
// a tablet died there ten times and gave up. Two walkway guards and the south
// yard's drone are gone, its mechs have 15 % fewer hit points, and the second
// mech stands in the corner farthest from the first, so the two take time to
// meet.

import { describe, expect, it } from 'vitest'
import { buildSeaFort, SEA_FORT_MECH_HP, SECOND_MECH } from '@/game/data/fortresses/seaFort'
import { makeGarrison } from '@/game/sim/garrison'
import { WALK, findPath, heightAt, toCell } from '@/game/world/grid'

const f = buildSeaFort(0)
const count = (kind: string): number => f.posts.filter(p => p.kind === kind && !p.reserve).length

describe('the Sea Fort is a softer second fortress', () => {
  it('two guards fewer (one on the walkway), one drone', () => {
    expect(f.posts.filter(p => p.kind === 'guard' && !p.reserve && !p.role).length).toBe(4)
    expect(count('drone')).toBe(1)
  })

  it('its mechs have 15 % fewer hit points, the Foreman too', () => {
    const gar = makeGarrison(f, 2)
    const mechs = gar.units.filter(u => u.kind === 'enforcer')
    expect(mechs).toHaveLength(2)
    const plain = mechs.find(u => !u.boss)!
    const foreman = mechs.find(u => u.boss === 'foreman')!
    const full = makeGarrison({ ...f, posts: f.posts.map(p => ({ ...p, hpScale: undefined })) }, 2).units
    expect(plain.maxHp).toBe(Math.round(full[plain.id]!.maxHp * SEA_FORT_MECH_HP))
    expect(foreman.maxHp).toBeLessThan(full[foreman.id]!.maxHp)
  })

  it('the second mech is across the fort: a long walk to the Foreman (it was 25 cells), and it still gets there', () => {
    const foreman = f.posts.find(p => p.kind === 'enforcer' && p.boss === 'foreman')!
    const second = f.posts.find(p => p.kind === 'enforcer' && !p.boss)!
    expect([toCell(second.x), toCell(second.z)]).toEqual([...SECOND_MECH])
    expect(heightAt(f.grid, second.x, second.z)).toBe(0)
    const walk = findPath(f.grid, SECOND_MECH[0], SECOND_MECH[1], toCell(foreman.x), toCell(foreman.z), WALK)
    expect(walk.length).toBeGreaterThanOrEqual(40)
  })
})
