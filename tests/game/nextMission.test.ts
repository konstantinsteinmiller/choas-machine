// #166: every playtester went back into the fortress they had just taken.
// A first clear picks what it has opened: the next threat level, or after the
// last one, the next fortress.

import { beforeEach, describe, expect, it } from 'vitest'
import { defaultProfile, profile } from '@/game/state/profile'
import { levelKey, nextOpened } from '@/game/state/progress'
import { THREAT_LEVELS } from '@/game/sim/rewards'

const clear = (fort: 'bastion' | 'foundry', level: number): void => {
  profile.fortresses[levelKey(level, fort)] = { clears: 1, medals: { stealth: false, speed: false, salvage: false } as never, bestScore: 1, bestTime: 1 }
}

describe('the next mission (#166)', () => {
  beforeEach(() => { Object.assign(profile, defaultProfile()) })

  it('after the first threat level falls, the second is next', () => {
    clear('bastion', 1)
    expect(nextOpened('bastion', 1)).toEqual({ fortress: 'bastion', level: 2 })
  })

  it('after the last threat level, the fortress it opens', () => {
    for (let l = 1; l <= THREAT_LEVELS; l++) clear('bastion', l)
    expect(nextOpened('bastion', THREAT_LEVELS)).toEqual({ fortress: 'foundry', level: 1 })
  })

  it('nothing new: nothing is next', () => {
    expect(nextOpened('bastion', 1)).toBeNull()
  })
})
