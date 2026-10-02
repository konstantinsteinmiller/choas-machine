import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error a plain-Node build script, no typings
import { buildSeed, CEILING, LEVELS, SEED_FILE, SURVIVAL, TOTAL, TYPICAL } from '../../scripts/leaderboard-seed.mjs'
import { THREAT_LEVELS, scoreOf, medalsOf, swiftPar, type MissionResult } from '@/game/sim/rewards'
import { rankFromDist } from '@/use/leaderboardSnapshot'

/**
 * The board baked into the builds that can never reach ours (Poki, Yandex).
 * It is modelled, so what is held here is its SHAPE and its agreement with the
 * game, never one population's arithmetic.
 */

interface Seed { source: string; fetchedAt: number; updatedAt: number; total: number; entries: unknown[]; dist: [number, number][] }
const seed = buildSeed() as Seed

/** A flawless run: every round a headshot, never seen, well inside par. */
const flawless = (level: number): MissionResult => ({
  time: swiftPar(level) * 0.5, shots: 14, hits: 14, headshots: 14, kills: 18, bladeKills: 4, spotted: 0, bodiesFound: 0, loud: false
})
/** A middling one: found out, a handful of kills, no medal. */
const middling = (level: number): MissionResult => ({
  time: swiftPar(level) * 1.25, shots: 30, hits: 12, headshots: 2, kills: 8, bladeKills: 1, spotted: 2, bodiesFound: 1, loud: true
})
const best = (r: MissionResult, level: number): number => scoreOf(r, level, medalsOf(r, level))

describe('the seeded leaderboard', () => {
  it('says out loud that it is modelled', () => {
    expect(seed.source).toBe('seeded:retention-curve')
  })

  it('shows no invented players: a histogram, and no rows', () => {
    expect(seed.entries).toEqual([])
  })

  it('is reproducible: the same file every run, and the committed one is it', () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(seed))
    const committed = JSON.parse(readFileSync(resolve(SEED_FILE), 'utf8')) as Seed
    expect(committed, 'run `pnpm leaderboard:seed` and commit data/leaderboard-seed.json').toEqual(seed)
  })

  it('its population is what its histogram adds up to', () => {
    expect(seed.total).toBe(TOTAL)
    expect(seed.dist.reduce((a, [, n]) => a + n, 0)).toBe(seed.total)
    for (const [score, n] of seed.dist) {
      expect(Number.isInteger(score) && score > 0).toBe(true)
      expect(Number.isInteger(n) && n > 0).toBe(true)
    }
    // Score-descending: every rank walk depends on it.
    for (let i = 1; i < seed.dist.length; i++) expect(seed.dist[i]![0]).toBeLessThan(seed.dist[i - 1]![0])
  })

  it('models the campaign the game has', () => {
    expect(LEVELS).toBe(THREAT_LEVELS)
    expect(SURVIVAL).toHaveLength(THREAT_LEVELS)
    expect(SURVIVAL[0]).toBe(1)
    for (let i = 1; i < SURVIVAL.length; i++) expect(SURVIVAL[i]).toBeLessThan(SURVIVAL[i - 1]!)
  })

  it('is built out of the quantity the game posts: campaign points, not level numbers', () => {
    // The generator is plain Node and cannot import the game, so its numbers
    // are COPIES. Re-derived here from the game's own scoring.
    for (let level = 1; level <= THREAT_LEVELS; level++) {
      const top = best(flawless(level), level)
      const mid = best(middling(level), level)
      expect(CEILING[level - 1], `ceiling of level ${level} (the game says ${top})`).toBeGreaterThan(top * 0.6)
      expect(CEILING[level - 1]).toBeLessThan(top * 1.6)
      expect(TYPICAL[level - 1], `typical run at level ${level} (the game says ${mid})`).toBeGreaterThan(mid * 0.5)
      expect(TYPICAL[level - 1]).toBeLessThan(mid * 2)
    }
    // Nobody on the board has more than a flawless campaign could score.
    const perfect = CEILING.reduce((a: number, b: number) => a + b, 0)
    expect(seed.dist[0]![0]).toBeLessThanOrEqual(perfect)
    // …and the board is in the thousands, where the game's scores are.
    expect(seed.dist[0]![0]).toBeGreaterThan(10_000)
  })

  it('ranks a real player somewhere in the middle, and a better score never worse', () => {
    const first = best(middling(1), 1)
    const rank = rankFromDist(seed.dist, first)
    expect(rank).toBeGreaterThan(1)
    expect(rank).toBeLessThanOrEqual(seed.total)
    let prev = Infinity
    for (let s = 500; s <= 60_000; s += 1500) {
      const r = rankFromDist(seed.dist, s)
      expect(r).toBeLessThanOrEqual(prev)
      prev = r
    }
    // A flawless campaign is at the very top; one poor clear is near the bottom.
    expect(rankFromDist(seed.dist, 70_000)).toBe(1)
    expect(rankFromDist(seed.dist, 700)).toBeGreaterThan(seed.total * 0.9)
  })

  it('has no pile-up: no single score holds a crowd', () => {
    const biggest = Math.max(...seed.dist.map(([, n]) => n))
    expect(biggest).toBeLessThan(seed.total * 0.03)
  })
})
