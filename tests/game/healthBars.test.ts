// #74, a playtest: the machines showed no bar while the mech shot at them or
// the alarm rang. A struck machine keeps its bar while it lives; under the
// alarm every machine has one; a guard's rule is as it was.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison, killUnit, type Unit } from '@/game/sim/garrison'
import { barRank, isMachine, BAR_FAR_M, BAR_NEAR_M, BAR_MACHINE_FAR_M } from '@/game/sim/healthBars'

const base = () => {
  const b = new FortressBuilder('t', 32, 32)
  b.ground(0, 0, 31, 31)
  b.insert(1, 1).extract(30, 30)
  b.guard([[8, 8]], 0)
    .roomba([[12, 8]], 0)
    .hound([[16, 8]], 0)
    .drone([[20, 8]])
    .searchlight(24, 8, [[24, 12]])
    .searchlight(26, 8, [[26, 12]], true)
    .sentry(28, 8, 0)
  return makeGarrison(b.build(), 1)
}
const pick = (units: Unit[], kind: Unit['kind'], n = 0): Unit => units.filter(u => u.kind === kind)[n]!
const none = new Set<number>()
/** Between the near ring and the far one: a guard here shows a bar only when hurt, tagged or fighting. */
const MID = (BAR_NEAR_M + BAR_FAR_M) / 2
/** Past a guard's far ring, within a struck machine's. */
const FAR = (BAR_FAR_M + BAR_MACHINE_FAR_M) / 2

describe('machine health bars', () => {
  it('knows the machines from the people', () => {
    const gar = base()
    expect(isMachine(pick(gar.units, 'guard'))).toBe(false)
    expect(isMachine(pick(gar.units, 'sentry'))).toBe(false)
    for (const k of ['roomba', 'hound', 'drone', 'searchlight'] as const) expect(isMachine(pick(gar.units, k))).toBe(true)
  })

  it('a machine the mech struck has its bar, far off, unhurt, first in line', () => {
    const gar = base()
    for (const k of ['roomba', 'hound', 'drone', 'searchlight'] as const) {
      const u = pick(gar.units, k)
      expect(barRank(u, FAR, false, none)).toBe(-1)
      expect(barRank(u, MID, false, none)).toBe(-1)
      const struck = new Set([u.id])
      expect(barRank(u, MID, false, struck)).toBe(0)
      expect(barRank(u, FAR, false, struck)).toBe(0)
      expect(barRank(u, BAR_MACHINE_FAR_M + 1, false, struck)).toBe(-1)
    }
  })

  it('under the alarm every living machine has its bar; it goes with the machine', () => {
    const gar = base()
    for (const k of ['roomba', 'hound', 'drone', 'searchlight'] as const) {
      const u = pick(gar.units, k)
      expect(barRank(u, FAR, true, none)).toBe(1)
    }
    const r = pick(gar.units, 'roomba')
    killUnit(gar, r.id, 0, 0)
    expect(barRank(r, MID, true, new Set([r.id]))).toBe(-1)
  })

  it('a lamp that cannot be put out gets no bar for the alarm', () => {
    const gar = base()
    const caged = pick(gar.units, 'searchlight', 1)
    expect(caged.caged).toBe(true)
    expect(barRank(caged, FAR, true, new Set([caged.id]))).toBe(-1)
  })

  it('a guard keeps its rule: near, hurt, tagged or fighting, within the far ring, alarm or not', () => {
    const gar = base()
    for (const g of [pick(gar.units, 'guard'), pick(gar.units, 'sentry')]) {
      const struck = new Set([g.id])
      for (const alarm of [false, true]) {
        expect(barRank(g, BAR_NEAR_M - 1, alarm, struck)).toBe(1)
        expect(barRank(g, MID, alarm, struck)).toBe(-1)
        g.hp = g.maxHp - 1
        expect(barRank(g, MID, alarm, struck)).toBe(1)
        expect(barRank(g, FAR, alarm, struck)).toBe(-1)
        g.hp = g.maxHp
        g.state = 'combat'
        expect(barRank(g, MID, alarm, struck)).toBe(1)
        expect(barRank(g, FAR, alarm, struck)).toBe(-1)
        g.state = 'patrol'
      }
    }
  })
})
