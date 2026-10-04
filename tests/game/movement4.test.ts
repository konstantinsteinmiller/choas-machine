// R38: the jump (#95), the hook thrown where the mech looks (#102), and the
// rope gun (#94).

import { describe, expect, it } from 'vitest'
import { makePlayer, stepPlayer, JUMP_V, type Player, type Wish } from '@/game/sim/player'
import { AIM_RANGE, findGrappleAimed, startGrapple, stepGrapple } from '@/game/sim/grapple'
import { ROPE_RANGE, findRopeShot } from '@/game/sim/ropes'
import { CELL, CellKind, cellMid, heightAt, makeGrid, raycast, type Grid } from '@/game/world/grid'

const DT = 1 / 60
const flat = (w = 30, d = 30): Grid => {
  const g = makeGrid(w, d)
  g.h.fill(0)
  g.kind.fill(CellKind.Ground)
  return g
}
const set = (g: Grid, x0: number, z0: number, x1: number, z1: number, h: number, kind: number = CellKind.Block): void => {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { g.h[z * g.w + x] = h; g.kind[z * g.w + x] = kind }
}
const wish = (over: Partial<Wish> = {}): Wish => ({ mx: 0, mz: 0, crouch: false, aiming: false, aimYaw: 0, ...over })
const steps = (p: Player, g: Grid, s: number, w: Partial<Wish> = {}): void => { for (let k = 0; k < s / DT; k++) stepPlayer(p, g, wish(w), DT) }

describe('the jump (#95)', () => {
  it('a hop about a metre high, back on the ground in well under a second', () => {
    const g = flat()
    const p = makePlayer(cellMid(10), 0, cellMid(10))
    const ev = stepPlayer(p, g, wish({ jump: true }), DT)
    expect(ev.some(e => e.type === 'jump')).toBe(true)
    expect(p.mode).toBe('air')
    let top = 0
    let t = 0
    while (p.mode === 'air' && t < 2) { stepPlayer(p, g, wish(), DT); top = Math.max(top, p.y); t += DT }
    expect(top).toBeGreaterThan(1.0)
    expect(top).toBeLessThan(1.25)
    expect(t).toBeLessThan(0.75)
    expect(JUMP_V ** 2 / 48).toBeCloseTo(1.11, 1)
  })

  it('a running jump clears a gap that walking would fall into', () => {
    // A ledge, a 2 m gap 6 m deep, a ledge: from the lip it is about 3 m to stand on the far side.
    const cross = (jump: boolean): Player => {
      const g = flat(40, 10)
      set(g, 0, 0, 39, 9, 6)
      for (let z = 0; z < 10; z++) g.h[z * 40 + 20] = 0
      const p = makePlayer(30, 6, 10, Math.PI / 2)
      let jumped = false
      for (let k = 0; k < 4 / DT; k++) {
        const atLip = jump && !jumped && p.x > 39.4 && p.mode === 'ground'
        if (atLip) jumped = true
        stepPlayer(p, g, wish({ mx: 1, mz: 0, jump: atLip }), DT)
      }
      return p
    }
    const leapt = cross(true)
    expect(leapt.x).toBeGreaterThan(43)
    expect(leapt.y).toBe(6)
    const walked = cross(false)
    expect(walked.y).toBe(0)
  })

  it('a jump into a ledge too high to step onto catches it and climbs (a free mantle)', () => {
    const g = flat()
    set(g, 12, 0, 29, 29, 1.3)
    const p = makePlayer(cellMid(11) - 0.2, 0, cellMid(10), Math.PI / 2)
    let k = 0
    stepPlayer(p, g, wish({ mx: 1, jump: true }), DT)
    for (; k < 120 && p.y < 1.29; k++) stepPlayer(p, g, wish({ mx: 1 }), DT)
    expect(p.y).toBeCloseTo(1.3, 2)
    expect(p.x).toBeGreaterThan(12 * CELL)
  })

  it('crouched under a box, a jump throws the box off', () => {
    const g = flat()
    const p = makePlayer(cellMid(10), 0, cellMid(10))
    stepPlayer(p, g, wish({ box: true }), DT)
    expect(p.boxed).toBe(true)
    stepPlayer(p, g, wish({ jump: true }), DT)
    expect(p.boxed).toBe(false)
  })
})

