// #181: a surveillance drone is the base's sharpest ears. It hears a rifle
// shot, where its round lands and a teammate going down from 25 m off, works
// out exactly where the shot was fired from and races there; sure of the mech
// at that spot, it raises the alarm at once (no uplink to shoot it during).
// It finds bodies all round it, not only in its pool, and calls its
// teammates; and it flies along with any teammate near it who goes to look.

import { describe, expect, it } from 'vitest'
import { FortressBuilder } from '@/game/world/fortress'
import { cellMid } from '@/game/world/grid'
import {
  DRONE_BODY_M, DRONE_HEAR_M, estimateShot, hearAt, killUnit, makeGarrison, shotPassed, spotCentre, stepGarrison, type Target
} from '@/game/sim/garrison'

const DT = 1 / 30

/** An open yard: a drone hovering on a short loop, a guard, and a far guard. */
const yard = (droneAt: [number, number], guardAt: [number, number] = [40, 40]) => {
  const b = new FortressBuilder('t', 60, 60)
  b.ground(0, 0, 59, 59).insert(1, 1).extract(58, 58)
  b.drone([[droneAt[0], droneAt[1]], [droneAt[0] + 1, droneAt[1]]], 6)
  b.guard([guardAt], 0)
  const f = b.build()
  const gar = makeGarrison(f, 2)
  const drone = gar.units.find(u => u.kind === 'drone')!
  const guard = gar.units.find(u => u.kind === 'guard')!
  return { f, gar, drone, guard }
}

const hidden = (x: number, z: number): Target => ({ x, y: 0, z, height: 2.6, crouched: true, visible: false })
const standing = (x: number, z: number): Target => ({ x, y: 0, z, height: 2.6, crouched: false, visible: true })

/** A rifle round fired from (sx, sz) landing at (hx, hz). */
const fire = (gar: ReturnType<typeof yard>['gar'], t: Target, sx: number, sz: number, hx: number, hz: number): void => {
  const from = estimateShot(gar, sx, 2, sz, hx, hz)
  shotPassed(gar, t, from, sx, 2, sz, hx, 0.5, hz, 1.5, 4)
}

describe('a drone hears a shot far off and knows where it came from (#181)', () => {
  it(`inside ${DRONE_HEAR_M} m of the shooter it flies to the very spot; further off it does not hear it`, () => {
    const { gar, drone } = yard([20, 20])
    const sx = drone.x + 20
    const sz = drone.z
    // The round lands far from the drone too: only the shot itself is near it.
    fire(gar, hidden(sx, sz), sx, sz, sx + 30, sz + 30)
    expect(drone.state).toBe('suspicious')
    expect(drone.hunt).toBe(2)
    // Exactly the shooter's spot, not the base's rough guess.
    expect(drone.seenX).toBeCloseTo(sx, 6)
    expect(drone.seenZ).toBeCloseTo(sz, 6)

    const far = yard([20, 20])
    const fx = far.drone.x + DRONE_HEAR_M + 4
    fire(far.gar, hidden(fx, far.drone.z), fx, far.drone.z, fx + 30, far.drone.z + 30)
    expect(far.drone.state).toBe('patrol')
  })

  it('a guard sniped near it sends it to the shooter, though the shot was fired from far away', () => {
    const { f, gar, drone, guard } = yard([20, 20], [27, 20])
    const sx = cellMid(2)
    const sz = cellMid(2)
    expect(Math.hypot(sx - drone.x, sz - drone.z)).toBeGreaterThan(DRONE_HEAR_M)
    expect(Math.hypot(guard.x - drone.x, guard.z - drone.z)).toBeLessThan(DRONE_HEAR_M)
    const from = estimateShot(gar, sx, 2, sz, guard.x, guard.z)
    shotPassed(gar, hidden(sx, sz), from, sx, 2, sz, guard.x, 1.5, guard.z, 1.5, 4, guard.id)
    killUnit(gar, guard.id, sx, sz, 'shot')
    expect(drone.state).toBe('suspicious')
    expect(drone.seenX).toBeCloseTo(sx, 6)
    // The thud that follows does not turn it from the shooter to the body.
    for (let k = 0; k < 30; k++) stepGarrison(gar, f.grid, hidden(sx, sz), DT)
    expect(drone.seenX).toBeCloseTo(sx, 6)
  })
})

