// Every rope in the game is the one design (#164): the braided steel line,
// a piton at each end, a clamp at each edge. The rope gun's, the ropes the
// fortresses are built with (they kept the old pale tube and posts after
// #164), the story intro's, the training hologram's: all from
// `fx/ropeLine.ts`. A redesign must reach every instance, not only the one
// that was looked at.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Mesh } from 'three'
import { buildFortressMesh } from '@/game/world/fortressMesh'
import { FORTRESS_IDS, loadFortress } from '@/game/data/fortresses/registry'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { cableEnds } from '@/game/world/grid'
import { ropeLineParts } from '@/game/fx/ropeLine'

const src = (p: string): string => readFileSync(`${process.cwd()}/src/${p}`, 'utf8')

describe('the ropes a fortress is built with', () => {
  for (const id of FORTRESS_IDS) {
    it(`${id}: every one of its ropes is the braided line with its pitons`, async () => {
      const f = await loadFortress(id, 1, 0)
      const mesh = await buildFortressMesh(f)
      const ropes = mesh.group.getObjectByName('ropeLines')
      if (f.grid.cables.length === 0) return
      expect(ropes, id).toBeTruthy()
      // One lit mesh and its outline for all of them, made of exactly the parts the builder makes for each.
      const lit = ropes!.children[0] as Mesh
      const want = f.grid.cables.flatMap(c => ropeLineParts(cableEnds(f.grid, c))).reduce((n, g) => n + g.attributes.position!.count, 0)
      expect(lit.geometry.attributes.position!.count, id).toBe(want)
      mesh.dispose()
    })
  }

  it('the training ground too', async () => {
    const f = buildTrainingGround()
    const mesh = await buildFortressMesh(f)
    expect(f.grid.cables.length === 0 || !!mesh.group.getObjectByName('ropeLines')).toBe(true)
    mesh.dispose()
  })
})

describe('no other rope anywhere', () => {
  it('the level mesh draws no cable of its own any more, and the themes carry no colour for one', () => {
    expect(src('game/world/fortressMesh.ts')).not.toMatch(/pal\.cable|cableSpan\(/)
    expect(src('game/data/themes.ts')).not.toMatch(/\bcable:/)
  })

  it('the story intro, the rope gun and the training hologram use the same builders', () => {
    const cinema = src('game/story/cinema.ts')
    expect(cinema).toContain('buildRopeLines(')
    expect(cinema).toContain('makeGrappleVisual(')
    expect(cinema).not.toMatch(/'hookLine', 'rope', 'postA', 'postB'/)
    expect(src('game/sim/mission.ts')).toContain('buildRopeLines([ends])')
    const holo = src('game/sim/trainingDirector.ts')
    expect(holo).toContain('ropeLineParts(')
    expect(holo).toContain('hookHeadGeometry(')
  })
})
