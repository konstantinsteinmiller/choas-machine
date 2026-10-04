// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { MEDAL_IDS, WEAPON_IDS } from '@/game/data/ids'
import {
  BASE_LOADOUT, TIER_MAX, TRACKS, TRACK_IDS, TRACK_MAX, loadoutOf, tierBlueprints,
  tierScrap, trackCost, trackTotalCost, trackValue
} from '@/game/data/upgrades'
import { MELT_BONUS } from '@/game/sim/smithy'
import { MISS_REFUND, PITY, spinCost, wheelBonus, winChance, winGain } from '@/game/data/wheel'
import {
  DEFEAT_KEEP, THREAT_LEVELS, baseScrap, defeatScrap, medalsOf, payout, scoreOf, swiftPar, type MissionResult
} from '@/game/sim/rewards'
import { defaultProfile, profile } from '@/game/state/profile'
import {
  __setHaul, bankDefeat, bankMission, buildTier, buyTrack, canBuyTrack, canForge, canSpin, currentLoadout, haulToMelt,
  levelKey, meltHaul, spinWheel, unlockedLevel, wheelOpen
} from '@/game/state/progress'

const tiers1 = (): Record<(typeof WEAPON_IDS)[number], number> => ({ sniper: 1, minigun: 1, rocket: 1 })
const noMedals = () => ({ ghost: false, marksman: false, swift: false })

/** A clean run: every round a headshot, nobody the wiser, in good time. */
const ghostRun = (over: Partial<MissionResult> = {}): MissionResult => ({
  time: 120, shots: 6, hits: 6, headshots: 6, kills: 7, bladeKills: 1, spotted: 0, bodiesFound: 0, loud: false, ...over
})
/** A loud one: found out, a long fight, sprayed rounds. */
const loudRun = (over: Partial<MissionResult> = {}): MissionResult => ({
  time: 260, shots: 140, hits: 45, headshots: 1, kills: 12, bladeKills: 0, spotted: 3, bodiesFound: 1, loud: true, ...over
})

const reset = (): void => { Object.assign(profile, defaultProfile()) }


