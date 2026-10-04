// #108: a body falling is heard. A guard taken down silently (no round, no
// shout) still hits the ground: whoever is within earshot turns to it and
// comes to look; further off, nobody. On the training drill heads turn only.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import { BODY_THUD_M, killUnit, makeGarrison, stepGarrison, type Target } from '@/game/sim/garrison'

const setup = (drill = false) => {
  const b = new FortressBuilder('t', 50, 50)
  b.ground(0, 0, 49, 49).insert(1, 1).extract(48, 48)
  // The victim, a neighbour a couple of cells off facing away, one far off.
  b.guard([[20, 20]], 0).guard([[22, 20]], Math.PI).guard([[20, 30]], 0)
  const f = b.build()
  const gar = makeGarrison(f, 1)
  gar.drill = drill
  const t: Target = { x: cellMid(2), y: 0, z: cellMid(2), height: 2.6, crouched: true, visible: false }
  return { f, gar, t }
}

describe('a body falling is heard (#108)', () => {
  it('the neighbour turns to the body and comes to look; the far one does not hear it', () => {
    const { f, gar, t } = setup()
    const [v, near, far] = gar.units
    expect(Math.hypot(near!.x - v!.x, near!.z - v!.z)).toBeLessThan(BODY_THUD_M)
    expect(Math.hypot(far!.x - v!.x, far!.z - v!.z)).toBeGreaterThan(BODY_THUD_M)
    killUnit(gar, v!.id, v!.x, v!.z, 'blade')
    // Just after the thud: the near one has heard it, the far one has not.
    for (let k = 0; k < 25; k++) stepGarrison(gar, f.grid, t, 1 / 30)
    expect(near!.state).not.toBe('patrol')
    expect(near!.detect).toBeGreaterThan(0.3)
    expect(far!.state).toBe('patrol')
    // And once the near one has found the body, it calls the other over.
    for (let k = 0; k < 40; k++) stepGarrison(gar, f.grid, t, 1 / 30)
    expect(far!.state).not.toBe('patrol')
  })

  it('on the training drill the neighbour only turns its head', () => {
    const { f, gar, t } = setup(true)
    const [v, near] = gar.units
    killUnit(gar, v!.id, v!.x, v!.z, 'blade')
    for (let k = 0; k < 30; k++) stepGarrison(gar, f.grid, t, 1 / 30)
    expect(near!.state).toBe('patrol')
  })
})
