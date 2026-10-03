// R25: bosses prepared for in stealth, and their phases and tells.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  DASH_DAMAGE, GLINT_S, cutRig, drainEvents, makeGarrison, stepGarrison, type GarrisonEvent, type Target
} from '@/game/sim/garrison'
import { OVERHEAT_AFTER, SELF_SHELL, stepFire } from '@/game/sim/chaos'
import { buildBastion } from '@/game/data/fortresses/bastion'

const DT = 1 / 30
const yard = (): FortressBuilder => {
  const b = new FortressBuilder('t', 50, 50)
  b.ground(0, 0, 49, 49).insert(1, 1).extract(48, 48)
  return b
}
const at = (cx: number, cz: number, extra: Partial<Target> = {}): Target => ({
  x: cellMid(cx), y: 0, z: cellMid(cz), height: 2.6, crouched: false, visible: true, ...extra
})
type G = ReturnType<typeof makeGarrison>
type F = ReturnType<FortressBuilder['build']>
const run = (gar: G, f: F, t: Target, s: number, each?: () => void): GarrisonEvent[] => {
  const all: GarrisonEvent[] = []
  for (let k = 0; k < s / DT; k++) {
    stepGarrison(gar, f.grid, t, DT)
    stepFire(gar, f.grid, t, DT)
    all.push(...drainEvents(gar))
    each?.()
  }
  return all
}

describe('the Warden', () => {
  it('cutting the generator takes the power from his shield', () => {
    const b = yard()
    b.commander([[20, 20], [24, 20]], 0, { shield: true })
    b.generator(30, 30)
    const f = b.build()
    const gar = makeGarrison(f, 4)
    const w = gar.units[0]!
    expect(w.shield).toBe(true)
    const k = gar.rigs.findIndex(r => r.kind === 'generator')
    expect(cutRig(gar, k)).toBe(true)
    expect(w.shield).toBe(false)
    expect(drainEvents(gar).some(e => e.type === 'shieldDown')).toBe(true)
    expect(cutRig(gar, k)).toBe(false)
  })

  it('past half health he drops the shield, glints, and dashes at the mech: a blow if it stands', () => {
    const b = yard()
    b.commander([[20, 20]], 0, { shield: true })
    const f = b.build()
    const gar = makeGarrison(f, 4)
    const w = gar.units[0]!
    w.hp = w.maxHp * 0.45
    w.detect = 1
    w.state = 'combat'
    const t = at(20, 25)
    const ev = run(gar, f, t, 8)
    expect(ev.some(e => e.type === 'phase')).toBe(true)
    expect(w.shield).toBe(false)
    const glint = ev.findIndex(e => e.type === 'glint')
    expect(glint).toBeGreaterThanOrEqual(0)
    const blow = ev.find(e => e.type === 'fire' && e.id === 0 && e.damage >= DASH_DAMAGE * 0.5)
    expect(blow).toBeDefined()
    expect(GLINT_S).toBeGreaterThan(0.4)
  })

  it('a mech that steps aside after the glint is not hit by the dash', () => {
    const b = yard()
    b.commander([[20, 20]], 0)
    const f = b.build()
    const gar = makeGarrison(f, 2)
    const w = gar.units[0]!
    w.hp = w.maxHp * 0.4
    w.detect = 1
    w.state = 'combat'
    const t = at(20, 25)
    let moved = false
    const ev = run(gar, f, t, 3, () => {
      if (!moved && w.glintT > 0) { t.x += 5; moved = true }
    })
    expect(moved).toBe(true)
    expect(ev.filter(e => e.type === 'fire' && e.id === 0 && e.damage >= DASH_DAMAGE * 0.5)).toHaveLength(0)
  })
})

describe('the Foreman', () => {
  it('jammed on its pad, it wakes slower and turns slower', () => {
    const wakeTime = (jam: boolean): number => {
      const b = yard()
      b.enforcer(20, 20, 0, true)
      const f = b.build()
      const gar = makeGarrison(f, 2)
      const k = gar.rigs.findIndex(r => r.kind === 'servo')
      expect(k).toBeGreaterThanOrEqual(0)
      if (jam) cutRig(gar, k)
      const u = gar.units[0]!
      u.state = 'combat'
      u.power = 0
      let t = 0
      while (u.power < 1 && t < 20) { stepGarrison(gar, f.grid, at(40, 40, { visible: false }), DT); t += DT }
      return t
    }
    expect(wakeTime(true)).toBeGreaterThan(wakeTime(false) * 2)
  })
})

describe('the Goliath', () => {
  const tank = (): { f: F; gar: G } => {
    const b = yard()
    b.goliath(25, 25, 0)
    const f = b.build()
    const gar = makeGarrison(f, 3)
    const u = gar.units[0]!
    u.state = 'combat'
    u.power = 1
    u.detect = 1
    return { f, gar }
  }

  it('three shells and it overheats: quiet, its vents swung round toward the mech', () => {
    const { f, gar } = tank()
    const u = gar.units[0]!
    const t = at(25, 35)
    const ev = run(gar, f, t, 40, () => { t.x = cellMid(25) + Math.sin(gar.time) * 3 })
    expect(ev.filter(e => e.type === 'shell').length).toBeGreaterThanOrEqual(OVERHEAT_AFTER)
    expect(ev.some(e => e.type === 'overheat')).toBe(true)
    // Mid-overheat, its rear points at the mech.
    const { f: f2, gar: g2 } = tank()
    const v = g2.units[0]!
    v.overheat = 4
    v.yaw = 0
    run(g2, f2, at(25, 35), 3)
    const toMech = Math.atan2(0, cellMid(35) - v.z)
    const rear = v.yaw + Math.PI
    expect(Math.abs(Math.atan2(Math.sin(rear - toMech), Math.cos(rear - toMech)))).toBeLessThan(0.5)
    void u
  })

  it('lured to shell a decoy at its own feet, it is hit by its own shell', () => {
    const { f, gar } = tank()
    const u = gar.units[0]!
    const hp = u.hp
    gar.lures = [{ x: u.x + 3, y: 0, z: u.z + 2 }]
    const ev = run(gar, f, at(45, 45, { visible: false }), 10)
    const self = ev.find(e => e.type === 'selfHit')
    expect(self).toBeDefined()
    expect(u.hp).toBeLessThanOrEqual(hp - Math.round(u.maxHp * SELF_SHELL) + 1)
  })
})

describe('the Bastion', () => {
  it('has the generator on the keep\'s roof, and a servo for the Foreman at level II', () => {
    const f = buildBastion(2)
    expect(f.generators?.length).toBe(1)
    const gar = makeGarrison(f, 2)
    expect(gar.rigs.some(r => r.kind === 'servo')).toBe(true)
  })
})
