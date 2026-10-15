// #186: the cover room's door is a gap under its gate that only a crouched mech
// passes; a standing one bumps its head, and under it the mech cannot stand.

import { describe, expect, it } from 'vitest'
import { makePlayer, stepPlayer, type Player, type Wish } from '@/game/sim/player'
import { CELL, cellMid, makeGrid, type Grid } from '@/game/world/grid'
import { CRAWL_GAP_H } from '@/game/data/fortresses/training'
import { MECH_HEIGHT } from '@/game/models/mech'

const DT = 1 / 60
const wish = (over: Partial<Wish> = {}): Wish => ({ mx: 0, mz: 0, crouch: false, aiming: false, aimYaw: 0, ...over })
const steps = (p: Player, g: Grid, s: number, w: Partial<Wish> = {}): void => { for (let k = 0; k < s / DT; k++) stepPlayer(p, g, wish(w), DT) }

/** Open floor, and a crawl gap across column 6. */
const yard = (): Grid => {
  const g = makeGrid(14, 6)
  g.h.fill(0)
  for (let cz = 0; cz < 6; cz++) g.roof[cz * g.w + 6] = CRAWL_GAP_H
  return g
}

describe('a crawl gap (#186)', () => {
  it('is lower than a standing mech and higher than a crouched one', () => {
    expect(CRAWL_GAP_H).toBeLessThan(MECH_HEIGHT)
    expect(CRAWL_GAP_H).toBeGreaterThan(MECH_HEIGHT * 0.6)
  })

  it('a standing mech walking at it stops in front of it', () => {
    const g = yard()
    const p = makePlayer(cellMid(3), 0, cellMid(3))
    steps(p, g, 3, { mx: 1 })
    expect(p.x).toBeLessThan(6 * CELL)
  })

  it('crouched, it goes through; under it, it cannot stand up', () => {
    const g = yard()
    const p = makePlayer(cellMid(3), 0, cellMid(3))
    stepPlayer(p, g, wish({ crouch: true }), DT)
    expect(p.crouched).toBe(true)
    // Into the gap and stopped under it.
    let k = 0
    while (p.x < cellMid(6) && k++ < 600) stepPlayer(p, g, wish({ mx: 1 }), DT)
    expect(p.x).toBeGreaterThanOrEqual(cellMid(6) - 0.1)
    // Asked to stand (the toggle), it stays down; it does not sprint up either.
    stepPlayer(p, g, wish({ crouch: true }), DT)
    expect(p.crouched).toBe(true)
    stepPlayer(p, g, wish({ mx: 1, sprint: true }), DT)
    expect(p.crouched).toBe(true)
    // And out the far side.
    steps(p, g, 2, { mx: 1 })
    expect(p.x).toBeGreaterThan(7 * CELL)
  })
})

describe('the cover room hologram (#186)', () => {
  it('crawls through the gap and stops just past the gate, still crouched, held there', async () => {
    const { demoFrame, demoLength } = await import('@/game/sim/training')
    const { LESSON_IDS, TRAINING_ROOMS } = await import('@/game/data/fortresses/training')
    const i = LESSON_IDS.indexOf('cover')
    const gateX = (TRAINING_ROOMS[i]!.door!.cx + 0.5) * CELL
    const len = demoLength('cover')
    const end = demoFrame(i, len)
    // Past the glass, by less than a body length: seen through the opening.
    expect(end.x - gateX).toBeGreaterThan(0.5)
    expect(end.x - gateX).toBeLessThan(1.6)
    expect(end.crouch).toBe(1)
    // Held: the last second does not move.
    expect(demoFrame(i, len - 1).x).toBeCloseTo(end.x, 3)
  })
})

describe('the cover room gate, once crawled under', () => {
  it('goes: no glass in front of the camera of a mech turning to aim past it', async () => {
    const { Scene } = await import('three')
    const { TrainingDirector } = await import('@/game/sim/trainingDirector')
    const { buildTrainingGround, LESSON_IDS, TRAINING_ROOMS } = await import('@/game/data/fortresses/training')
    const { makeGarrison } = await import('@/game/sim/garrison')
    const { VOID } = await import('@/game/world/grid')
    const f = buildTrainingGround()
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1)) as unknown as InstanceType<typeof TrainingDirector> & { gates: Array<{ visible: boolean } | null> }
    const i = LESSON_IDS.indexOf('cover')
    const door = TRAINING_ROOMS[i]!.door!
    const ctx = (x: number) => ({ x, y: 0, z: cellMid(door.cz0), bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0, supplies: 0, stocked: false, burns: 0, ropes: 0, crouched: true })
    const roof = () => f.grid.roof[door.cz0 * f.grid.w + door.cx]
    d.step(ctx(cellMid(door.cx) - 0.6) as never, 1 / 60)
    expect(roof()).toBeCloseTo(CRAWL_GAP_H, 5)
    d.step(ctx(cellMid(door.cx) + 1) as never, 1 / 60)
    expect(roof()).toBe(VOID)
    d.update(1 / 60, 0)
    expect(d.gates[i]!.visible).toBe(false)
  })
})
