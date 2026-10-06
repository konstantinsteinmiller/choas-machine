// Round 6 (#153–#158): the training ground's playtest notes. The gap in the
// jump room shows its own way out (#154), the cover room's crates can be shot
// over by a mech that stands up (#155), the blade room's hologram plays in the
// middle of the room (#158).

import { describe, expect, it } from 'vitest'
import {
  COVER_ROOM_H, JUMP_DECK_H, JUMP_PIT_COL, LESSON_IDS, TRAINING_ROOMS, buildTrainingGround, roomCell
} from '@/game/data/fortresses/training'
import {
  BLADE_VICTIM, PIT_DEMO, currentFrame, demoFrame, inPit, makeTraining, stepTraining, victimFrame, type TrainingContext
} from '@/game/sim/training'
import { CELL, cellHeight, cellMid, hasLineOfSight } from '@/game/world/grid'
import { MECH_EYE_CROUCH, MECH_HEIGHT_CROUCH } from '@/game/models/mech'
import { BOX_LANE, ROOM_WALL_H } from '@/game/data/fortresses/training'
import { BASE_LOADOUT, TRACK_MAX } from '@/game/data/upgrades'
import { damageUnit, makeGarrison } from '@/game/sim/garrison'
import { lessonDone } from '@/game/sim/training'
import { buildLampCage } from '@/game/models/garrison'
import { Mesh, type BufferGeometry } from 'three'
import { coplanarClashes } from '../helpers/coplanar'

const room = (id: (typeof LESSON_IDS)[number]): number => LESSON_IDS.indexOf(id)
const ctx = (x: number, z: number, y = 0): TrainingContext => ({
  x, y, z, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0,
  supplies: 0, stocked: false, burns: 0, ropes: 0
})
const at = (i: number, lx: number, lz: number): { x: number; z: number } => {
  const [cx, cz] = roomCell(i, lx, lz)
  return { x: cellMid(cx), z: cellMid(cz) }
}

describe('the jump room\'s gap (#154)', () => {
  const j = room('jump')
  const f = buildTrainingGround()

  it('is the floor between the two decks, and only down there', () => {
    const pit = at(j, JUMP_PIT_COL, 7)
    expect(cellHeight(f.grid, Math.floor(pit.x / CELL), Math.floor(pit.z / CELL))).toBe(0)
    expect(inPit(j, pit.x, 0)).toBe(true)
    const deck = at(j, JUMP_PIT_COL + 1, 7)
    expect(inPit(j, deck.x, JUMP_DECK_H)).toBe(false)
    // On the decks' level over the gap (in a jump): not in it.
    expect(inPit(j, pit.x, JUMP_DECK_H)).toBe(false)
    expect(inPit(room('cover'), pit.x, 0)).toBe(false)
  })

  it('falling in plays the way out beside the mech: the hook up to the far deck, G on screen', () => {
    const t = makeTraining()
    const door = at(j, 1, 7)
    stepTraining(t, ctx(door.x, door.z), 0.1)
    expect(t.room).toBe(j)
    expect(t.pit).toBe(false)
    const fell = at(j, JUMP_PIT_COL, 3)
    stepTraining(t, ctx(fell.x, fell.z), 0.1)
    expect(t.pit).toBe(true)
    expect(t.demoT).toBeCloseTo(0.1, 5)
    // A row and a half toward the middle: beside the mech, not on it.
    expect(t.pitZ).toBeCloseTo(-2.5, 5)
    const throwT = PIT_DEMO.find(k => k.hint === 'grapple')!.t
    const fr = demoFrame(j, throwT + 0.4, PIT_DEMO, t.pitZ)
    expect(fr.hint).toBe('grapple')
    expect(fr.grip).not.toBeNull()
    expect(fr.grip!.y).toBeCloseTo(JUMP_DECK_H + 0.05, 5)
    // The bite is the far deck's near edge, in the mech's rows.
    expect(fr.grip!.x).toBeGreaterThan(fell.x + CELL / 2)
    expect(Math.abs(fr.grip!.z - fell.z)).toBeLessThan(CELL * 2.5)
    // It ends up on the deck.
    const end = demoFrame(j, 99, PIT_DEMO, t.pitZ)
    expect(end.y).toBeCloseTo(JUMP_DECK_H, 5)
    // Out of the gap: the room's own demo again.
    const up = at(j, JUMP_PIT_COL + 1, 7)
    stepTraining(t, ctx(up.x, up.z, JUMP_DECK_H), 0.1)
    expect(t.pit).toBe(false)
    expect(currentFrame(t).grip).toBeNull()
  })
})

