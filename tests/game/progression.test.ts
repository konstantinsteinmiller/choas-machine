// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { MEDAL_IDS, WEAPON_IDS } from '@/game/data/ids'
import {
  BASE_LOADOUT, TIER_MAX, TRACKS, TRACK_IDS, TRACK_MAX, loadoutOf, skipCost, tierBlueprints,
  tierScrap, trackCost, trackTotalCost, trackValue
} from '@/game/data/upgrades'
import { REFUND, tierWait, trackWait } from '@/game/sim/smithy'
import {
  DEFEAT_KEEP, THREAT_LEVELS, baseScrap, defeatScrap, medalsOf, payout, scoreOf, swiftPar, type MissionResult
} from '@/game/sim/rewards'
import { defaultProfile, profile } from '@/game/state/profile'
import {
  bankDefeat, bankMission, buyTrack, canBuyTrack, canForge, currentLoadout, forgeRemaining, forgeSkipCost,
  levelKey, settleForge, skipForge, smithReady, smithStep, startForge, unlockedLevel, type SmithResult
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

/** Play the smithy's three games at `quality`, waiting out each melt and cool. */
const smith = (quality = 0.6, t0 = 1_800_000_000_000): SmithResult | null => {
  let now = t0
  let r: SmithResult | null = null
  for (let i = 0; i < 3 && profile.forge; i++) {
    now += (profile.forge.remaining + 1) * 1000
    r = smithStep(quality, now)
  }
  return r
}

describe('upgrade tracks', () => {
  it('every track has a station and an icon, and the Armory groups by weapon', () => {
    for (const id of TRACK_IDS) {
      expect(TRACKS[id].id).toBe(id)
      expect(TRACKS[id].icon).toBeTruthy()
      if (TRACKS[id].station === 'armory') expect(WEAPON_IDS).toContain(TRACKS[id].weapon)
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

  it('the first level of any track is cheap: the first raid buys something', () => {
    expect(trackCost(0)).toBe(30)
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
    // Made at one star: no scrap comes back.
    for (let l = 0; l < TRACK_MAX; l++) { expect(buyTrack('armor')).toBe(true); smith(0) }
    expect(profile.scrap).toBe(0)
    expect(profile.arsenal.upgrades.armor).toBe(TRACK_MAX)
    profile.scrap = 99999
    expect(buyTrack('armor')).toBe(false)
    expect(currentLoadout().armor).toBe(BASE_LOADOUT.armor + 20 * TRACK_MAX)
  })

  describe('the smithy', () => {
    const T0 = 1_800_000_000_000
    const stock = (): void => {
      profile.scrap = 5000
      profile.cores = 50
      for (const w of WEAPON_IDS) profile.arsenal.blueprints[w] = 20
    }

    it('a weapon tier needs the blueprints and the scrap; the smithy makes one thing at a time', () => {
      expect(canForge('sniper')).toBe(false)
      stock()
      expect(startForge('sniper', T0)).toBe(true)
      expect(profile.arsenal.blueprints.sniper).toBe(20 - tierBlueprints(2))
      expect(profile.scrap).toBe(5000 - tierScrap(2))
      expect(profile.forge).toMatchObject({ weapon: 'sniper', tier: 2, step: 'furnace', total: tierWait(2), remaining: 0 })
      expect(startForge('minigun', T0)).toBe(false)
      expect(canBuyTrack('armor')).toBe(false)
    })

    it('an upgrade goes to the smithy too, and is the player\'s once it is through the quench', () => {
      profile.scrap = 1000
      expect(buyTrack('sniperZoom', T0)).toBe(true)
      expect(profile.forge).toMatchObject({ track: 'sniperZoom', tier: 1, step: 'furnace', total: trackWait(1) })
      expect(profile.arsenal.upgrades.sniperZoom ?? 0).toBe(0)
      expect(smith(0.9, T0)).toMatchObject({ track: 'sniperZoom', tier: 1, stars: 3 })
      expect(profile.arsenal.upgrades.sniperZoom).toBe(1)
      expect(profile.forge).toBeNull()
    })

    it('the furnace is played at once; then the metal melts, then cools, before the next game', () => {
      stock()
      startForge('sniper', T0)
      expect(smithReady(T0)).toBe(true)
      expect(smithStep(0.8, T0)).toBeNull()
      expect(profile.forge).toMatchObject({ step: 'anvil', scores: [0.8] })
      // Melting: the anvil must wait.
      expect(smithReady(T0 + 5_000)).toBe(false)
      expect(smithStep(1, T0 + 5_000)).toBeNull()
      expect(profile.forge!.scores).toEqual([0.8])
      const melt = T0 + tierWait(2) * 1000
      expect(smithStep(0.7, melt)).toBeNull()
      expect(profile.forge).toMatchObject({ step: 'quench' })
      expect(profile.arsenal.tiers.sniper).toBe(1)
      const r = smithStep(0.9, melt + tierWait(2) * 1000)
      expect(r).toMatchObject({ weapon: 'sniper', tier: 2, stars: 3 })
      expect(profile.arsenal.tiers.sniper).toBe(2)
    })

    it('the stars refund a share of the scrap', () => {
      stock()
      startForge('rocket', T0)
      const paid = tierScrap(2)
      const before = profile.scrap
      const r = smith(0.9, T0)!
      expect(r.stars).toBe(3)
      expect(r.refund).toBe(Math.round(paid * REFUND[3]))
      expect(profile.scrap).toBe(before + r.refund)
      startForge('minigun', T0)
      expect(smith(0.6, T0)!.stars).toBe(2)
      startForge('sniper', T0)
      expect(smith(0.1, T0)).toMatchObject({ stars: 1, refund: 0 })
    })

    it('the waits go on while the game is closed: the save carries the clock', () => {
      stock()
      startForge('rocket', T0)
      smithStep(0.5, T0)
      settleForge(T0 + 5_000)
      expect(profile.forge!.remaining).toBe(tierWait(2) - 5)
      expect(profile.forge!.stamp).toBe(T0 + 5_000)
      expect(forgeRemaining(profile.forge!, T0 + tierWait(2) * 1000)).toBe(0)
    })

    it('a clock wound back credits nothing', () => {
      stock()
      startForge('sniper', T0)
      smithStep(0.5, T0)
      settleForge(T0 + 5_000)
      const left = profile.forge!.remaining
      // Back an hour, then forward again to where it was: no time gained.
      settleForge(T0 - 3_600_000)
      expect(profile.forge!.remaining).toBe(left)
      expect(forgeRemaining(profile.forge!, T0 - 3_600_000 + 4_000)).toBe(left)
      settleForge(T0 + 5_000)
      expect(profile.forge!.remaining).toBe(left)
      expect(smithReady(T0 + 5_000)).toBe(false)
      // Real time from there on still counts.
      expect(smithReady(T0 + 5_000 + left * 1000)).toBe(true)
    })

    it('a Data Core cuts a wait short', () => {
      expect(skipCost(0)).toBe(0)
      expect(skipCost(1)).toBe(1)
      expect(skipCost(999)).toBe(1)
      stock()
      profile.arsenal.tiers.minigun = 4
      startForge('minigun', T0)
      // Nothing to skip before the furnace.
      expect(forgeSkipCost(T0)).toBe(0)
      smithStep(0.5, T0)
      expect(forgeSkipCost(T0)).toBe(1)
      profile.cores = 0
      expect(skipForge(T0)).toBe(false)
      profile.cores = 1
      expect(skipForge(T0)).toBe(true)
      expect(profile.cores).toBe(0)
      expect(smithReady(T0)).toBe(true)
      smithStep(0.5, T0)
      profile.cores = 1
      skipForge(T0)
      expect(smithStep(0.5, T0)).toMatchObject({ tier: TIER_MAX })
      expect(profile.arsenal.tiers.minigun).toBe(TIER_MAX)
      // The top tier: nothing more to build.
      stock()
      expect(canForge('minigun')).toBe(false)
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
        smith(0.6)
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
    expect(missions).toBeGreaterThan(14)
    expect(missions).toBeLessThan(70)
  })

  it('a loud player gets there too, more slowly', () => {
    let missions = 0
    while (TRACK_IDS.some(id => (profile.arsenal.upgrades[id] ?? 0) < TRACK_MAX) && missions < 400) {
      play(1, loudRun)
      missions++
    }
    expect(missions).toBeLessThan(110)
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
