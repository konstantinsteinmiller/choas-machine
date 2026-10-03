// The camera (`sim/camera.ts`): follows behind the mech, shortens its arm at
// a wall, goes into the head for the sniper scope and over the shoulder for
// the loud weapons, and turns the stick into the view's directions.

import { describe, expect, it } from 'vitest'
import {
  makeCam, lookCam, stepCam, placeCam, camForward, stickToWorld, FOLLOW_DIST, PITCH_MAX, PITCH_MIN, CLOSE_DIST
} from '@/game/sim/camera'
import { makeGrid, type Grid } from '@/game/world/grid'

const flat = (): Grid => {
  const g = makeGrid(32, 32)
  g.h.fill(0)
  return g
}
const BASE = 60
const SCOPE = 18
const settle = (cam: ReturnType<typeof makeCam>, aiming: boolean): void => {
  for (let i = 0; i < 240; i++) stepCam(cam, aiming, 1 / 60)
}

describe('looking', () => {
  it('heading 0 looks along +z; a drag to the right turns toward −x', () => {
    const cam = makeCam(0)
    cam.pitch = 0
    expect(camForward(cam).z).toBeCloseTo(1)
    lookCam(cam, 100, 0, 0, 1 / 60, 1, BASE, BASE)
    expect(camForward(cam).x).toBeLessThan(0)
  })

  it('a drag down looks down, and the pitch stops at its limits', () => {
    const cam = makeCam(0)
    lookCam(cam, 0, 99999, 0, 1 / 60, 1, BASE, BASE)
    expect(cam.pitch).toBe(PITCH_MIN)
    lookCam(cam, 0, -99999, 0, 1 / 60, 1, BASE, BASE)
    expect(cam.pitch).toBe(PITCH_MAX)
  })

  it('through the scope the same drag turns the view much less', () => {
    const wide = makeCam(0)
    const scoped = makeCam(0)
    lookCam(wide, 50, 0, 0, 1 / 60, 1, BASE, BASE)
    lookCam(scoped, 50, 0, 0, 1 / 60, 1, SCOPE, BASE)
    expect(Math.abs(scoped.yaw)).toBeLessThan(Math.abs(wide.yaw) * 0.4)
    expect(Math.abs(scoped.yaw)).toBeGreaterThan(0)
  })

  it('the turn keys turn at a steady rate', () => {
    const cam = makeCam(0)
    for (let i = 0; i < 60; i++) lookCam(cam, 0, 0, 1, 1 / 60, 1, BASE, BASE)
    expect(cam.yaw).toBeCloseTo(-2.2, 1)
  })
})

describe('the stick follows the view', () => {
  it('forward is where the camera looks; right is the view`s right', () => {
    const cam = makeCam(0)
    expect(stickToWorld(cam, 0, 1)).toEqual({ x: 0, z: 1 })
    const right = stickToWorld(cam, 1, 0)
    expect(right.x).toBeCloseTo(-1)
    expect(right.z).toBeCloseTo(0)
    cam.yaw = Math.PI / 2
    const f = stickToWorld(cam, 0, 1)
    expect(f.x).toBeCloseTo(1)
    expect(f.z).toBeCloseTo(0)
  })
})

