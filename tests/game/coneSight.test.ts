// @vitest-environment jsdom
// A guard's sight cone, as drawn: each ray runs to the face of the first
// thing that hides the ground from the guard's eye (not a cell short of it),
// ground that shows past an obstacle is drawn again, and what is drawn is
// what the AI's own line of sight says. The marks over a unit sit above its
// model, and the cone travels with the drawn body instead of trailing it.

import { beforeAll, describe, expect, it } from 'vitest'
import { Box3, type BufferAttribute, type Mesh, type Sprite } from 'three'
import { CELL, VOID, addBox, addRoof, cellMid, hasLineOfSight, makeGrid, surfaceAt, toCell, type Grid } from '@/game/world/grid'
import { FortressBuilder } from '@/game/world/fortress'
import { makeGarrison } from '@/game/sim/garrison'
import { GarrisonView, sightSpans, type Span } from '@/game/sim/garrisonView'

const PROBE = 0.9

/** Flat ground, `w` × `d` cells at height 0. */
const flat = (w = 30, d = 30): Grid => {
  const g = makeGrid(w, d)
  g.h.fill(0)
  return g
}
const set = (g: Grid, cx: number, cz: number, h: number): void => { g.h[cz * g.w + cx] = h }

const spans = (g: Grid, ox: number, oz: number, eyeY: number, dx: number, dz: number, range: number, feetY = 0): Span[] => {
  const out: Span[] = []
  const n = sightSpans(g, ox, oz, feetY, eyeY, dx, dz, range, PROBE, out)
  return out.slice(0, n).map(s => ({ ...s }))
}

