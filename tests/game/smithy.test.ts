// Round 2, R8: the smithy's three games are short, fair, and cannot be failed.

import { describe, expect, it } from 'vitest'
import {
  ANVIL_LEAD_S, BEAT_S, CHERRY, FURNACE_LIMIT_S, MELT_S, QUENCH_S, STRIKES, anvilQuality, bandAt, beatAt, dip, furnaceQuality, glowAt,
  inBand, makeAnvil, makeFurnace, makeQuench, quenchQuality, refundOf, ringClose, starsOf, stepAnvil, stepFurnace, stepQuench, strike,
  tierWait, trackWait
} from '@/game/sim/smithy'

const DT = 1 / 60

describe('the furnace', () => {
  /** A good smith: pumps while below the band's middle, rests above it. */
  const tend = (f: ReturnType<typeof makeFurnace>): void => {
    while (!f.done) stepFurnace(f, DT, f.heat < bandAt(f.t))
  }

  it('the bellows raise the heat and the fire loses it', () => {
    const f = makeFurnace()
    for (let i = 0; i < 60; i++) stepFurnace(f, DT, true)
    const hot = f.heat
    expect(hot).toBeGreaterThan(0.4)
    for (let i = 0; i < 60; i++) stepFurnace(f, DT, false)
    expect(f.heat).toBeLessThan(hot)
  })

  it('kept in the band, it melts in a few seconds, and well', () => {
    const f = makeFurnace()
    tend(f)
    expect(f.melt).toBe(1)
    expect(f.t).toBeLessThan(MELT_S + 2.5)
    expect(furnaceQuality(f)).toBeGreaterThan(0.8)
  })

  it('held flat out, it scorches and melts badly; never touched, it still ends', () => {
    const held = makeFurnace()
    while (!held.done) stepFurnace(held, DT, true)
    expect(furnaceQuality(held)).toBeLessThan(0.5)
    const idle = makeFurnace()
    while (!idle.done) stepFurnace(idle, DT, false)
    expect(idle.t).toBeCloseTo(FURNACE_LIMIT_S, 0)
    expect(furnaceQuality(idle)).toBe(0)
  })

  it('the band wanders, so holding still is not the answer', () => {
    const c = Array.from({ length: 40 }, (_, i) => bandAt(i * 0.25))
    expect(Math.max(...c) - Math.min(...c)).toBeGreaterThan(0.25)
    expect(Math.min(...c)).toBeGreaterThan(0.25)
    expect(Math.max(...c)).toBeLessThan(0.9)
    expect(inBand({ ...makeFurnace(), heat: bandAt(0) })).toBe(true)
  })
})

describe('the anvil', () => {
  it('four strikes on the beat are perfect', () => {
    const a = makeAnvil()
    for (let i = 0; i < STRIKES; i++) {
      while (a.t < beatAt(i)) stepAnvil(a, DT)
      expect(strike(a)).toBe('perfect')
    }
    expect(a.done).toBe(true)
    expect(anvilQuality(a)).toBe(1)
  })

  it('the ring closes onto the mark as the beat comes', () => {
    const a = makeAnvil()
    expect(ringClose(a)).toBeLessThan(0.2)
    while (a.t < ANVIL_LEAD_S - 0.05) stepAnvil(a, DT)
    expect(ringClose(a)).toBeGreaterThan(0.9)
  })

  it('a swing far too early is a swing at nothing; a late one is off; a beat let go is missed', () => {
    const a = makeAnvil()
    expect(strike(a)).toBeNull()
    while (a.t < beatAt(0) + 0.25) stepAnvil(a, DT)
    expect(strike(a)).toBe('off')
    while (!a.done) stepAnvil(a, DT)
    expect(a.strikes.slice(1)).toEqual(['miss', 'miss', 'miss'])
    expect(anvilQuality(a)).toBeCloseTo(0.25 / STRIKES)
    // Left alone, it is over in a few seconds.
    expect(a.t).toBeLessThan(ANVIL_LEAD_S + STRIKES * BEAT_S + 0.5)
  })
})

describe('the quench', () => {
  it('cools from white-hot to cold', () => {
    expect(glowAt(0)).toBe(1)
    expect(glowAt(QUENCH_S)).toBe(0)
    expect(glowAt(1)).toBeGreaterThan(glowAt(2))
  })

  it('dipped at cherry red, it is perfect; early or left to go cold, it is not', () => {
    const at = (glow: number): number => {
      const q = makeQuench()
      while (glowAt(q.t + DT) > glow) stepQuench(q, DT)
      dip(q)
      return quenchQuality(q)
    }
    expect(at(CHERRY)).toBe(1)
    expect(at(0.9)).toBeLessThan(0.3)
    const cold = makeQuench()
    while (!cold.done) stepQuench(cold, DT)
    expect(cold.dippedAt).toBe(0)
    expect(quenchQuality(cold)).toBeLessThan(0.2)
  })
})

describe('the result', () => {
  it('stars from the three games, and the scrap a good part saves', () => {
    expect(starsOf([1, 0.9, 0.8])).toBe(3)
    expect(starsOf([0.6, 0.5, 0.5])).toBe(2)
    expect(starsOf([0.2, 0, 0.4])).toBe(1)
    expect(refundOf(200, 3)).toBe(50)
    expect(refundOf(200, 2)).toBe(20)
    expect(refundOf(200, 1)).toBe(0)
  })

  it('the waits are seconds, not hours: 8 to 16 for an upgrade, 14 to 20 for a tier', () => {
    expect(trackWait(1)).toBe(8)
    expect(trackWait(5)).toBe(16)
    expect(tierWait(2)).toBe(14)
    expect(tierWait(5)).toBe(20)
  })
})
