// Round 5 (#36): `kit.merge` writes the common case straight into typed
// arrays instead of going through three's `mergeGeometries` (which gathers the
// index in a plain array). It must give exactly the same geometry.

import { describe, expect, it } from 'vitest'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { merge, paint, rbox, rcyl, sph, xform } from '@/game/models/kit'

const parts = () => [
  paint(rbox(1, 0.5, 0.8, 0.3, 8, 6), '#ff0000'),
  paint(xform(sph(0.3, 10, 8), [1, 0, 0]), '#00ff00'),
  paint(xform(rcyl(0.2, 1, 0.05, 12, 2), [0, 1, 0]), '#0000ff')
]

describe('kit.merge, written straight (#36)', () => {
  for (const groups of [false, true]) {
    it(`gives what three's merge gives${groups ? ', groups and all' : ''}`, () => {
      const ours = merge(parts(), groups)
      const theirs = mergeGeometries(parts(), groups)!
      expect(Object.keys(ours.attributes).sort()).toEqual(Object.keys(theirs.attributes).sort())
      for (const k of Object.keys(theirs.attributes)) expect(Array.from(ours.attributes[k]!.array)).toEqual(Array.from(theirs.attributes[k]!.array))
      expect(Array.from(ours.index!.array)).toEqual(Array.from(theirs.index!.array))
      expect(ours.groups).toEqual(theirs.groups)
    })
  }

  it('anything it does not handle (no index) still merges, the long way', () => {
    const a = rbox(1, 1, 1).toNonIndexed()
    const b = rbox(1, 1, 1).toNonIndexed()
    expect(merge([a, b]).attributes.position!.count).toBe(a.attributes.position!.count * 2)
  })
})
