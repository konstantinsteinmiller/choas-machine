// #178: a body part's outline ring must never be cut off by the parts close
// behind it. Each outlined part carries a bias that draws its ring nearer the
// eye: big enough to win over a neighbour that comes close (or pokes through),
// small against the part's own thinnest side so the ring never covers its face.

import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { OUTLINE_BIAS_MAX, OUTLINE_BIAS_SHARE, type Rig } from '@/game/models/kit'
import { outlineMat } from '@/game/models/toon'
import { buildMech } from '@/game/models/mech'
import { buildDrone, buildEnforcer, buildGoliath, buildGuard, buildRoomba, buildSearchlight } from '@/game/models/garrison'
import { buildRobodog } from '@/game/models/robodog'
import { buildAirship } from '@/game/models/airship'

const RIGS: Record<string, () => Rig> = {
  mech: buildMech,
  guard: () => buildGuard(),
  commander: () => buildGuard(true),
  shield: () => buildGuard(false, true),
  drone: buildDrone,
  searchlight: buildSearchlight,
  roomba: () => buildRoomba(),
  enforcer: () => buildEnforcer(),
  goliath: buildGoliath,
  hound: () => buildRobodog(true),
  airship: buildAirship
}

const thinnest = (g: BufferGeometry): number => {
  g.computeBoundingBox()
  const b = g.boundingBox!
  return Math.min(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
}

describe('every rig\'s outline rings are drawn over the parts behind them (#178)', () => {
  for (const [name, build] of Object.entries(RIGS)) {
    it(name, () => {
      const rig = build()
      expect(rig.outline, name).not.toBeNull()
      const og = rig.outline!.geometry
      const bias = og.getAttribute('outlineBias')
      expect(bias, `${name}: the outline carries its bias`).toBeDefined()
      let lit = 0
      for (const p of rig.parts) {
        const b = p.geo.getAttribute('outlineBias')!.getX(0)
        if (!p.outline) { expect(b).toBe(0); continue }
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(OUTLINE_BIAS_MAX + 1e-9)
        // Never more than a share of the part's own thinnest side.
        expect(b).toBeLessThanOrEqual(thinnest(p.geo) * OUTLINE_BIAS_SHARE + 1e-6)
        if (b > 0.005) lit++
      }
      expect(lit, `${name}: most parts lift their ring`).toBeGreaterThan(0)
    })
  }
})

describe('the outline material', () => {
  it('lifts each ring along the line of sight, and a prop without a bias reads 0', () => {
    const m = outlineMat(0.02, undefined, true)
    expect(m.vertexShader).toContain('attribute float outlineBias')
    expect(m.vertexShader).toMatch(/mvPosition\.xyz -= normalize\(mvPosition\.xyz\) \* outlineBias/)
    expect((m as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues.outlineBias).toEqual([0])
  })
})
