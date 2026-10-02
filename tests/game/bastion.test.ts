import { describe, expect, it } from 'vitest'
import { BASTION_LEVELS, buildBastion } from '@/game/data/fortresses/bastion'
import { validateFortress } from '@/game/world/validate'

describe('Bastion', () => {
  for (let level = 1; level <= BASTION_LEVELS; level++) {
    it(`level ${level} is a playable layout`, () => {
      expect(validateFortress(buildBastion(level))).toEqual([])
    })
  }
})
