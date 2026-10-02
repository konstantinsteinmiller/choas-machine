import { describe, expect, it } from 'vitest'
import { KILLCAM_GAP_S, RATE_HEADSHOT, RATE_OTHER, makeKillCamState, wantsKillCam, type KillInfo } from '@/game/sim/killcam'
import {
  DROP_FROM, DROP_HEIGHT, DROP_LANDED, bulletAlong, bulletAt, bulletCam, bulletFlightS, dropHeight, introCam, liftHeight,
  makeCinePose, orbitCam, outroCam, type CinePose
} from '@/game/sim/cine'

const kill = (over: Partial<KillInfo> = {}): KillInfo => ({ by: 'sniper', head: true, final: false, time: 100, ...over })

describe('the kill-cam director', () => {
  it('always shows the first headshot of a mission', () => {
    const s = makeKillCamState()
    expect(wantsKillCam(s, kill(), 0.99, true)).toBe(true)
    expect(s.shown).toBe(1)
  })

  it('shows about half of the later headshots and about a fifth of other kills', () => {
    const rate = (info: Partial<KillInfo>): number => {
      let shown = 0
      const n = 4000
      for (let i = 0; i < n; i++) {
        const s = makeKillCamState()
        s.headshots = 3
        if (wantsKillCam(s, kill(info), (i + 0.5) / n, true)) shown++
      }
      return shown / n
    }
    expect(rate({})).toBeCloseTo(RATE_HEADSHOT, 2)
    expect(rate({ head: false })).toBeCloseTo(RATE_OTHER, 2)
    expect(rate({ by: 'blade', head: false })).toBeCloseTo(RATE_OTHER, 2)
    expect(rate({ by: 'minigun', head: true })).toBeCloseTo(RATE_OTHER, 2)
  })

  it('never shows two within five seconds, unless the second completes the objective', () => {
    const s = makeKillCamState()
    expect(wantsKillCam(s, kill({ time: 10 }), 0, true)).toBe(true)
    expect(wantsKillCam(s, kill({ time: 10 + KILLCAM_GAP_S - 0.1 }), 0, true)).toBe(false)
    expect(wantsKillCam(s, kill({ time: 10 + KILLCAM_GAP_S + 0.1 }), 0, true)).toBe(true)
    expect(wantsKillCam(s, kill({ time: 16, final: true }), 0.99, true)).toBe(true)
  })

  it('shows nothing once it is switched off, and still counts the headshot', () => {
    const s = makeKillCamState()
    expect(wantsKillCam(s, kill(), 0, false)).toBe(false)
    expect(wantsKillCam(s, kill({ final: true }), 0, false)).toBe(false)
    expect(s.headshots).toBe(2)
    expect(s.shown).toBe(0)
  })
})

describe('the scripted shots', () => {
  const finite = (p: CinePose): boolean => [p.x, p.y, p.z, p.tx, p.ty, p.tz, p.fov].every(Number.isFinite)

  it('the bullet leaves the barrel, hangs in the middle of its flight, and arrives', () => {
    expect(bulletAlong(0)).toBe(0)
    expect(bulletAlong(1)).toBe(1)
    // Slowest in the middle: a tenth of the time there covers far less than a tenth of the way.
    expect(bulletAlong(0.55) - bulletAlong(0.45)).toBeLessThan(0.02)
    expect(bulletAlong(0.1) - bulletAlong(0)).toBeGreaterThan(0.2)
    let last = -1
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const a = bulletAlong(k)
      expect(a).toBeGreaterThanOrEqual(last)
      last = a
    }
    const end = bulletAt(1, 0, 2, 0, 10, 3, 40)
    expect([end.x, end.y, end.z]).toEqual([10, 3, 40])
  })

  it('a longer shot takes longer on screen, within limits', () => {
    expect(bulletFlightS(5)).toBe(bulletFlightS(20))
    expect(bulletFlightS(70)).toBeGreaterThan(bulletFlightS(45))
    expect(bulletFlightS(500)).toBeLessThanOrEqual(2.1)
  })

  it('the chase camera stays behind the bullet and looks where it is going', () => {
    const p = makeCinePose()
    for (let k = 0; k <= 1.0001; k += 0.1) {
      bulletCam(p, k, 0, 2, 0, 0, 2, 60, 60)
      const b = bulletAt(k, 0, 2, 0, 0, 2, 60)
      expect(finite(p)).toBe(true)
      expect(p.z).toBeLessThan(b.z)
      expect(b.z - p.z).toBeLessThan(3)
      expect([p.tx, p.ty, p.tz]).toEqual([0, 2, 60])
      expect(p.fov).toBeLessThan(60)
    }
  })

  it('the mech hangs under the ship, falls, and is down before the camera comes in', () => {
    expect(dropHeight(0)).toBe(DROP_HEIGHT)
    expect(dropHeight(DROP_FROM)).toBe(DROP_HEIGHT)
    expect(dropHeight(DROP_LANDED)).toBe(0)
    expect(dropHeight(1)).toBe(0)
    const mid = dropHeight((DROP_FROM + DROP_LANDED) / 2)
    // It gathers speed: half-way through the fall it has covered a quarter of it.
    expect(mid).toBeCloseTo(DROP_HEIGHT * 0.75, 5)
  })

  it('the drop-in ends exactly on the follow camera, so control starts without a cut', () => {
    const follow: CinePose = { x: 5, y: 9, z: 60, tx: 30, ty: 8, tz: 30, fov: 60 }
    const p = makeCinePose()
    introCam(p, 0, 9, 8, 65, -2.36, 40, 40, follow)
    expect(finite(p)).toBe(true)
    // It starts wide: well away from where the follow camera sits.
    expect(Math.hypot(p.x - follow.x, p.y - follow.y, p.z - follow.z)).toBeGreaterThan(10)
    introCam(p, 1, 9, 8, 65, -2.36, 40, 40, follow)
    for (const key of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'fov'] as const) expect(p[key]).toBeCloseTo(follow[key], 6)
  })

  it('the line takes the mech up and the camera backs away', () => {
    expect(liftHeight(0)).toBe(0)
    expect(liftHeight(0.3)).toBe(0)
    expect(liftHeight(1)).toBeGreaterThan(15)
    const a = makeCinePose()
    const b = makeCinePose()
    outroCam(a, 0, 10, 0, 10, 0, 60)
    outroCam(b, 1, 10, 0, 10, 0, 60)
    expect(Math.hypot(b.x - 10, b.z - 10)).toBeGreaterThan(Math.hypot(a.x - 10, a.z - 10))
    expect(b.ty).toBeGreaterThan(a.ty + 10)
  })

  it('an orbit keeps its distance and its target', () => {
    const p = makeCinePose()
    for (let t = 0; t < 3; t += 0.25) {
      orbitCam(p, t, 4, 1, 7, 0.3, 3.5, 0.6, 0.7, 40)
      expect(Math.hypot(p.x - 4, p.z - 7)).toBeCloseTo(3.5, 6)
      expect([p.tx, p.ty, p.tz]).toEqual([4, 1, 7])
    }
  })
})
