// #164: a strung rope is the hook's braided line with a piton at each end,
// not a flat tube. Nothing of it lies in the deck's plane or in another part.

import { describe, expect, it } from 'vitest'
import { BoxGeometry, Mesh, type BufferGeometry } from 'three'
import { buildRopeLine, ropeLineParts, ROPE_R } from '@/game/fx/ropeLine'
import { coplanarClashes } from '../helpers/coplanar'

describe('a strung rope (#164)', () => {
  // From a tower's edge (4 m) down to a deck's (2 m), at foot height.
  const ends = { ax: 0, ay: 4.06, az: 0, bx: 8, by: 2.06, bz: 0 }
  const parts = ropeLineParts(ends)
  const rope = buildRopeLine(0, 4.06, 0, 8, 2.06, 0)

  it('is a braided line, a piton and a clamp at each end, all in one lit mesh and its outline', () => {
    // The span, the two runs to the eyes, two pitons, two clamps: seven parts.
    expect(parts).toHaveLength(7)
    const meshes: Mesh[] = []
    rope.group.traverse(o => { if (o instanceof Mesh) meshes.push(o) })
    expect(meshes).toHaveLength(2)
    expect(meshes.filter(m => m.renderOrder === -1)).toHaveLength(1)
    expect(meshes[0]!.geometry.attributes.position!.count).toBe(parts.reduce((n, g) => n + g.attributes.position!.count, 0))
    expect(ROPE_R).toBeGreaterThan(0.02)
  })

  it('stands on the decks, set back from their edges, with nothing coplanar with them or with itself', () => {
    const world: BufferGeometry[] = [...parts]
    // The tower top and the deck the pitons are driven into.
    world.push(new BoxGeometry(4, 4, 4).translate(-2, 2, 0), new BoxGeometry(4, 2, 4).translate(10, 1, 0))
    expect(coplanarClashes(world)).toEqual([])
  })

  it('lets go of everything it made', () => {
    expect(() => rope.dispose()).not.toThrow()
  })
})
