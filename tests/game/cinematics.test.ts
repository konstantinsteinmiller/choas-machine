import { describe, expect, it } from 'vitest'
import { KILLCAM_GAP_S, QUICK_S, chooseKillCam, killScore, makeKillCamState, wantsKillCam, type KillInfo } from '@/game/sim/killcam'
import {
  DROP_FROM, DROP_HEIGHT, DROP_LANDED, bulletAlong, bulletAt, bulletCam, bulletFlightS, dropHeight, introCam, liftHeight,
  makeCinePose, orbitCam, outroCam, type CinePose
} from '@/game/sim/cine'

const kill = (over: Partial<KillInfo> = {}): KillInfo => ({ by: 'sniper', head: true, final: false, time: 100, ...over })

describe('the kill-cam director (R27)', () => {
  it("the first headshot of a player's life is always shown in full, whatever the dice", () => {
    const s = makeKillCamState()
    expect(chooseKillCam(s, kill({ firstOfLife: true, dist: 5 }), 0.999, true)).toBe('full')
    expect(s.shown).toBe(1)
  })

  it("a boss's last blow, if a headshot, gets its own orbit; the objective's last headshot is always shown", () => {
    expect(chooseKillCam(makeKillCamState(), kill({ boss: true, final: true }), 0.999, true)).toBe('boss')
    expect(chooseKillCam(makeKillCamState(), kill({ final: true }), 0.999, true)).toBe('full')
  })

  it('a better shot is likelier shown: far, moving, in the head', () => {
    const rate = (info: Partial<KillInfo>): number => {
      let shown = 0
      const n = 2000
      for (let i = 0; i < n; i++) {
        const s = makeKillCamState()
        s.headshots = 3
        if (wantsKillCam(s, kill(info), (i + 0.5) / n, true)) shown++
      }
      return shown / n
    }
    const great = rate({ dist: 45, moving: 1, zone: 'head' })
    const plain = rate({ dist: 8, moving: 0, head: false, zone: 'body' })
    expect(great).toBeGreaterThan(plain * 2)
    expect(killScore(kill({ dist: 45, moving: 1 }))).toBeGreaterThan(killScore(kill({ dist: 45, moving: 0 })))
    expect(killScore(kill({ head: false, zone: 'limb' }))).toBeLessThan(killScore(kill({ head: false, zone: 'body' })))
  })

  it('after two kills in quick succession: a short cam for a good one, none for a plain one', () => {
    const quick = (info: Partial<KillInfo>): string => {
      const s = makeKillCamState()
      chooseKillCam(s, kill({ time: 10, head: false, zone: 'body' }), 0.999, true)
      chooseKillCam(s, kill({ time: 11, head: false, zone: 'body' }), 0.999, true)
      return chooseKillCam(s, kill({ time: 12.5, ...info }), 0, true)
    }
    expect(quick({ dist: 45, moving: 1 })).toBe('short')
    expect(quick({ head: false, zone: 'limb', dist: 4 })).toBe('none')
    expect(QUICK_S).toBeGreaterThan(3)
  })

  it('never two full cams within five seconds, unless the second completes the objective', () => {
    const s = makeKillCamState()
    expect(chooseKillCam(s, kill({ time: 10, dist: 50, moving: 1 }), 0, true)).toBe('full')
    expect(chooseKillCam(s, kill({ time: 10 + KILLCAM_GAP_S + 3, dist: 50, moving: 1 }), 0, true)).toBe('full')
    const t = makeKillCamState()
    expect(chooseKillCam(t, kill({ time: 10, dist: 50 }), 0, true)).toBe('full')
    expect(chooseKillCam(t, kill({ time: 10 + KILLCAM_GAP_S - 0.5, dist: 50 }), 0, true)).toBe('none')
    expect(chooseKillCam(t, kill({ time: 15, final: true }), 0.99, true)).toBe('full')
  })

  it('only stealth headshots and weak-spot hits get a camera (#85)', () => {
    const cut = (info: Partial<KillInfo>): string => chooseKillCam(makeKillCamState(), kill({ dist: 50, moving: 1, final: true, ...info }), 0, true)
    // A person: only the rifle to the head.
    expect(cut({ kind: 'human', stealth: true })).toBe('full')
    expect(cut({ kind: 'human', stealth: true, head: false, zone: 'body' })).toBe('none')
    expect(cut({ kind: 'human', stealth: true, by: 'minigun', head: false })).toBe('none')
    expect(cut({ kind: 'human', stealth: true, by: 'blade', head: false })).toBe('none')
    // A machine: a round in its weak spot.
    expect(cut({ kind: 'machine', stealth: true, head: false, zone: 'weak' })).toBe('full')
    expect(cut({ kind: 'machine', stealth: true, head: false, zone: 'joint' })).toBe('full')
    expect(cut({ kind: 'machine', stealth: true, head: false, zone: 'other' })).toBe('none')
    // A lamp never; a loud raid never.
    expect(cut({ kind: 'light', stealth: true, head: false, zone: 'other' })).toBe('none')
    expect(cut({ kind: 'human', stealth: false })).toBe('none')
    expect(cut({ kind: 'machine', stealth: false, head: false, zone: 'weak' })).toBe('none')
    // A boss: its orbit for a headshot even in a fight, nothing for anything else.
    expect(cut({ kind: 'human', boss: true, stealth: false })).toBe('boss')
    expect(cut({ kind: 'human', boss: true, stealth: false, head: false, zone: 'body' })).toBe('none')
    expect(cut({ kind: 'machine', boss: true, stealth: false, head: false, zone: 'weak', by: 'rocket' })).toBe('none')
  })

  it('shows nothing once it is switched off, and still counts the headshot', () => {
    const s = makeKillCamState()
    expect(chooseKillCam(s, kill(), 0, false)).toBe('none')
    expect(chooseKillCam(s, kill({ final: true, boss: true }), 0, false)).toBe('none')
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
