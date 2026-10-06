// Round 5 (#148): the flamethrower on the living. A person caught by the jet
// drops its riot shield, runs blind from the flame screaming (those near come
// running), and drops when the fire has it, a death that is the flame's.
// A boss does not catch.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { ON_FIRE_S, drainEvents, igniteUnit, makeGarrison, stepGarrison, type Target } from '@/game/sim/garrison'

const yard = (): ReturnType<FortressBuilder['build']> => {
  const b = new FortressBuilder('t', 30, 30)
  b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
  b.guard([[10, 10]], 0).guard([[13, 10]], 0)
  b.posts[0]!.shield = true
  b.guard([[20, 20]], 0)
  b.posts[2]!.boss = 'warden'
  return b.build()
}
// Out of sight, far off: nobody sees the mech, they only hear the screams.
const away: Target = { x: cellMid(1), y: 0, z: cellMid(1), height: 2.6, crouched: true, visible: false }

describe('a person on fire (#148)', () => {
  it('catches, drops its shield, runs, and is down when the fire has it, the flame\'s kill', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const u = gar.units[0]!
    expect(u.shield).toBe(true)
    expect(igniteUnit(gar, u.id, u.x, u.z - 2)).toBe(true)
    expect(u.shield).toBe(false)
    const x0 = u.x
    const z0 = u.z
    let burnt = false
    for (let s = 0; s < ON_FIRE_S + 0.5; s += 1 / 30) {
      stepGarrison(gar, f.grid, away, 1 / 30)
      for (const e of drainEvents(gar)) if (e.type === 'kill' && e.id === u.id && e.burnt) burnt = true
    }
    expect(Math.hypot(u.x - x0, u.z - z0)).toBeGreaterThan(2)
    expect(u.state).toBe('dead')
    expect(burnt).toBe(true)
  })

  it('its screams bring the one nearby; a boss does not catch; nobody catches twice', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    igniteUnit(gar, 0, gar.units[0]!.x, gar.units[0]!.z - 2)
    expect(gar.units[1]!.detect).toBeGreaterThan(0)
    expect(igniteUnit(gar, 0, 0, 0)).toBe(false)
    expect(igniteUnit(gar, 2, gar.units[2]!.x, gar.units[2]!.z - 2)).toBe(false)
  })
})