describe('upgrade tracks', () => {
  it('every track has a station and an icon, and the Armory groups by weapon', () => {
    for (const id of TRACK_IDS) {
      expect(TRACKS[id].id).toBe(id)
      expect(TRACKS[id].icon).toBeTruthy()
      // Ammo racks feed the rifle and the mini-gun alike (#76): the one Armory track without a weapon.
      if (TRACKS[id].station === 'armory' && id !== 'ammoRacks') expect(WEAPON_IDS).toContain(TRACKS[id].weapon)
    }
    // GDD 3.2: three sniper tracks, two each for the minigun and the launcher; the chassis has four (R21: the hook).
    const count = (w: string): number => TRACK_IDS.filter(id => TRACKS[id].weapon === w).length
    expect([count('sniper'), count('minigun'), count('rocket')]).toEqual([3, 2, 2])
    expect(TRACK_IDS.filter(id => TRACKS[id].station === 'chassis')).toHaveLength(4)
  })

  it('each level costs more than the last, and the top costs nothing more', () => {
    for (let l = 1; l < TRACK_MAX; l++) expect(trackCost(l)).toBeGreaterThan(trackCost(l - 1))
    expect(trackCost(TRACK_MAX)).toBe(0)
    expect(trackTotalCost()).toBe([0, 1, 2, 3, 4].reduce((n, l) => n + trackCost(l), 0))
  })

  it('the first level of any track is within one raid: the first raid buys something (#75: dearer than before)', () => {
    expect(trackCost(0)).toBe(60)
  })

  it('the first level of servo speed quiets the sprint; the first of the decoy track packs one more', () => {
    const bare = loadoutOf({ tiers: tiers1(), upgrades: {} })
    const fast = loadoutOf({ tiers: tiers1(), upgrades: { speed: 1 } })
    const lure = loadoutOf({ tiers: tiers1(), upgrades: { decoy: 1 } })
    expect(fast.sprintEarshot).toBeLessThan(bare.sprintEarshot * 0.7)
    expect(lure.decoys).toBe(bare.decoys + 1)
    expect(loadoutOf({ tiers: tiers1(), upgrades: { speed: 5 } }).sprintEarshot).toBeGreaterThan(2)
  })

  it('a bare mech plays with the factory numbers', () => {
    expect(loadoutOf({ tiers: tiers1(), upgrades: {} })).toEqual(BASE_LOADOUT)
  })

  it('every track moves its own number in the right direction, and only that', () => {
    const better: Record<string, (a: ReturnType<typeof loadoutOf>, b: ReturnType<typeof loadoutOf>) => boolean> = {
      sniperZoom: (a, b) => b.scopeFov < a.scopeFov,
      sniperDamage: (a, b) => b.damage.sniper > a.damage.sniper,
      sniperSilence: (a, b) => b.missEarshot < a.missEarshot,
      minigunCooling: (a, b) => b.heatSeconds > a.heatSeconds && b.coolRate > a.coolRate,
      minigunDamage: (a, b) => b.damage.minigun > a.damage.minigun,
      rocketBlast: (a, b) => b.blastRadius > a.blastRadius,
      rocketAmmo: (a, b) => b.rockets > a.rockets,
      ammoRacks: (a, b) => b.rifleReserve > a.rifleReserve && b.belt > a.belt,
      armor: (a, b) => b.armor > a.armor,
      speed: (a, b) => b.speed > a.speed,
      decoy: (a, b) => b.decoySeconds > a.decoySeconds,
      hook: (a, b) => b.hookReach > a.hookReach && b.hookMax > a.hookMax
    }
    for (const id of TRACK_IDS) {
      let prev = loadoutOf({ tiers: tiers1(), upgrades: {} })
      for (let l = 1; l <= TRACK_MAX; l++) {
        const next = loadoutOf({ tiers: tiers1(), upgrades: { [id]: l } })
        expect(better[id]!(prev, next), `${id} level ${l}`).toBe(true)
        prev = next
      }
      // Nothing else moved: put the track back and the mech is bare again.
      expect(trackValue(id, 0)).not.toBe(trackValue(id, TRACK_MAX))
    }
    // The scope never zooms into nothing, and a miss is always heard somewhere.
    const top = loadoutOf({ tiers: tiers1(), upgrades: Object.fromEntries(TRACK_IDS.map(id => [id, 99])) })
    expect(top.scopeFov).toBeGreaterThan(8)
    expect(top.missEarshot).toBeGreaterThan(1)
  })

  it('a weapon tier multiplies that weapon only', () => {
    const l = loadoutOf({ tiers: { sniper: 3, minigun: 1, rocket: 5 }, upgrades: {} })
    expect(l.damage.sniper).toBeGreaterThan(1.3)
    expect(l.damage.minigun).toBe(1)
    expect(l.damage.rocket).toBeGreaterThan(l.damage.sniper)
  })
})

