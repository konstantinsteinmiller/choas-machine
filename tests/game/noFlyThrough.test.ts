// Nothing flies through solid walls (jam build): the drones on their rounds, the board on its way in and out.
import { describe, expect, it } from 'vitest'
import { buildBastion } from '@/game/data/fortresses/bastion'
import { buildFoundry } from '@/game/data/fortresses/foundry'
import { buildHarbour } from '@/game/data/fortresses/harbour'
import { buildSpire } from '@/game/data/fortresses/spire'
import { buildTrainingGround } from '@/game/data/fortresses/training'
import { findDeparture, makeDogFrame, makeRiderFrame, outroFrame, DOG_ARRIVE, RIDER_ON } from '@/game/sim/robodog'
import { hasLineOfSight, heightAt, type Grid } from '@/game/world/grid'
import type { Fortress } from '@/game/world/fortress'

const FORTS: Array<[string, () => Fortress]> = [
  ...[1, 2, 3].map(l => [`the Bastion at threat ${l}`, () => buildBastion(l)] as [string, () => Fortress]),
  ...[1, 2, 3].map(l => [`the Foundry at threat ${l}`, () => buildFoundry(l)] as [string, () => Fortress]),
  ...[1, 2, 3].map(l => [`the Harbour at threat ${l}`, () => buildHarbour(l)] as [string, () => Fortress]),
  ['the training ground', buildTrainingGround],
  ...[1, 2, 3].map(l => [`the Spire at threat ${l}`, () => buildSpire(l)] as [string, () => Fortress])
]

/** The highest floor or wall along a straight line (sampled every 0.5 m). */
const highest = (g: Grid, ax: number, az: number, bx: number, bz: number): number => {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5))
  let h = -Infinity
  for (let i = 0; i <= n; i++) h = Math.max(h, heightAt(g, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n))
  return h
}

describe('nothing flies through walls', () => {
  for (const [name, build] of FORTS) {
    it(`${name}: every drone flies above everything on its round`, () => {
      const f = build()
      for (const p of f.posts.filter(q => q.kind === 'drone')) {
        const stops = p.route.length ? p.route : [{ x: p.x, z: p.z }]
        for (let k = 0; k < stops.length; k++) {
          const a = stops[k]!
          const b = stops[(k + 1) % stops.length]!
          // The drone's body hangs at its altitude over the ground it starts from; a metre to spare.
          expect(highest(f.grid, a.x, a.z, b.x, b.z), `${name} drone ${a.x},${a.z} → ${b.x},${b.z}`).toBeLessThan(p.altitude - 1)
        }
      }
    })

    it(`${name}: the board's way out is clear from the extraction`, () => {
      const f = build()
      const x = f.extract.x
      const z = f.extract.z
      const y = heightAt(f.grid, x, z)
      const w = findDeparture(f.grid, x, y, z, 0)
      const dog = makeDogFrame()
      const rider = makeRiderFrame()
      let last: { x: number; y: number; z: number } | null = null
      for (let i = 0; i <= 120; i++) {
        const k = i / 120
        outroFrame(dog, rider, k, x, y, z, w.yaw, w.turn, w.reachIn, w.reachOut)
        if (last && dog.visible && (k < DOG_ARRIVE || k > RIDER_ON)) {
          expect(hasLineOfSight(f.grid, last.x, last.y + 0.5, last.z, dog.x, dog.y + 0.5, dog.z), `${name} at k ${k.toFixed(2)}`).toBe(true)
        }
        last = { x: dog.x, y: dog.y, z: dog.z }
      }
    })
  }
})