describe('on a shot\'s hunt, sure of the mech, the alarm rings at once (#181)', () => {
  it('it races there over what is on its line, and raises the alarm with no uplink; on its round it uplinks as before', () => {
    const { f, gar, drone } = yard([20, 20])
    const sx = drone.x + 18
    const sz = drone.z
    fire(gar, standing(sx, sz), sx, sz, sx + 30, sz + 30)
    let t = 0
    while (t < 12 && !gar.alert.chaos) { stepGarrison(gar, f.grid, standing(sx, sz), DT); t += DT }
    expect(gar.alert.chaos).toBe(true)
    // 18 m at hunting pace (3.6 m/s) and under a second to be sure: well inside 9 s.
    expect(t).toBeLessThan(9)
    expect(drone.uplinkT).toBe(0)

    // The same drone on its round, the mech walking into its light: the uplink, the player's moment.
    const calm = yard([20, 20])
    const c = calm.drone
    let up = false
    for (let k = 0; k < 90 && !calm.gar.alert.chaos; k++) {
      const s = spotCentre(c)
      stepGarrison(calm.gar, calm.f.grid, standing(s.x, s.z), DT)
      if (c.uplinkT > 0) up = true
    }
    expect(up).toBe(true)
    expect(c.hunt).toBe(0)
  })
})

describe('a drone finds bodies all round it and tells its teammates (#181)', () => {
  it(`a body ${DRONE_BODY_M - 2} m off, outside its pool: found, the drone looks, the guards near it are called`, () => {
    const b = new FortressBuilder('t', 60, 60)
    b.ground(0, 0, 59, 59).insert(1, 1).extract(58, 58)
    b.drone([[20, 20], [21, 20]], 6)
    // The victim behind the drone (its light points ahead), and a guard a few cells on.
    b.guard([[20, 16]], 0).guard([[24, 16]], Math.PI)
    const f = b.build()
    const gar = makeGarrison(f, 2)
    const drone = gar.units.find(u => u.kind === 'drone')!
    const [victim, mate] = gar.units.filter(u => u.kind === 'guard')
    killUnit(gar, victim!.id, victim!.x, victim!.z, 'blade')
    // Far enough that the guard beside it does not hear the thud itself.
    const t = hidden(cellMid(2), cellMid(2))
    for (let k = 0; k < 90; k++) stepGarrison(gar, f.grid, t, DT)
    expect(victim!.found).toBe(true)
    expect(gar.bodiesFound).toBe(1)
    expect(drone.state).not.toBe('patrol')
    expect(mate!.state).not.toBe('patrol')
  })
})

describe('a drone flies along with a teammate who goes to look (#181)', () => {
  it('a guard within earshot hears something: the drone goes there too, fast; a guard far off does not call it', () => {
    const { gar, drone, guard } = yard([20, 20], [28, 20])
    hearAt(gar, guard.x + 2, guard.z, 5)
    expect(guard.state).toBe('suspicious')
    expect(drone.state).toBe('suspicious')
    expect(drone.hunt).toBe(1)

    const far = yard([20, 20], [45, 45])
    hearAt(far.gar, far.guard.x + 2, far.guard.z, 5)
    expect(far.guard.state).toBe('suspicious')
    expect(far.drone.state).toBe('patrol')
  })
})

describe('more drones in every fortress (#181)', () => {
  it('every map has one more drone than before at every threat level, and every fortress has one from its first raid', async () => {
    const { buildBastion } = await import('@/game/data/fortresses/bastion')
    const { buildFoundry } = await import('@/game/data/fortresses/foundry')
    const { buildHarbour } = await import('@/game/data/fortresses/harbour')
    const { buildSpire } = await import('@/game/data/fortresses/spire')
    const drones = (f: { posts: ReadonlyArray<{ kind: string }> }): number => f.posts.filter(p => p.kind === 'drone').length
    // Before #181: Bastion II 1, III 2; Foundry 0/1/2; Harbour 0/1/1; Spire 0/1/1.
    // The Sea Fort (Bastion II) gave its second back: a playtester on a tablet gave up there.
    expect([2, 3].map(l => drones(buildBastion(l)))).toEqual([1, 3])
    expect([1, 2, 3].map(l => drones(buildFoundry(l)))).toEqual([1, 2, 3])
    expect([1, 2, 3].map(l => drones(buildHarbour(l)))).toEqual([1, 2, 2])
    expect([1, 2, 3].map(l => drones(buildSpire(l)))).toEqual([1, 2, 2])
  })
})
