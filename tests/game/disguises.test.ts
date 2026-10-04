// @vitest-environment jsdom
// R37 (#97): the disguises. The toaster is everyone's; the rest unlock for
// good (scrap, or a rewarded video where one can play); each is a model about
// the hide box's size, and none changes the rules.

import { beforeEach, describe, expect, it } from 'vitest'
import { Box3, type Mesh } from 'three'
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

describe('the mech folds into its disguise (#111)', () => {
  it('folded away at 0, half out on the way, whole at 1; in the mech\'s colours, its antenna on top', async () => {
    const { morphDisguise } = await import('@/game/models/disguises')
    const { PAL } = await import('@/game/models/palette')
    const { Color } = await import('three')
    for (const id of DISGUISE_IDS) {
      const g = buildDisguise(id)
      const pieces = g.children as Mesh[]
      expect(pieces.length).toBeGreaterThan(4)
      expect(morphDisguise(g, 0)).toBe(false)
      morphDisguise(g, 0.4)
      const some = pieces.filter(p => p.visible).length
      expect(some).toBeGreaterThan(0)
      expect(some).toBeLessThan(pieces.length)
      morphDisguise(g, 1)
      expect(pieces.every(p => p.visible && Math.abs(p.scale.x - 1) < 1e-6)).toBe(true)
      // Every colour on it is one of the mech's own.
      const mech = new Set([PAL.mechArmor, PAL.mechArmorHi, PAL.mechArmorDeep, PAL.mechSuit, PAL.mechSuitDeep, PAL.mechEye, PAL.mechCore].map(h => new Color(h).getHex()))
      for (const p of pieces) {
        const c = p.geometry.attributes.color!
        expect(mech.has(new Color(c.getX(0), c.getY(0), c.getZ(0)).getHex()), id).toBe(true)
      }
      disposeDisguise(g)
    }
  })
})
