// No level geometry may show a hole: a notch, a crack or a pit in the ground.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { findHoles, makeGrid, CellKind, VOID } from '@/game/world/grid'
import { buildBastion, BASTION_LEVELS } from '@/game/data/fortresses/bastion'
import { buildProvingGround } from '@/game/data/fortresses/proving'
import { validateFortress } from '@/game/world/validate'

const land = (w: number, d: number, rows: string[]) => {
  const g = makeGrid(w, d)
  rows.forEach((r, cz) => [...r].forEach((ch, cx) => {
    if (ch !== ' ') { g.h[cz * w + cx] = 0; g.kind[cz * w + cx] = CellKind.Ground }
  }))
  return g
}

describe('what is a hole', () => {
  it('a notch, a crack and a shut-in pit are holes; the open edge of the world is not', () => {
    const g = land(9, 7, [
      '         ',
      ' ### ### ',   // a one-cell notch between two runs of land
      ' ####### ',
      ' ## #### ',   // a pit shut in by land
      ' ####### ',
      ' ####### ',
      '         '
    ])
    const holes = findHoles(g).map(i => [i % 9, Math.floor(i / 9)])
    expect(holes).toContainEqual([4, 1])
    expect(holes).toContainEqual([3, 3])
    expect(holes).not.toContainEqual([0, 0])
    expect(holes).not.toContainEqual([8, 3])
  })

  it('sealing fills them with ground, and the validator would have named them', () => {
    const b = new FortressBuilder('t', 12, 12).ground(1, 1, 10, 10).insert(2, 2).extract(9, 9)
    const f0 = b.build()
    f0.grid.h[5 * 12 + 5] = VOID
    expect(validateFortress(f0).some(p => p.includes('hole'))).toBe(true)
    const f = new FortressBuilder('t', 12, 12).ground(1, 1, 10, 10).insert(2, 2).extract(9, 9)
    const grid = f.build().grid
    expect(findHoles(grid)).toEqual([])
  })
})

describe('the shipped fortresses', () => {
  it.each(Array.from({ length: BASTION_LEVELS }, (_, i) => i + 1))('the Bastion at level %i has no hole in its ground', (level) => {
    expect(findHoles(buildBastion(level).grid)).toEqual([])
  })

  it('nor does the proving ground', () => {
    expect(findHoles(buildProvingGround().grid)).toEqual([])
  })
})