describe('the cover room (#155)', () => {
  const c = room('cover')
  const f = buildTrainingGround()
  const sentry = f.posts.find(p => p.kind === 'sentry' && Math.floor(p.x / CELL) >= TRAINING_ROOMS[c]!.x0)
  const eye = 1.5

  it('a crouched mech behind the crates is out of the sentry\'s sight, anywhere along them', () => {
    expect(sentry).toBeTruthy()
    const { x: sx, z: sz } = sentry!
    for (const col of [1, 3, 5, 7, 8]) {
      for (const behind of [0.6, 1.2, 2]) {
        const p = at(c, col, 5)
        const mz = p.z + CELL / 2 + behind
        expect(hasLineOfSight(f.grid, sx, eye, sz, p.x, MECH_HEIGHT_CROUCH * 0.97, mz)).toBe(false)
        expect(hasLineOfSight(f.grid, sx, eye, sz, p.x, MECH_EYE_CROUCH * 0.5, mz)).toBe(false)
      }
    }
  })

  it('stood up right behind them, a rifle round from the shoulder goes over them to the sentry\'s head', () => {
    const { x: sx, z: sz } = sentry!
    expect(COVER_ROOM_H).toBeLessThan(1.73 - 0.15)
    for (const col of [2, 4, 6, 8]) {
      const p = at(c, col, 5)
      expect(hasLineOfSight(f.grid, p.x, 1.73, p.z + CELL / 2 + 0.6, sx, 1.55, sz)).toBe(true)
    }
  })
})

describe('the blade room\'s hologram (#158)', () => {
  it('takes its guard in the middle of the room, straight ahead of the way in', () => {
    const b = room('blade')
    const r = TRAINING_ROOMS[b]!
    expect(BLADE_VICTIM[1]).toBeGreaterThanOrEqual(6)
    expect(BLADE_VICTIM[1]).toBeLessThanOrEqual(7)
    expect(BLADE_VICTIM[0]).toBeGreaterThanOrEqual(4)
    expect(BLADE_VICTIM[0]).toBeLessThanOrEqual(6)
    const v = victimFrame(b, 0)!
    expect(v.x).toBeGreaterThan(r.x0 * CELL + CELL * 3)
    expect(v.x).toBeLessThan((r.x1 + 1) * CELL - CELL * 3)
  })
})

describe('the disguise room (#163)', () => {
  const x = room('box')
  const f = buildTrainingGround()
  const r = TRAINING_ROOMS[x]!

  it('is one corridor to the door between walls no hook gets over, however upgraded', () => {
    const hookMost = BASE_LOADOUT.hookMax + 1.2 * TRACK_MAX
    expect(ROOM_WALL_H).toBeGreaterThan(hookMost)
    for (let col = 2; col <= 9; col++) {
      for (let row = 1; row <= 12; row++) {
        const [cx, cz] = roomCell(x, col, row)
        const lane = row >= BOX_LANE[0] && row <= BOX_LANE[1]
        expect(cellHeight(f.grid, cx, cz), `${col},${row}`).toBe(lane ? 0 : ROOM_WALL_H)
      }
    }
    // The lane is the doorway's rows.
    expect(r.door!.cz0).toBe(roomCell(x, 1, BOX_LANE[0])[1])
    expect(r.door!.cz1).toBe(roomCell(x, 1, BOX_LANE[1])[1])
  })

  it('its light is caged: rounds glance off, nothing breaks it, and it sees the whole lane', () => {
    const post = f.posts.find(p => p.kind === 'searchlight' && Math.floor(p.x / CELL) >= r.x0 && Math.floor(p.x / CELL) <= r.x1)!
    expect(post.caged).toBe(true)
    expect(post.armoured).toBe(true)
    const gar = makeGarrison(f, 1)
    const u = gar.units.find(v => v.caged)!
    expect(damageUnit(gar, u.id, 99999, u.x, u.z, 'blast')).toBe(false)
    expect(u.state).not.toBe('dead')
    // From the lamp, down to the floor of every cell of the lane.
    for (let col = 2; col <= 9; col++) {
      for (const row of BOX_LANE) {
        const c = at(x, col, row)
        expect(hasLineOfSight(f.grid, post.x, post.altitude - 0.2, post.z, c.x, 1, c.z), `${col},${row}`).toBe(true)
      }
    }
  })

  it('its cage has no two faces in one plane', () => {
    const cage = buildLampCage()
    cage.group.updateMatrixWorld(true)
    const geos: BufferGeometry[] = []
    cage.group.traverse(o => { if (o instanceof Mesh && o.renderOrder !== -1) geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld)) })
    expect(coplanarClashes(geos)).toEqual([])
    cage.dispose()
  })
})

describe('the decoy room (#165)', () => {
  it('is done past the guard to the door, or with the guard down any way at all', () => {
    const d = room('decoy')
    const base = ctx(0, 0)
    const mid = at(d, 5, 7)
    expect(lessonDone(d, ctx(mid.x, mid.z), base)).toBe(false)
    expect(lessonDone(d, { ...ctx(mid.x, mid.z), cleared: true }, base)).toBe(true)
  })
})