describe('placing', () => {
  it('follows behind and above the mech on open ground', () => {
    const cam = makeCam(0)
    const p = placeCam(cam, flat(), 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    expect(p.z).toBeLessThan(30 - FOLLOW_DIST * 0.8)
    expect(p.y).toBeGreaterThan(2.25)
    expect(p.fov).toBe(BASE)
    expect(p.inside).toBe(0)
    // It looks the way the mech is aimed, not at the mech.
    expect(p.tz).toBeGreaterThan(p.z)
  })

  it('a wall behind the mech pulls the camera in front of the wall', () => {
    const g = flat()
    for (let cx = 0; cx < 32; cx++) g.h[13 * 32 + cx] = 6 // a wall across z 26..28
    const cam = makeCam(0)
    cam.pitch = 0
    const p = placeCam(cam, g, 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    expect(p.z).toBeGreaterThan(28)
    expect(p.z).toBeLessThan(30)
  })

  it('pressed against a wall, it cranes up over the mech and fades it: never inside its back', () => {
    const g = flat()
    for (let cx = 0; cx < 32; cx++) g.h[14 * 32 + cx] = 6 // a wall across z 28..30
    const cam = makeCam(0)
    cam.pitch = 0
    // The mech's back a step from the wall.
    const p = placeCam(cam, g, 30, 0, 30.7, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    expect(cam.dist).toBeLessThan(CLOSE_DIST)
    expect(p.fade).toBeGreaterThan(0.5)
    // Clear of the mech's body: well over its head, or well to its side.
    const overHead = p.y - (2.25 + 0.3)
    const aside = Math.hypot(p.x - 30, p.z - 30.7)
    expect(overHead > 0.6 || aside > 1.1).toBe(true)
    // In open ground nothing fades.
    expect(placeCam(makeCam(0), flat(), 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60).fade).toBe(0)
  })

  it('looking up swings the view, not the arm: the camera stays off the floor', () => {
    const cam = makeCam(0)
    cam.pitch = PITCH_MAX
    const p = placeCam(cam, flat(), 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    expect(p.y).toBeGreaterThan(1.2)
    expect(Math.hypot(p.x - 30, p.z - 30)).toBeGreaterThan(FOLLOW_DIST * 0.8)
    expect(p.fade).toBe(0)
    // The view still looks up.
    expect(p.ty).toBeGreaterThan(p.y + 10)
  })

  it('pulls in at once and lets out gently', () => {
    const g = flat()
    for (let cx = 0; cx < 32; cx++) g.h[13 * 32 + cx] = 6
    const cam = makeCam(0)
    cam.pitch = 0
    placeCam(cam, g, 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    const tight = cam.dist
    expect(tight).toBeLessThan(2.2)
    const open = flat()
    placeCam(cam, open, 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    expect(cam.dist).toBeGreaterThan(tight)
    expect(cam.dist).toBeLessThan(FOLLOW_DIST - 1)
  })

  it('scoping the sniper puts the camera in the mech`s eye and narrows the lens', () => {
    const cam = makeCam(0)
    settle(cam, true)
    expect(cam.aim).toBe(1)
    const p = placeCam(cam, flat(), 30, 0, 30, 2.25, 'sniper', BASE, SCOPE, 1 / 60)
    expect(p.x).toBeCloseTo(30)
    expect(p.z).toBeCloseTo(30)
    expect(p.y).toBeCloseTo(2.25)
    expect(p.fov).toBe(SCOPE)
    expect(p.inside).toBe(1)
  })

  it('the loud weapons aim over the shoulder with the mech on screen', () => {
    for (const weapon of ['minigun', 'rocket'] as const) {
      const cam = makeCam(0)
      cam.pitch = 0
      settle(cam, true)
      const g = flat()
      for (let i = 0; i < 120; i++) placeCam(cam, g, 30, 0, 30, 2.25, weapon, BASE, SCOPE, 1 / 60)
      const p = placeCam(cam, g, 30, 0, 30, 2.25, weapon, BASE, SCOPE, 1 / 60)
      expect(p.inside).toBe(0)
      expect(p.z).toBeLessThan(29)
      expect(p.z).toBeGreaterThan(30 - FOLLOW_DIST * 0.6)
      // To the mech's right, which is −x when it faces +z.
      expect(p.x).toBeLessThan(29.6)
      expect(p.fov).toBeLessThan(BASE)
      expect(p.fov).toBeGreaterThan(SCOPE)
    }
  })

  it('raising a loud weapon never moves what is under the crosshair (#80)', () => {
    for (const weapon of ['minigun', 'rocket'] as const) {
      for (const pitch of [-0.6, -0.18, 0, 0.5, 0.9, PITCH_MAX]) {
        const g = flat()
        const cam = makeCam(0.7)
        cam.pitch = pitch
        // Let the arm settle first.
        for (let i = 0; i < 200; i++) placeCam(cam, g, 30, 0, 30, 2.25, weapon, BASE, SCOPE, 1 / 60)
        const from = placeCam(cam, g, 30, 0, 30, 2.25, weapon, BASE, SCOPE, 1 / 60)
        for (let i = 0; i < 40; i++) {
          stepCam(cam, true, 1 / 60)
          const p = placeCam(cam, g, 30, 0, 30, 2.25, weapon, BASE, SCOPE, 1 / 60)
          // The camera only ever moves along its own line of sight.
          const f = camForward(cam)
          const dx = p.x - from.x
          const dy = p.y - from.y
          const dz = p.z - from.z
          const along = dx * f.x + dy * f.y + dz * f.z
          const off = Math.hypot(dx - f.x * along, dy - f.y * along, dz - f.z * along)
          expect(off).toBeLessThan(1e-6)
          expect(along).toBeGreaterThanOrEqual(-1e-6)
        }
      }
    }
  })

  it('lowering the weapon returns to the follow view', () => {
    const cam = makeCam(0)
    settle(cam, true)
    settle(cam, false)
    expect(cam.aim).toBe(0)
  })
})
