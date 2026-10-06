// #164: a strung rope is the hook's braided line with a piton at each end,
// not a flat tube. Nothing of it lies in the deck's plane or in another part.

import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, type BufferGeometry } from 'three'
import { buildRopeLine, ROPE_R } from '@/game/fx/ropeLine'
import { coplanarClashes } from '../helpers/coplanar'

describe('a strung rope (#164)', () => {
  // From a tower's edge (4 m) down to a deck's (2 m), at foot height.
  const rope = buildRopeLine(0, 4.06, 0, 8, 2.06, 0)
  rope.group.updateMatrixWorld(true)
  const lit: Mesh[] = []
  rope.group.traverse(o => { if (o instanceof Mesh && o.renderOrder !== -1) lit.push(o) })

  it('is a braided line, a piton and a clamp at each end, each outlined', () => {
    let all = 0
    rope.group.traverse(o => { if (o instanceof Mesh) all++ })
    // The span, the two runs to the eyes, two pitons, two clamps: seven parts, each with its outline.
    expect(lit).toHaveLength(7)
    expect(all).toBe(14)
    expect(ROPE_R).toBeGreaterThan(0.02)
  })

  it('stands on the decks, set back from their edges, with nothing coplanar with them or with itself', () => {
    const world: BufferGeometry[] = lit.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld))
    // The tower top and the deck the pitons are driven into.
    world.push(new BoxGeometry(4, 4, 4).translate(-2, 2, 0), new BoxGeometry(4, 2, 4).translate(10, 1, 0))
    expect(coplanarClashes(world)).toEqual([])
  })

  it('lets go of everything it made', () => {
    expect(() => rope.dispose()).not.toThrow()
  })
})
