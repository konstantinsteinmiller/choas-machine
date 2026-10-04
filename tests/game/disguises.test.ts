// @vitest-environment jsdom
// R37 (#97): the disguises. The toaster is everyone's; the rest unlock for
// good (scrap, or a rewarded video where one can play); each is a model about
// the hide box's size, and none changes the rules.

import { beforeEach, describe, expect, it } from 'vitest'
import { Box3 } from 'three'
import { DISGUISE_IDS, DISGUISE_SCRAP, FREE_DISGUISE, buildDisguise, disposeDisguise } from '@/game/models/disguises'
import { defaultProfile, profile } from '@/game/state/profile'
import { ownsDisguise, unlockDisguise, wearDisguise } from '@/game/state/progress'
import { REWARDED_PLACEMENTS } from '@/use/useRewardedOffers'

beforeEach(() => { Object.assign(profile, defaultProfile()) })

describe('owning and wearing (#97)', () => {
  it('a new mech has the toaster on', () => {
    expect(profile.cosmetics).toEqual({ owned: [FREE_DISGUISE], worn: FREE_DISGUISE })
    expect(FREE_DISGUISE).toBe('toaster')
  })

  it('scrap unlocks one for good and puts it on; not twice, not without the scrap', () => {
    expect(unlockDisguise('teddy')).toBe(false)
    profile.scrap = DISGUISE_SCRAP + 10
    expect(unlockDisguise('teddy')).toBe(true)
    expect(profile.scrap).toBe(10)
    expect(ownsDisguise('teddy')).toBe(true)
    expect(profile.cosmetics.worn).toBe('teddy')
    expect(unlockDisguise('teddy')).toBe(false)
  })

  it('a finished video unlocks one without scrap, and the placement is on the list', () => {
    expect(unlockDisguise('horse', true)).toBe(true)
    expect(profile.scrap).toBe(0)
    expect(REWARDED_PLACEMENTS).toContain('disguise')
  })

  it('only an owned disguise can be worn', () => {
    expect(wearDisguise('bush')).toBe(false)
    unlockDisguise('bush', true)
    expect(wearDisguise('toaster')).toBe(true)
    expect(wearDisguise('bush')).toBe(true)
    expect(profile.cosmetics.worn).toBe('bush')
  })
})

describe('the models', () => {
  for (const id of DISGUISE_IDS) {
    it(`${id}: about the hide box's size, and drawn`, () => {
      const g = buildDisguise(id)
      g.visible = true
      g.updateMatrixWorld(true)
      const b = new Box3().setFromObject(g)
      expect(b.max.x - b.min.x).toBeLessThan(2.9)
      expect(b.max.z - b.min.z).toBeLessThan(3.0)
      expect(b.max.y).toBeLessThan(3.3)
      expect(b.max.y).toBeGreaterThan(1.3)
      expect(b.min.y).toBeGreaterThanOrEqual(0)
      disposeDisguise(g)
    })
  }
})