describe('the hook, where the mech looks (#102)', () => {
  const tower = (): Grid => { const g = flat(); set(g, 14, 14, 16, 16, 6); return g }

  it('a wall top across the yard: the hook takes it, and the mech is pulled over and onto the top', () => {
    const g = tower()
    const p = makePlayer(cellMid(8), 0, cellMid(15), Math.PI / 2)
    const dir = { x: 1, y: 0.25, z: 0 }
    const l = Math.hypot(dir.x, dir.y, dir.z)
    const hit = raycast(g, p.x, 2.25, p.z, dir.x / l, dir.y / l, dir.z / l, 30)
    expect(hit.hit).toBe(true)
    const at = { x: p.x + (dir.x / l) * hit.t, y: 2.25 + (dir.y / l) * hit.t, z: p.z }
    const spot = findGrappleAimed(g, { x: p.x, y: p.y, z: p.z }, at, { x: hit.nx, y: hit.ny, z: hit.nz })!
    expect(spot).toBeTruthy()
    expect(spot.aimed).toBe(true)
    expect(spot.rise).toBe(6)
    const r = startGrapple(p, spot)
    for (let k = 0; k < 6 / DT && r.phase !== 'done'; k++) stepGrapple(r, p, DT)
    expect(r.phase).toBe('done')
    expect(heightAt(g, p.x, p.z)).toBe(6)
    expect(p.y).toBe(6)
  })

  it('too far, too low or too high: no throw', () => {
    const g = tower()
    const far = findGrappleAimed(g, { x: cellMid(14) - AIM_RANGE - 4, y: 0, z: cellMid(15) }, { x: 14 * CELL, y: 3, z: cellMid(15) }, { x: -1, y: 0, z: 0 })
    expect(far).toBeNull()
    const low = flat(); set(low, 14, 14, 16, 16, 1.5)
    expect(findGrappleAimed(low, { x: cellMid(8), y: 0, z: cellMid(15) }, { x: 14 * CELL, y: 1, z: cellMid(15) }, { x: -1, y: 0, z: 0 })).toBeNull()
    const high = flat(); set(high, 14, 14, 16, 16, 15)
    expect(findGrappleAimed(high, { x: cellMid(8), y: 0, z: cellMid(15) }, { x: 14 * CELL, y: 3, z: cellMid(15) }, { x: -1, y: 0, z: 0 })).toBeNull()
  })
})

describe('the rope gun (#94)', () => {
  /** A 6 m wall the mech stands on, a yard below, a low shed across it. */
  const yard = (): Grid => { const g = flat(); set(g, 2, 0, 3, 29, 6); set(g, 18, 10, 19, 12, 2); return g }

  it('from a wall top to a spot below: a line the mech walks at once', () => {
    const g = yard()
    const p = makePlayer(cellMid(3), 6, cellMid(11), Math.PI / 2)
    const shot = findRopeShot(g, p.x, p.y, p.z, cellMid(18), 2, cellMid(11), 1)!
    expect(shot).toBeTruthy()
    g.cables.push(shot.cable)
    // Walk onto it and along it, to the far end.
    let rode = false
    for (let k = 0; k < 20 / DT; k++) {
      stepPlayer(p, g, wish({ mx: 1, mz: 0 }), DT)
      if (p.mode === 'cable') rode = true
      else if (rode) break
    }
    expect(rode).toBe(true)
    expect(p.x).toBeGreaterThan(18 * CELL)
    expect(p.y).toBeCloseTo(2, 1)
  })

  it('not from flat ground, not uphill, not through a wall, not too far', () => {
    const g = yard()
    expect(findRopeShot(g, cellMid(8), 0, cellMid(11), cellMid(18), 2, cellMid(11), 1)).toBeNull()
    const up = flat(); set(up, 2, 0, 3, 29, 2); set(up, 18, 10, 19, 12, 6)
    expect(findRopeShot(up, cellMid(3), 2, cellMid(11), cellMid(18), 6, cellMid(11), 1)).toBeNull()
    const walled = yard(); set(walled, 10, 0, 10, 29, 12)
    expect(findRopeShot(walled, cellMid(3), 6, cellMid(11), cellMid(18), 2, cellMid(11), 1)).toBeNull()
    const wide = flat(60, 30); set(wide, 2, 0, 3, 29, 6)
    expect(findRopeShot(wide, cellMid(3), 6, cellMid(11), cellMid(3) + ROPE_RANGE + 6, 0, cellMid(11), 1)).toBeNull()
  })
})
