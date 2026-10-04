// The furnace (round 2, R8; round 4 kept it as the haul's melt, #75): short, fair, and it cannot be failed.

import { describe, expect, it } from 'vitest'
import { FURNACE_LIMIT_S, MELT_BONUS, MELT_S, bandAt, furnaceQuality, inBand, makeFurnace, meltStars, stepFurnace } from '@/game/sim/smithy'

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

describe('the melt (#75)', () => {
  it('stars from how well the furnace went, and the share of the haul they add', () => {
    expect(meltStars(0.95)).toBe(3)
    expect(meltStars(0.8)).toBe(3)
    expect(meltStars(0.6)).toBe(2)
    expect(meltStars(0.2)).toBe(1)
    expect([MELT_BONUS[1], MELT_BONUS[2], MELT_BONUS[3]]).toEqual([0, 0.1, 0.25])
  })
})