describe('what a mission pays', () => {
  it('a clean run earns all three medals; a loud, slow, sprayed one none', () => {
    expect(medalsOf(ghostRun(), 1)).toEqual({ ghost: true, marksman: true, swift: true })
    expect(medalsOf(loudRun(), 1)).toEqual(noMedals())
  })
  it('being seen for sure costs Ghost even if the base never went loud', () => {
    expect(medalsOf(ghostRun({ spotted: 1 }), 1).ghost).toBe(false)
  })
  it('Marksman needs enough rounds fired to mean something', () => {
    expect(medalsOf(ghostRun({ shots: 1, hits: 1 }), 1).marksman).toBe(false)
  })
  it('a higher threat level allows more time for Swift', () => {
    expect(swiftPar(5)).toBeGreaterThan(swiftPar(1))
    const r = ghostRun({ time: swiftPar(1) + 10 })
    expect(medalsOf(r, 1).swift).toBe(false)
    expect(medalsOf(r, 2).swift).toBe(true)
  })
  it('the clean run outscores the loud one, and a higher level outscores a lower', () => {
    const medals = medalsOf(ghostRun(), 1)
    expect(scoreOf(ghostRun(), 1, medals)).toBeGreaterThan(scoreOf(loudRun(), 1, noMedals()))
    expect(scoreOf(ghostRun(), 3, medals)).toBeGreaterThan(scoreOf(ghostRun(), 1, medals))
    expect(scoreOf(loudRun({ kills: 0, time: 9999, spotted: 50 }), 1, noMedals())).toBe(0)
  })

  it('the first clear pays double and a Data Core; medals pay one each, once', () => {
    const held = { clears: 0, medals: noMedals() }
    const first = payout(ghostRun(), 1, held, 0)
    expect(first.firstClear).toBe(true)
    expect(first.newMedals).toEqual([...MEDAL_IDS])
    expect(first.cores).toBe(4)
    const again = payout(ghostRun(), 1, { clears: 1, medals: first.medals }, 1)
    expect(again.cores).toBe(0)
    expect(again.scrap).toBeLessThan(first.scrap)
    expect(again.scrap).toBeGreaterThan(baseScrap(1))
  })

  it('blueprints come round the three weapons in turn, with one more for a Ghost run', () => {
    const held = { clears: 3, medals: { ghost: true, marksman: true, swift: true } }
    const seen = new Set<string>()
    for (let m = 0; m < 3; m++) {
      const p = payout(loudRun(), 1, held, m)
      expect(p.blueprints).toHaveLength(1)
      seen.add(p.blueprints[0]!)
    }
    expect(seen.size).toBe(3)
    expect(payout(ghostRun(), 1, held, 0).blueprints).toHaveLength(2)
  })

  it('a defeat keeps a share of what the run had earned, never more than a clear', () => {
    for (let level = 1; level <= THREAT_LEVELS; level++) {
      const kept = defeatScrap(loudRun(), level)
      expect(kept).toBeGreaterThan(0)
      expect(kept).toBeLessThan(payout(loudRun(), level, { clears: 5, medals: noMedals() }, 0).scrap * DEFEAT_KEEP * 1.01)
    }
  })
})