describe('a cone ray stops at the first face that hides the ground', () => {
  it('runs right up to a wall face, not short of it', () => {
    const g = flat()
    // A wall across x = cell 12 (its face at x = 24 m).
    for (let cz = 0; cz < 30; cz++) set(g, 12, cz, 4)
    const ox = cellMid(5) + 0.37
    const s = spans(g, ox, cellMid(10), 1.5, 1, 0, 30)
    expect(s.length).toBe(1)
    expect(s[0]!.t0).toBe(0)
    expect(s[0]!.t1).toBeCloseTo(12 * CELL - ox, 2)
  })

  it('an oblique ray meets the face where the face really is', () => {
    const g = flat()
    for (let cz = 0; cz < 30; cz++) set(g, 12, cz, 4)
    const ox = cellMid(5)
    const a = 0.6
    const s = spans(g, ox, cellMid(10), 1.5, Math.sin(a), Math.cos(a), 40)
    expect(s[0]!.t1).toBeCloseTo((12 * CELL - ox) / Math.sin(a), 2)
  })

  it('draws the top of a low crate, its shadow dark, and the ground past the shadow again', () => {
    const g = flat()
    // A crate 1 m high in cell 8: lower than the eye.
    set(g, 8, 10, 1)
    const ox = cellMid(4)
    const eye = 1.5
    const s = spans(g, ox, cellMid(10), eye, 1, 0, 30)
    const face = 8 * CELL - ox
    const back = 9 * CELL - ox
    expect(s.length).toBe(3)
    // Up to its face on the ground…
    expect(s[0]!.t1).toBeCloseTo(face, 2)
    expect(s[0]!.y).toBe(0)
    // …its top (a body standing on it is seen)…
    expect(s[1]!.y).toBe(1)
    expect(s[1]!.t0).toBeCloseTo(face, 2)
    expect(s[1]!.t1).toBeCloseTo(back, 2)
    // …and the ground again where the line over its back edge comes down to the probe height.
    const comesBack = back * (eye - PROBE) / (eye - 1)
    expect(s[2]!.t0).toBeCloseTo(comesBack, 2)
    expect(s[2]!.t1).toBe(30)
  })

  it('a lamp post hides only its own thin shadow: the ray beside it runs on', () => {
    const g = flat()
    const ox = cellMid(4)
    const oz = cellMid(10)
    // A 0.3 m post across the ray, 10 m out.
    addBox(g, { x0: ox + 10, y0: 0, z0: oz - 0.15, x1: ox + 10.3, y1: 6, z1: oz + 0.15 })
    const s = spans(g, ox, oz, 1.5, 1, 0, 25)
    expect(s.length).toBe(1)
    // (The defenders' line of sight stops 2 cm short of what it looks at.)
    expect(s[0]!.t1).toBeCloseTo(10, 1)
    // Two degrees aside it clears the post and sees all the way.
    const a = Math.PI / 2 + 0.035
    const beside = spans(g, ox, oz, 1.5, Math.sin(a), Math.cos(a), 25)
    expect(beside.length).toBe(1)
    expect(beside[0]!.t1).toBe(25)
  })

  it('a guard on a roof sees the roof it stands on, not the floor under it', () => {
    const g = flat()
    addRoof(g, 0, 0, 14, 29, 3)
    const feet = 3.4
    const s = spans(g, cellMid(4), cellMid(10), feet + 1.5, 1, 0, 40, feet)
    expect(s[0]!.y).toBeCloseTo(feet, 5)
    // The roof's edge is at x = 30 m; the ground right under it is hidden by the edge.
    expect(s[0]!.t1).toBeCloseTo(30 - cellMid(4), 1)
  })

  it('agrees with the line of sight the defenders use, everywhere along every ray', () => {
    let seed = 7
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const g = flat(24, 24)
    for (let k = 0; k < 70; k++) set(g, Math.floor(rnd() * 24), Math.floor(rnd() * 24), [0.3, 0.6, 1, 1.8, 4][Math.floor(rnd() * 5)]!)
    for (let k = 0; k < 8; k++) {
      const x = rnd() * 44
      const z = rnd() * 44
      addBox(g, { x0: x, y0: rnd() * 2, z0: z, x1: x + 0.2 + rnd(), y1: 3 + rnd() * 3, z1: z + 0.2 + rnd() })
    }
    addRoof(g, 14, 2, 18, 6, 2.6)
    let checked = 0
    for (let trial = 0; trial < 12; trial++) {
      const ox = 4 + rnd() * 40
      const oz = 4 + rnd() * 40
      const feet = surfaceAt(g, toCell(ox), toCell(oz), 0)
      if (feet !== 0) continue
      const eye = feet + 1.5
      for (let r = 0; r < 24; r++) {
        const a = rnd() * Math.PI * 2
        const dx = Math.sin(a)
        const dz = Math.cos(a)
        const s = spans(g, ox, oz, eye, dx, dz, 30, feet)
        for (let t = 0.3; t < 30; t += 0.37) {
          // Not right on an edge: the two only differ by the bisection's last millimetres there.
          if (s.some(p => Math.abs(p.t0 - t) < 0.05 || Math.abs(p.t1 - t) < 0.05)) continue
          const x = ox + dx * t
          const z = oz + dz * t
          const cx = toCell(x)
          const cz = toCell(z)
          if (Math.abs(x - Math.round(x / CELL) * CELL) < 0.05 || Math.abs(z - Math.round(z / CELL) * CELL) < 0.05) continue
          const floor = surfaceAt(g, cx, cz, feet)
          const drawn = s.some(p => t > p.t0 && t < p.t1)
          const seen = floor !== VOID && floor < eye && hasLineOfSight(g, ox, eye, oz, x, floor + PROBE, z)
          expect(drawn, `ray from (${ox.toFixed(2)}, ${oz.toFixed(2)}) at ${a.toFixed(3)}, t ${t.toFixed(2)}`).toBe(seen)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(2000)
  })
})

// ─── The view: marks over the model, the cone with the body ──────────────────

beforeAll(() => {
  // jsdom has no 2D canvas: the marks' textures draw into nothing.
  // Every property of it is itself, and calling it gives itself back.
  const ctx: object = new Proxy(() => {}, { get: () => ctx, apply: () => ctx, set: () => true })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

/** Open ground, the guard in the middle of it: nothing clips its cone. */
const yard = () => {
  const b = new FortressBuilder('t', 48, 48)
  b.ground(0, 0, 47, 47)
  b.insert(1, 1).extract(46, 46)
  b.guard([[24, 24]], 0).hound([[12, 6]], 0).roomba([[16, 6]], 0)
  return b.build()
}

describe('the marks sit above the model', () => {
  it('for a guard, the hound and a roomba, at any distance and mid-pop', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const view = new GarrisonView(gar, f.grid)
    for (const u of gar.units) { u.state = 'combat'; u.px = u.x; u.py = u.y; u.pz = u.z; u.pyaw = u.yaw }
    const box = new Box3()
    for (const camD of [6, 40, 90]) {
      view.update(1, 1 / 60, 1, gar.units[0]!.x + camD, 12, gar.units[0]!.z)
      for (const u of gar.units) {
        const rig = view.rigOf(u.id)!
        rig.root.updateMatrixWorld(true)
        box.setFromObject(rig.root)
        const mark = view.group.children.find(o => (o as Sprite).isSprite && o.visible && Math.hypot(o.position.x - u.x, o.position.z - u.z) < 0.01) as Sprite | undefined
        expect(mark, u.kind).toBeTruthy()
        // Anchored at its foot: all of it is above its own position.
        expect(mark!.center.y).toBe(0)
        expect(mark!.position.y, `${u.kind} at ${camD} m`).toBeGreaterThan(box.max.y)
      }
    }
  })
})

describe('the cone goes with the body', () => {
  it('its apex is under the guard as drawn this frame, a touch ahead as it walks', () => {
    const f = yard()
    const gar = makeGarrison(f, 1)
    const view = new GarrisonView(gar, f.grid)
    const u = gar.units[0]!
    u.state = 'patrol'
    for (const o of gar.units) { o.px = o.x; o.py = o.y; o.pz = o.z; o.pyaw = o.yaw }
    const cones = view.group.children.find(o => (o as Mesh).isMesh && (o as Mesh).renderOrder === 2 && ((o as Mesh).geometry.attributes.position as BufferAttribute).count > 1000) as Mesh
    const pos = cones.geometry.attributes.position as BufferAttribute
    // Walking along +z at 1.5 m/s for a second, drawn between the steps.
    for (let k = 0; k < 60; k++) {
      u.px = u.x
      u.pz = u.z
      u.z += 1.5 / 60
      view.update(0.5, 1 / 60, k / 60, u.x + 20, 15, u.z)
      const drawnZ = u.pz + (u.z - u.pz) * 0.5
      // The cone of unit 0 starts at vertex 0: its first strip's apex.
      expect(pos.getX(0)).toBeCloseTo(u.x, 3)
      expect(pos.getZ(0) - drawnZ).toBeGreaterThan(0)
      expect(pos.getZ(0) - drawnZ).toBeLessThan(0.1)
    }
    const col = cones.geometry.attributes.color as BufferAttribute
    /** Where the guard's cone points: the mean of its visible vertices, as a heading. */
    const heading = (): number => {
      let fx = 0
      let fz = 0
      // Only this guard's cone: the first of the three in the buffer.
      for (let k = 0; k < pos.count / 3; k++) {
        if (col.getW(k) <= 0) continue
        fx += pos.getX(k) - u.x
        fz += pos.getZ(k) - u.z
      }
      return Math.atan2(fx, fz)
    }
    const h0 = heading()
    // Turned since its last cast: the cone is turned with it at once.
    u.pyaw = u.yaw = u.yaw + 0.8
    view.update(1, 1 / 60, 2, u.x + 20, 15, u.z)
    const h1 = heading()
    expect(Math.abs(h0 - u.pyaw + 0.8)).toBeLessThan(0.05)
    expect(Math.abs(h1 - u.yaw)).toBeLessThan(0.05)
  })
})
