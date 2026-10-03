// Round 2, R7: salvage is what a raid is for.

import { describe, expect, it } from 'vitest'
import { makePiles, salvageNeed, pileInReach, nearestPile, pilesTaken, SALVAGE_REACH } from '@/game/sim/salvage'
import { buildBastion, BASTION_LEVELS } from '@/game/data/fortresses/bastion'
import { payout, defeatScrap, baseScrap, BOSS_SCRAP, type MissionResult } from '@/game/sim/rewards'
import { MEDAL_IDS } from '@/game/data/ids'

const run = (extra: Partial<MissionResult> = {}): MissionResult => ({
  time: 400, shots: 0, hits: 0, headshots: 0, kills: 0, bladeKills: 0, spotted: 1, bodiesFound: 0, loud: true, ...extra
})
const fresh = { clears: 0, medals: Object.fromEntries(MEDAL_IDS.map(m => [m, false])) as Record<(typeof MEDAL_IDS)[number], boolean> }
const held = { clears: 3, medals: fresh.medals }

describe('the piles', () => {
  const piles = makePiles([
    { x: 10, y: 0, z: 10, amount: 40, big: false },
    { x: 20, y: 0, z: 10, amount: 40, big: false },
    { x: 10, y: 5, z: 11, amount: 90, big: true }
  ])

  it('one is in reach only close by, on the level the mech stands on', () => {
    expect(pileInReach(piles, 10.5, 0, 10)?.id).toBe(0)
    expect(pileInReach(piles, 10 + SALVAGE_REACH + 0.1, 0, 10)).toBeNull()
    // Under the big one, but five metres below it.
    expect(pileInReach(piles, 10, 0, 11.2)?.id).toBe(0)
    expect(pileInReach(piles, 10, 5, 11)?.id).toBe(2)
  })

  it('a stripped pile is no longer offered, and the waypoint moves on', () => {
    const ps = makePiles(piles)
    expect(nearestPile(ps, 12, 10)?.id).toBe(0)
    ps[0]!.taken = true
    expect(pileInReach(ps, 10.5, 0, 10)).toBeNull()
    expect(nearestPile(ps, 12, 10)?.id).toBe(2)
    expect(pilesTaken(ps)).toBe(1)
  })

  it('a raid needs three at level I and one more per level, never more than there are', () => {
    expect(salvageNeed(1, 8)).toBe(3)
    expect(salvageNeed(3, 8)).toBe(5)
    expect(salvageNeed(5, 8)).toBe(7)
    expect(salvageNeed(5, 4)).toBe(4)
  })

  it.each(Array.from({ length: BASTION_LEVELS }, (_, i) => i + 1))('the Bastion at level %i holds more salvage than the raid needs, and one big pile', (level) => {
    const f = buildBastion(level)
    expect(f.salvage.length).toBeGreaterThan(salvageNeed(level, f.salvage.length))
    expect(f.salvage.filter(s => s.big)).toHaveLength(1)
  })
})

describe('the haul pays', () => {
  it('more salvage carried out is more scrap', () => {
    const a = payout(run({ salvage: 120 }), 1, held, 3)
    const b = payout(run({ salvage: 200 }), 1, held, 3)
    expect(b.scrap - a.scrap).toBe(80)
  })

  it('the Commander is a bonus, not the job', () => {
    const a = payout(run({ salvage: 120 }), 1, held, 3)
    const b = payout(run({ salvage: 120, bossDown: true }), 1, held, 3)
    expect(b.scrap - a.scrap).toBe(BOSS_SCRAP)
  })

  it('a level I raid pays about what it used to (the upgrade prices did not move)', () => {
    const p = payout(run({ salvage: 130, kills: 4 }), 1, fresh, 0)
    expect(p.scrap).toBeGreaterThan(baseScrap(1) * 2 - 20)
    expect(p.scrap).toBeLessThan(baseScrap(1) * 2 + 80)
  })

  it('a defeat keeps every stripped pile whole, and is never for nothing', () => {
    const none = defeatScrap(run({ salvage: 0 }), 1)
    expect(none).toBeGreaterThan(0)
    expect(defeatScrap(run({ salvage: 100 }), 1) - none).toBe(100)
  })
})
