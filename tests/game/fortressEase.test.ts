import { describe, expect, it } from 'vitest'
import { EASE_FLOOR, easeFortress } from '@/game/data/fortresses/ease'
import { loadFortress } from '@/game/data/fortresses/registry'
import type { Fortress, Post } from '@/game/world/fortress'

// The rubber band: each death at a fortress since the last win there takes a
// human guard and a surveillance drone out of the next attempt, never below
// 60 % of its enemies; a win (deaths back to 0) is the full fortress again.

const enemies = (f: Fortress) => f.posts.filter(p => p.kind !== 'searchlight' && !p.dummy).length
const count = (f: Fortress, want: (p: Post) => boolean) => f.posts.filter(want).length
const human = (p: Post) => (p.kind === 'guard' || p.kind === 'sentry') && !p.boss
const drone = (p: Post) => p.kind === 'drone'

describe('the rubber band (ease.ts)', async () => {
  const forts = await Promise.all((['bastion', 'foundry', 'harbour', 'spire'] as const).map(id => loadFortress(id, 3, 0)))

  it('no deaths since the last win: the fortress at full strength', () => {
    for (const f of forts) expect(easeFortress(f, 0)).toBe(f)
  })

  it('one death: one human guard and one drone fewer', () => {
    for (const f of forts) {
      const e = easeFortress(f, 1)
      expect(count(f, human) - count(e, human), f.id).toBe(1)
      expect(count(f, drone) - count(e, drone), f.id).toBe(count(f, drone) > 0 ? 1 : 0)
    }
  })

  it('never below 60 % of the enemies, and no boss ever goes', () => {
    for (const f of forts) {
      for (const deaths of [2, 5, 50]) {
        const e = easeFortress(f, deaths)
        expect(enemies(e), `${f.id} ×${deaths}`).toBeGreaterThanOrEqual(Math.ceil(enemies(f) * EASE_FLOOR))
        expect(e.posts.filter(p => p.boss).length).toBe(f.posts.filter(p => p.boss).length)
      }
      // Enough deaths reach the floor exactly when there are guards and drones to give.
      expect(enemies(easeFortress(f, 50))).toBeLessThan(enemies(f))
    }
  })

  it('chat partners still point at each other after the posts move up', () => {
    for (const f of forts) {
      const e = easeFortress(f, 3)
      e.posts.forEach((p, i) => {
        if (p.partner === undefined) return
        expect(e.posts[p.partner], f.id).toBeDefined()
        expect(e.posts[p.partner]!.partner, f.id).toBe(i)
      })
    }
  })

  it('leaves the built fortress untouched (a fresh copy is eased)', () => {
    const f = forts[0]!
    const before = f.posts.length
    easeFortress(f, 4)
    expect(f.posts.length).toBe(before)
  })
})
