// Round 5+ (#152): a rifle round goes on through a person. The hit test can
// leave out the body it has just passed through, and then finds the one behind.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison } from '@/game/sim/garrison'
import { castShot, makeShotHit, HEAD_Y } from '@/game/sim/hitscan'
import { Mesh, Vector3 } from 'three'
import { buildGuard, poseGuard, restGuardPose } from '@/game/models/garrison'
import { BulletMarks } from '@/game/fx/bulletMarks'

describe('a round through a person (#152)', () => {
  it('passes the first in line when told to, and finds the second', () => {
    const b = new FortressBuilder('t', 30, 30)
    b.ground(0, 0, 29, 29).insert(1, 1).extract(28, 28)
    b.guard([[10, 10]], 0).guard([[10, 13]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 1)
    const [a, c] = gar.units
    const oz = a!.z - 10
    const first = castShot(f.grid, gar.units, a!.x, a!.y + HEAD_Y, oz, 0, 0, 1, 40, makeShotHit())
    expect(first.unit).toBe(a!.id)
    expect(first.zone).toBe('head')
    const next = castShot(f.grid, gar.units, a!.x, a!.y + HEAD_Y, first.z + 0.5, 0, 0, 1, 40, makeShotHit(), a!.id)
    expect(next.unit).toBe(c!.id)
    expect(next.zone).toBe('head')
  })
})

describe('where a round went in and out (#152)', () => {
  it('marks sit on the body, on the bone that moves the part hit, and go when it is stood up again', () => {
    const rig = buildGuard()
    poseGuard(rig, { ...restGuardPose(), time: 0 })
    rig.root.updateMatrixWorld(true)
    const marks = new BulletMarks()
    const chest = rig.bones.chest!.getWorldPosition(new Vector3())
    // A round from the front at chest height, through and out of the back.
    const y = chest.y + 0.25
    marks.mark(rig, chest.x, y, chest.z - 0.4, 0, 0, 1, false)
    marks.mark(rig, chest.x, y, chest.z + 1.2, 0, 0, -1, false)
    const placed: Mesh[] = []
    rig.root.traverse(o => { if (o instanceof Mesh && o.geometry.type === 'CircleGeometry') placed.push(o) })
    expect(placed).toHaveLength(2)
    for (const m of placed) {
      expect(m.parent!.name).toBe('chest')
      // On the body's own surface (a hair off it), not out on the capsule.
      const w = m.getWorldPosition(new Vector3())
      expect(Math.abs(w.z - chest.z)).toBeLessThan(0.3)
    }
    const [front, back] = placed.map(m => m.getWorldPosition(new Vector3()).z).sort((p, q) => p - q)
    expect(front).toBeLessThan(chest.z)
    expect(back).toBeGreaterThan(chest.z)
    marks.clear(rig)
    const left: Mesh[] = []
    rig.root.traverse(o => { if (o instanceof Mesh && o.geometry.type === 'CircleGeometry') left.push(o) })
    expect(left).toHaveLength(0)
    marks.dispose()
  })

  it('no surface on the line, no mark hanging in the air', () => {
    const rig = buildGuard()
    rig.root.updateMatrixWorld(true)
    const marks = new BulletMarks()
    marks.mark(rig, 3, 1, 0, 0, 0, 1, true)
    let n = 0
    rig.root.traverse(o => { if (o instanceof Mesh && o.geometry.type === 'CircleGeometry') n++ })
    expect(n).toBe(0)
  })
})