describe('the player\'s progress', () => {
  beforeEach(reset)

  it('banking a mission pays out, records the level and opens the next', () => {
    expect(unlockedLevel()).toBe(1)
    const pay = bankMission(ghostRun(), 1)
    expect(profile.scrap).toBe(pay.scrap)
    expect(profile.cores).toBe(pay.cores)
    expect(profile.missions).toBe(1)
    const rec = profile.fortresses[levelKey(1)]!
    expect(rec.clears).toBe(1)
    expect(rec.medals).toEqual({ ghost: true, marksman: true, swift: true })
    expect(rec.bestScore).toBe(pay.score)
    expect(rec.bestTime).toBe(120)
    expect(WEAPON_IDS.reduce((n, w) => n + profile.arsenal.blueprints[w], 0)).toBe(2)
    expect(unlockedLevel()).toBe(2)
    expect(profile.stats.stealthKills).toBe(7)
  })

  it('a worse replay keeps the best score, time and medals', () => {
    bankMission(ghostRun(), 1)
    const best = { ...profile.fortresses[levelKey(1)]! }
    bankMission(loudRun(), 1)
    const rec = profile.fortresses[levelKey(1)]!
    expect(rec.clears).toBe(2)
    expect(rec.bestScore).toBe(best.bestScore)
    expect(rec.bestTime).toBe(120)
    expect(rec.medals.ghost).toBe(true)
    expect(profile.stats.alerts).toBe(1)
  })

  it('levels open one at a time, up to five', () => {
    for (let l = 1; l <= THREAT_LEVELS; l++) {
      expect(unlockedLevel()).toBe(l)
      bankMission(loudRun(), l)
    }
    expect(unlockedLevel()).toBe(THREAT_LEVELS)
  })

  it('a defeat banks its share and counts', () => {
    const kept = bankDefeat(loudRun(), 1)
    expect(profile.scrap).toBe(kept)
    expect(profile.stats.deaths).toBe(1)
    expect(profile.missions).toBe(0)
    expect(unlockedLevel()).toBe(1)
  })

  it('an upgrade is bought with Tech Scrap, a level at a time, to the top and no further', () => {
    expect(canBuyTrack('armor')).toBe(false)
    expect(buyTrack('armor')).toBe(false)
    profile.scrap = trackTotalCost()
    // Bought outright (#75): each level is the mech's at once.
    for (let l = 0; l < TRACK_MAX; l++) { expect(buyTrack('armor')).toBe(true); expect(profile.arsenal.upgrades.armor).toBe(l + 1) }
    expect(profile.scrap).toBe(0)
    expect(profile.arsenal.upgrades.armor).toBe(TRACK_MAX)
    profile.scrap = 99999
    expect(buyTrack('armor')).toBe(false)
    expect(currentLoadout().armor).toBe(BASE_LOADOUT.armor + 20 * TRACK_MAX)
  })

  describe('the Forge, the furnace and the wheel (#75)', () => {
    const stock = (): void => {
      profile.scrap = 5000
      profile.cores = 50
      for (const w of WEAPON_IDS) profile.arsenal.blueprints[w] = 20
    }

    it('a weapon tier needs the blueprints and the scrap, and is built at once', () => {
      expect(canForge('sniper')).toBe(false)
      stock()
      expect(buildTier('sniper')).toBe(true)
      expect(profile.arsenal.tiers.sniper).toBe(2)
      expect(profile.arsenal.blueprints.sniper).toBe(20 - tierBlueprints(2))
      expect(profile.scrap).toBe(5000 - tierScrap(2))
      // Nothing waits in a smithy: the next one can go at once.
      expect(buildTier('minigun')).toBe(true)
      expect(canBuyTrack('armor')).toBe(true)
    })

    it('the furnace melts the last haul once, for a bonus by its stars', () => {
      __setHaul(200)
      expect(haulToMelt()).toBe(Math.round(200 * MELT_BONUS[3]))
      profile.scrap = 0
      expect(meltHaul(0.9)).toEqual({ stars: 3, bonus: Math.round(200 * MELT_BONUS[3]) })
      expect(profile.scrap).toBe(Math.round(200 * MELT_BONUS[3]))
      expect(meltHaul(0.9)).toBeNull()
      __setHaul(200)
      expect(meltHaul(0.6)).toEqual({ stars: 2, bonus: Math.round(200 * MELT_BONUS[2]) })
      __setHaul(200)
      expect(meltHaul(0.1)).toEqual({ stars: 1, bonus: 0 })
    })

    it('a raid leaves its haul for the furnace', () => {
      const pay = bankMission(ghostRun({ salvage: 120 }), 1)
      expect(pay.haul).toBeGreaterThan(0)
      expect(pay.haul).toBeLessThanOrEqual(pay.scrap)
      expect(haulToMelt()).toBe(Math.round(pay.haul * MELT_BONUS[3]))
    })

    it('the wheel opens only once rifle damage is at its top', () => {
      stock()
      expect(wheelOpen()).toBe(false)
      expect(spinWheel('scrap', 0)).toBeNull()
      profile.arsenal.upgrades.sniperDamage = TRACK_MAX
      expect(wheelOpen()).toBe(true)
      expect(canSpin('scrap')).toBe(true)
    })

    it('a win adds rifle damage with no ceiling, each a little less; a miss hands part of the stake back', () => {
      stock()
      profile.arsenal.upgrades.sniperDamage = TRACK_MAX
      const before = currentLoadout().damage.sniper
      const cost = spinCost(0)
      const r = spinWheel('scrap', 0)!
      expect(r).toEqual({ won: true, gain: winGain(0), refund: 0 })
      expect(profile.scrap).toBe(5000 - cost)
      expect(currentLoadout().damage.sniper).toBeCloseTo(before * (1 + winGain(0)))
      const s = profile.scrap
      const miss = spinWheel('scrap', 0.9999)!
      expect(miss.won).toBe(false)
      expect(miss.refund).toBe(Math.round(spinCost(1) * MISS_REFUND))
      expect(profile.scrap).toBe(s - spinCost(1) + miss.refund)
      // Each win less likely, each worth less, each dearer; never zero.
      for (let n = 1; n < 30; n++) {
        expect(winChance(n, 0)).toBeLessThanOrEqual(winChance(n - 1, 0))
        expect(winGain(n)).toBeLessThan(winGain(n - 1))
        expect(spinCost(n)).toBeGreaterThanOrEqual(spinCost(n - 1))
        expect(winChance(n, 0)).toBeGreaterThanOrEqual(0.08)
      }
      expect(wheelBonus(200)).toBeLessThan(0.41)
    })

    it('after PITY misses in a row the next spin cannot lose; a core or a video is a sure win', () => {
      stock()
      profile.arsenal.upgrades.sniperDamage = TRACK_MAX
      profile.arsenal.wheel = { wins: 20, misses: 0 }
      profile.scrap = 1e8
      for (let k = 0; k < PITY; k++) expect(spinWheel('scrap', 0.99999)!.won).toBe(false)
      expect(winChance(20, PITY)).toBe(1)
      expect(spinWheel('scrap', 0.99999)!.won).toBe(true)
      expect(profile.arsenal.wheel.misses).toBe(0)
      const cores = profile.cores
      expect(spinWheel('core', 0.99999)!.won).toBe(true)
      expect(profile.cores).toBe(cores - 1)
      expect(spinWheel('ad', 0.99999)!.won).toBe(true)
    })
  })
})

