// The Sea Fort (the Bastion at threat II, the second fortress): a playtester on
// a tablet died there ten times and gave up. Two walkway guards and the south
// yard's drone are gone, and its mech has 15 % fewer hit points. A later
// playtest: two mechs at once left a player who fights in the open no chance —
// the second Enforcer is gone, and a robo dog walks the courtyard guard's round.

import { describe, expect, it } from 'vitest'
import { buildSeaFort, SEA_FORT_MECH_HP } from '@/game/data/fortresses/seaFort'
import { makeGarrison } from '@/game/sim/garrison'

const f = buildSeaFort(0)
const count = (kind: string): number => f.posts.filter(p => p.kind === kind && !p.reserve).length

describe('the Sea Fort is a softer second fortress', () => {
  it('three guards fewer (two on the walkway, the courtyard round now a robo dog), one drone', () => {
    expect(f.posts.filter(p => p.kind === 'guard' && !p.reserve && !p.role).length).toBe(3)
    expect(count('hound')).toBe(1)
    expect(count('drone')).toBe(1)
  })

  it('one mech, the Foreman, with 15 % fewer hit points', () => {
    const gar = makeGarrison(f, 2)
    const mechs = gar.units.filter(u => u.kind === 'enforcer')
    expect(mechs).toHaveLength(1)
    expect(mechs[0]!.boss).toBe('foreman')
    const full = makeGarrison({ ...f, posts: f.posts.map(p => ({ ...p, hpScale: undefined })) }, 2).units
    expect(mechs[0]!.maxHp).toBeLessThan(full[mechs[0]!.id]!.maxHp)
    expect(mechs[0]!.maxHp).toBeGreaterThanOrEqual(Math.round(full[mechs[0]!.id]!.maxHp * SEA_FORT_MECH_HP) - 1)
  })
})
