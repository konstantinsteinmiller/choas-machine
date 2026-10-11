// @vitest-environment jsdom
// #189: Full Repair after a defeat — the base forgets the mech (alarm and
// caution gone, the dead stay dead), and the banked defeat is taken back.
import { beforeEach, describe, expect, it } from 'vitest'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { forgetMech, isAlive, killUnit, makeGarrison } from '@/game/sim/garrison'
import { defaultProfile, profile } from '@/game/state/profile'
import { bankDefeat, deathsSinceWin, unbankDefeat } from '@/game/state/progress'
import type { MissionResult } from '@/game/sim/rewards'

describe('the base forgets the mech', () => {
  it('no alert, no lit beacon, everyone alive back on its round; the dead stay down', () => {
    const f = buildBastion(2, 0)
    const gar = makeGarrison(f, 2)
    gar.alert.level = 100
    gar.alert.chaos = true
    for (const b of gar.beacons) { b.state = 'lit'; b.lit = 1 }
    const live = gar.units.filter(u => isAlive(u) && u.state !== 'dormant' && u.state !== 'reserve')
    for (const u of live) { u.state = 'combat'; u.detect = 1; u.wary = true }
    killUnit(gar, live[0]!.id, 0, 0)
    forgetMech(gar)
    expect(gar.alert.level).toBe(0)
    expect(gar.alert.chaos).toBe(false)
    expect(gar.beacons.every(b => b.state === 'ready')).toBe(true)
    for (const u of live.slice(1)) {
      expect(u.state).toBe('patrol')
      expect(u.detect).toBe(0)
      expect(u.wary).toBe(false)
    }
    expect(live[0]!.state).toBe('dead')
  })
})

describe('the defeat taken back', () => {
  beforeEach(() => { Object.assign(profile, defaultProfile()) })
  const run: MissionResult = { time: 90, shots: 10, hits: 4, headshots: 2, kills: 3, bladeKills: 1, spotted: 1, bodiesFound: 0, loud: true }

  it('the scrap kept, the death, the run\'s stats and the rubber band\'s count all go back', () => {
    const before = JSON.parse(JSON.stringify(profile.stats))
    const kept = bankDefeat(run, 2, 'bastion')
    expect(profile.scrap).toBe(kept)
    expect(deathsSinceWin('bastion', 2)).toBe(1)
    unbankDefeat(run, kept, 2, 'bastion')
    expect(profile.scrap).toBe(0)
    expect(deathsSinceWin('bastion', 2)).toBe(0)
    expect(profile.stats).toEqual(before)
  })
})

// #197: the pause menu's retreat pays like a defeat, but is no death.
describe('a retreat', () => {
  beforeEach(() => { Object.assign(profile, defaultProfile()) })
  it('keeps the defeat share of the scrap and the run, counts no death and no rubber band', async () => {
    const { bankRetreat } = await import('@/game/state/progress')
    const { defeatScrap } = await import('@/game/sim/rewards')
    const run: MissionResult = { time: 60, shots: 4, hits: 2, headshots: 1, kills: 2, bladeKills: 0, spotted: 0, bodiesFound: 0, loud: false, salvage: 300 } as MissionResult
    const kept = bankRetreat(run, 1)
    expect(kept).toBe(defeatScrap(run, 1))
    expect(profile.scrap).toBe(kept)
    expect(profile.stats.kills).toBe(2)
    expect(profile.stats.deaths).toBe(0)
    expect(deathsSinceWin('bastion', 1)).toBe(0)
  })
})