describe('the economy, played', () => {
  beforeEach(reset)

  /** Play `runs` missions the way a given player does, always at the highest open level, buying whatever is affordable. */
  const play = (runs: number, run: () => MissionResult): { scrap: number; bought: number } => {
    let bought = 0
    for (let i = 0; i < runs; i++) {
      bankMission(run(), unlockedLevel())
      // Spend: cheapest track first.
      for (;;) {
        const next = TRACK_IDS.filter(id => canBuyTrack(id)).sort((a, b) => trackCost(profile.arsenal.upgrades[a] ?? 0) - trackCost(profile.arsenal.upgrades[b] ?? 0))[0]
        if (!next) break
        buyTrack(next)
        bought++
      }
    }
    return { scrap: profile.scrap, bought }
  }

  it('the first clear already buys something', () => {
    expect(play(1, loudRun).bought).toBeGreaterThanOrEqual(1)
  })

  it('a careful player has every track at the top in a few dozen missions, not a handful and not hundreds', () => {
    const all = TRACK_IDS.length * TRACK_MAX
    let missions = 0
    while (TRACK_IDS.some(id => (profile.arsenal.upgrades[id] ?? 0) < TRACK_MAX) && missions < 400) {
      play(1, ghostRun)
      missions++
    }
    expect(TRACK_IDS.reduce((n, id) => n + (profile.arsenal.upgrades[id] ?? 0), 0)).toBe(all)
    // #75: a few dozen raids, slower than before the rebalance (it was 14 to 70).
    expect(missions).toBeGreaterThan(30)
    expect(missions).toBeLessThan(90)
  })

  it('a loud player gets there too, more slowly', () => {
    let missions = 0
    while (TRACK_IDS.some(id => (profile.arsenal.upgrades[id] ?? 0) < TRACK_MAX) && missions < 400) {
      play(1, loudRun)
      missions++
    }
    expect(missions).toBeLessThan(120)
  })

  it('the blueprints for every top tier arrive within the same stretch', () => {
    const need = WEAPON_IDS.length * [2, 3, 4, 5].reduce((n, t) => n + tierBlueprints(t), 0)
    let missions = 0
    while (WEAPON_IDS.reduce((n, w) => n + profile.arsenal.blueprints[w], 0) < need && missions < 400) {
      bankMission(missions % 2 ? ghostRun() : loudRun(), unlockedLevel())
      missions++
    }
    expect(missions).toBeGreaterThan(15)
    expect(missions).toBeLessThan(45)
  })
})
