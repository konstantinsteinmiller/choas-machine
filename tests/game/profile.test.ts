// @vitest-environment jsdom
// The player profile (`state/profile.ts`): everything the game remembers
// lives in the ONE `cmachine_state` blob, a broken or partial save always
// loads into a complete profile, and the flat headline numbers the save layer
// scores by are derived from the fortress records.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'

type ProfileModule = typeof import('@/game/state/profile')
type StateModule = typeof import('@/use/useGameState')

let P: ProfileModule
let S: StateModule

const fresh = async (): Promise<void> => {
  drainAndResetModules()
  S = await holdGameState()
  P = await import('@/game/state/profile')
}

beforeEach(fresh)
afterEach(() => drainPersist())

/** What actually reached storage, parsed. */
const stored = (): Record<string, any> => {
  S.flushPersist()
  return JSON.parse(localStorage.getItem('cmachine_state') ?? '{}')
}

describe('a new player', () => {
  it('starts with a complete, empty profile', () => {
    P.loadProfile()
    expect(P.profile.scrap).toBe(0)
    expect(P.profile.arsenal.tiers).toEqual({ sniper: 1, minigun: 1, rocket: 1 })
    expect(P.profile.arsenal.unlocks).toEqual([])
    expect(P.profile.arsenal.wheel).toEqual({ wins: 0, misses: 0 })
    expect(P.isFreshProfile()).toBe(true)
  })
})

describe('saving', () => {
  it('writes exactly one localStorage key', () => {
    P.loadProfile()
    P.profile.scrap = 250
    P.saveProfile()
    S.flushPersist()
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    expect(keys).toEqual(['cmachine_state'])
  })

  it('round-trips every field through storage', async () => {
    P.loadProfile()
    P.profile.scrap = 1234
    P.profile.cores = 7
    P.profile.missions = 9
    P.profile.arsenal.blueprints.sniper = 2
    P.profile.arsenal.tiers.minigun = 3
    P.profile.arsenal.upgrades['sniper.zoom'] = 4
    P.profile.arsenal.unlocks.push('decoy', 'minigun')
    const f = P.fortressSave('f02')
    f.clears = 3
    f.medals.ghost = true
    f.bestScore = 8800
    f.bestTime = 171
    P.profile.arsenal.wheel = { wins: 3, misses: 2 }
    P.profile.lessons.touch.scope = 3
    P.profile.seen.push('firstLaunch')
    P.profile.stats.headshots = 12
    // The last raid's habits (R26): what the base answers next.
    P.profile.habits = { headshots: 5, boxUses: 1, perchKills: 2 }
    P.saveProfile()
    const before = JSON.parse(JSON.stringify(P.profile))
    S.flushPersist()

    await fresh()
    P.loadProfile()
    expect(JSON.parse(JSON.stringify(P.profile))).toEqual(before)
    expect(P.isFreshProfile()).toBe(false)
  })

  it('derives the headline numbers the save layer scores by', () => {
    P.loadProfile()
    const a = P.fortressSave('f01')
    a.clears = 2
    a.medals.ghost = true
    a.medals.swift = true
    const b = P.fortressSave('f02')
    b.clears = 1
    b.medals.marksman = true
    P.fortressSave('f03') // visited, never cleared
    P.profile.missions = 3
    P.profile.scrap = 640
    P.saveProfile()
    expect(stored()).toMatchObject({ cm_v: P.SCHEMA_VERSION, cm_cleared: 2, cm_medals: 3, cm_missions: 3, cm_scrap: 640 })
  })

  it('hands the blob copies, so play after a checkpoint waits for the next one', () => {
    P.loadProfile()
    P.fortressSave('f01').clears = 1
    P.saveProfile()
    P.fortressSave('f01').clears = 5
    P.profile.arsenal.unlocks.push('decoy')
    expect(stored().cm_fortresses.f01.clears).toBe(1)
    expect(stored().cm_arsenal.unlocks).toEqual([])
  })
})

describe('loading a damaged or partial save', () => {
  it('fills what is missing and repairs what is broken', () => {
    S.setStates({
      cm_scrap: '300',
      cm_cores: -5,
      cm_arsenal: { tiers: { sniper: 99, minigun: 'x' }, unlocks: ['decoy', 'jetpack', 'decoy'], upgrades: { a: 2, b: -1, c: 'q' } },
      cm_fortresses: { f01: { clears: 2, medals: { ghost: 1, swift: true } }, f02: 'nonsense' },
      cm_forge: { weapon: 'laser', tier: 2, total: 60 },
      cm_lessons: [1, 2, 3],
      cm_seen: ['a', 7, 'a', null],
      cm_stats: null
    })
    P.loadProfile()
    expect(P.profile.scrap).toBe(300)
    expect(P.profile.cores).toBe(0)
    expect(P.profile.arsenal.tiers).toEqual({ sniper: 5, minigun: 1, rocket: 1 })
    expect(P.profile.arsenal.unlocks).toEqual(['decoy'])
    expect(P.profile.arsenal.upgrades).toEqual({ a: 2 })
    expect(P.profile.fortresses.f01).toEqual({
      clears: 2, medals: { ghost: false, marksman: false, swift: true }, bestScore: 0, bestTime: 0, deathsSinceWin: 0
    })
    expect(P.profile.fortresses.f02!.clears).toBe(0)
    expect(P.profile.lessons).toEqual({ touch: {}, desk: {} })
    expect(P.profile.seen).toEqual(['a'])
    expect(P.profile.stats.kills).toBe(0)
  })

  it('a smithy job from an older save is granted at once (#75), and not twice', () => {
    S.setStates({ cm_forge: { weapon: 'sniper', tier: 3, track: 'sniperZoom', step: 'anvil', total: 12, remaining: 9999, stamp: 5, scores: [0.5], paid: 96 } })
    P.loadProfile()
    expect(P.profile.arsenal.upgrades.sniperZoom).toBe(3)
    P.saveProfile()
    expect(stored().cm_forge).toBeNull()
    S.setStates({ cm_forge: { weapon: 'rocket', tier: 9, total: 3600, remaining: 2000, stamp: 5 } })
    P.loadProfile()
    expect(P.profile.arsenal.tiers.rocket).toBe(5)
  })
})

describe('a cloud save that lands after boot', () => {
  it('replaces the profile: the player is not treated as new', async () => {
    const status = await import('@/use/useSaveStatus')
    P.initProfile()
    expect(P.isFreshProfile()).toBe(true)

    // What a hydrate does: the strategy writes the cloud blob into storage,
    // then the bridge reloads the in-memory state and bumps the version.
    localStorage.setItem('cmachine_state', JSON.stringify({
      cm_v: 1,
      cm_scrap: 4200,
      cm_missions: 14,
      cm_fortresses: { f01: { clears: 4, medals: { ghost: true, marksman: true, swift: false }, bestScore: 9000, bestTime: 150 } },
      cm_arsenal: { blueprints: { sniper: 1, minigun: 0, rocket: 0 }, tiers: { sniper: 2, minigun: 1, rocket: 1 }, upgrades: {}, unlocks: ['decoy'] }
    }))
    S.reloadGameState()
    status.saveDataVersion.value++
    await nextTick()

    expect(P.isFreshProfile()).toBe(false)
    expect(P.profile.scrap).toBe(4200)
    expect(P.profile.missions).toBe(14)
    expect(P.clearedCount()).toBe(1)
    expect(P.medalCount()).toBe(2)
    expect(P.profile.arsenal.tiers.sniper).toBe(2)
    expect(P.profile.arsenal.unlocks).toEqual(['decoy'])
  })
})
