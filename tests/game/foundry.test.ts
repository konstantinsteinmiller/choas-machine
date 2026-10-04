// R44: the Foundry (#93), built rooms first: seven rooms at three floor
// heights, each with two ways in or more (the hubs three), joined by halls
// with a bend so no sight line runs room to room; the base's picker opens it
// once the Bastion has fallen at threat III.

import { beforeEach, describe, expect, it } from 'vitest'
import { FOUNDRY_PAD as P, buildFoundry } from '@/game/data/fortresses/foundry'
import { CELL, cellHeight, cellMid, findHoles, findPath, hasLineOfSight } from '@/game/world/grid'
import { validateFortress } from '@/game/world/validate'
import { defaultProfile, profile } from '@/game/state/profile'
import { fortressOpen, levelKey, unlockedLevel } from '@/game/state/progress'
import { themeOf } from '@/game/data/themes'

/** The rooms in the 52 × 52 frame: [x0, z0, x1, z1], floor. */
const ROOMS = {
  bay: [2, 38, 11, 49, 0], smelt: [18, 36, 33, 49, 0], hangar: [39, 34, 49, 49, 0], vault: [2, 4, 13, 17, 4],
  hub: [19, 19, 32, 30, 4], pit: [41, 18, 49, 29, 0], core: [19, 2, 32, 12, 8]
} as const
type Room = keyof typeof ROOMS
const MASS = 25

describe('the Foundry', () => {
  const f = buildFoundry(3)
  const g = f.grid
  const h = (cx: number, cz: number): number => cellHeight(g, cx + P, cz + P)

  it('validates at every threat level, with its own look', () => {
    for (const l of [1, 2, 3, 4, 5]) {
      const x = buildFoundry(l)
      expect(findHoles(x.grid)).toEqual([])
      expect(validateFortress(x), `threat ${l}`).toEqual([])
    }
    expect(f.theme).toBe('foundry')
    expect(themeOf(f.theme).sky).not.toBe(themeOf('dusk').sky)
  })

  it('seven rooms at three floor heights', () => {
    const floors = new Set<number>()
    for (const [x0, z0, , , fl] of Object.values(ROOMS)) {
      expect(h(x0 + 1, z0 + 1)).toBe(fl)
      floors.add(fl)
    }
    expect(Object.keys(ROOMS)).toHaveLength(7)
    expect([...floors].sort()).toEqual([0, 4, 8])
  })

  it('every room has two ways in or more, the hubs three', () => {
    const ways = (room: Room): number => {
      const [x0, z0, x1, z1] = ROOMS[room]
      // Openings: runs of non-block cells along the outside of the room's edge, plus ladders up out of it.
      const ring: Array<[number, number]> = []
      for (let x = x0; x <= x1; x++) ring.push([x, z0 - 1], [x, z1 + 1])
      for (let z = z0; z <= z1; z++) ring.push([x0 - 1, z], [x1 + 1, z])
      const open = new Set(ring.filter(([x, z]) => h(x, z) < MASS - 1).map(([x, z]) => `${x},${z}`))
      // Group into openings (4-neighbours along the ring).
      let n = 0
      const seen = new Set<string>()
      for (const k of open) {
        if (seen.has(k)) continue
        n++
        const q = [k]
        seen.add(k)
        while (q.length) {
          const [x, z] = q.pop()!.split(',').map(Number) as [number, number]
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const kk = `${x + dx},${z + dz}`
            if (open.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(kk) }
          }
        }
      }
      // Ladders out of the room count as ways too.
      const ladders = g.ladders.filter(l => {
        const cx = l.cx - P
        const cz = l.cz - P
        return cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1 && cellHeight(g, l.cx + l.dx, l.cz + l.dz) > h(cx, cz) + 1 &&
          (l.cx + l.dx - P < x0 || l.cx + l.dx - P > x1 || l.cz + l.dz - P < z0 || l.cz + l.dz - P > z1)
      }).length
      return n + ladders
    }
    for (const room of Object.keys(ROOMS) as Room[]) {
      const want = room === 'smelt' || room === 'hub' ? 3 : 2
      expect(ways(room), room).toBeGreaterThanOrEqual(want)
    }
  })

  it('no sight line runs from one room into another', () => {
    const points = (room: Room): Array<[number, number, number]> => {
      const [x0, z0, x1, z1, fl] = ROOMS[room]
      const out: Array<[number, number, number]> = []
      for (const fx of [0.1, 0.5, 0.9]) {
        for (const fz of [0.1, 0.5, 0.9]) {
          const cx = Math.round(x0 + (x1 - x0) * fx) + P
          const cz = Math.round(z0 + (z1 - z0) * fz) + P
          out.push([cellMid(cx), fl + 2.2, cellMid(cz)])
        }
      }
      return out
    }
    const names = Object.keys(ROOMS) as Room[]
    const seen: string[] = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        for (const a of points(names[i]!)) {
          for (const b of points(names[j]!)) {
            if (hasLineOfSight(g, a[0], a[1], a[2], b[0], b[1], b[2])) seen.push(`${names[i]}→${names[j]}`)
          }
        }
      }
    }
    expect([...new Set(seen)]).toEqual([])
  })

  it('the guards of the ground floor can walk up to the hub and the vault by the stairs', () => {
    const c = (r: Room): [number, number] => {
      const [x0, z0, x1, z1] = ROOMS[r]
      return [Math.round((x0 + x1) / 2) + P, Math.round((z0 + z1) / 2) + P]
    }
    for (const r of ['hub', 'vault', 'core'] as const) {
      const [ax, az] = c('bay')
      const [bx, bz] = c(r)
      expect(findPath(g, ax, az, bx, bz, undefined, 20000).length, r).toBeGreaterThan(0)
    }
    void CELL
  })
})

describe('the picker opens the Foundry after the Bastion at threat III', () => {
  beforeEach(() => { Object.assign(profile, defaultProfile()) })
  it('locked, then open; its own threat levels from I', () => {
    expect(fortressOpen('bastion')).toBe(true)
    expect(fortressOpen('foundry')).toBe(false)
    for (const l of [1, 2]) profile.fortresses[levelKey(l)] = { clears: 1, medals: {} as never, bestScore: 10, bestTime: 60 }
    expect(fortressOpen('foundry')).toBe(false)
    profile.fortresses[levelKey(3)] = { clears: 1, medals: {} as never, bestScore: 10, bestTime: 60 }
    expect(fortressOpen('foundry')).toBe(true)
    expect(unlockedLevel('foundry')).toBe(1)
    expect(unlockedLevel('bastion')).toBe(4)
  })
})
