// @vitest-environment jsdom
// The decoy (#115) on screen: a hologram of CM-07 (the game's own mech, in the
// training demos' hologram light) juggling three balls in a cascade. These pin
// that it is the real mech in hologram light, that the balls follow a
// cascade (periodic, never under the hands, crossing hand to hand over the
// head), that every place a decoy is drawn builds this one, and that
// disposing one decoy leaves what the others share.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AdditiveBlending, Group, ShaderMaterial, Vector3, type BufferGeometry } from 'three'
import {
  DecoyHologram, JUGGLE_BALL_R, JUGGLE_BEAT, JUGGLE_FLIGHT, JUGGLE_HAND_Y, JUGGLE_PERIOD, decoyBallGeometry, decoyTemplate, juggleAt, makeJugglePlan
} from '@/game/fx/decoyHologram'
import { makeHologramMaterial } from '@/game/fx/hologram'
import { MECH_HEIGHT, MECH_SCALE, buildMech } from '@/game/models/mech'
import { CombatFx } from '@/game/fx/combatFx'
import type { Decoy } from '@/game/sim/melee'

const SRC = join(__dirname, '../../src')
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8')
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|vue)$/.test(n) ? [p] : []
})

describe('the decoy is CM-07 in hologram light', () => {
  it('is drawn from buildMech: the same bones, the same geometry as the mech', () => {
    const d = new DecoyHologram()
    const mech = buildMech()
    expect(d.rig.mesh.geometry).toBe(decoyTemplate().mesh.geometry)
    expect(d.rig.mesh.geometry.attributes.position!.count).toBe(mech.mesh.geometry.attributes.position!.count)
    expect(d.rig.mesh.skeleton.bones.map(b => b.name)).toEqual(mech.mesh.skeleton.bones.map(b => b.name))
    // Life-size: the mech's own drawn size.
    expect(d.rig.root.scale.x).toBeCloseTo(MECH_SCALE)
  })

  it('wears the hologram material (additive, scanlined, no depth), and so do its balls', () => {
    const d = new DecoyHologram()
    const ref = makeHologramMaterial()
    for (const m of [d.rig.mesh.material, ...d.balls.map(b => b.material)]) {
      const s = m as ShaderMaterial
      expect(s).toBeInstanceOf(ShaderMaterial)
      expect(s.fragmentShader).toBe(ref.fragmentShader)
      expect(s.blending).toBe(AdditiveBlending)
      expect(s.depthWrite).toBe(false)
    }
    // Three balls, each its own hue.
    expect(d.balls).toHaveLength(3)
    const hues = new Set(d.balls.map(b => ((b.material as ShaderMaterial).uniforms.uColor!.value as { getHexString(): string }).getHexString()))
    expect(hues.size).toBe(3)
  })

  it('puts its weapons and blade away and its palms where the cascade has them', () => {
    const d = new DecoyHologram()
    const scene = new Group()
    scene.add(d.root)
    d.root.position.set(4, 0.5, -2)
    d.root.rotation.y = 0.7
    const plan = makeJugglePlan()
    for (const t of [0, 0.3, 0.77, 1.4, 2.2]) {
      d.update(t, t, 1)
      juggleAt(t, plan)
      for (const w of ['sniper', 'minigun', 'rocket', 'blade']) expect(d.rig.bones[w]!.scale.y).toBeLessThan(0.01)
      for (const hand of ['L', 'R'] as const) {
        const palm = d.rig.bones[`fore${hand}`]!.localToWorld(new Vector3(0, -0.45, 0.02))
        const want = d.root.localToWorld(new Vector3(plan.hands[hand].x, plan.hands[hand].y, plan.hands[hand].z))
        expect(palm.distanceTo(want), `${hand} at ${t}`).toBeLessThan(0.03)
      }
      d.balls.forEach((b, i) => expect(b.position.distanceTo(new Vector3(plan.balls[i]!.x, plan.balls[i]!.y, plan.balls[i]!.z))).toBeLessThan(1e-9))
    }
  })
})

describe('the juggle is a three-ball cascade', () => {
  const at = (t: number) => juggleAt(t, makeJugglePlan())

  it('loops: every ball and hand is where it was one period on', () => {
    for (let t = 0; t < JUGGLE_PERIOD; t += 0.037) {
      const a = at(t)
      const b = at(t + JUGGLE_PERIOD)
      const c = at(t + 3 * JUGGLE_PERIOD)
      for (let i = 0; i < 3; i++) {
        expect(b.balls[i]!.y).toBeCloseTo(a.balls[i]!.y, 6)
        expect(c.balls[i]!.x).toBeCloseTo(a.balls[i]!.x, 6)
      }
      expect(b.hands.L.x).toBeCloseTo(a.hands.L.x, 6)
    }
  })

  it('moves smoothly: no ball or hand jumps', () => {
    const dt = 0.002
    let prev = at(0)
    for (let t = dt; t < 2 * JUGGLE_PERIOD; t += dt) {
      const now = at(t)
      for (let i = 0; i < 3; i++) {
        const a = prev.balls[i]!
        const b = now.balls[i]!
        expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), `ball ${i} at ${t}`).toBeLessThan(0.05)
      }
      for (const h of ['L', 'R'] as const) expect(Math.abs(now.hands[h].x - prev.hands[h].x)).toBeLessThan(0.01)
      prev = now
    }
  })

  it('never drops a ball below the hands, and each one is either in the air or on a palm', () => {
    for (let t = 0; t < JUGGLE_PERIOD; t += 0.01) {
      const p = at(t)
      const low = Math.min(p.hands.L.y, p.hands.R.y)
      let held = 0
      for (const b of p.balls) {
        expect(b.y).toBeGreaterThanOrEqual(low + JUGGLE_BALL_R - 1e-9)
        const on = (['L', 'R'] as const).some(h => Math.hypot(b.x - p.hands[h].x, b.y - JUGGLE_BALL_R - p.hands[h].y, b.z - p.hands[h].z) < 1e-6)
        if (on) held++
        else expect(b.y, `ball in the air at ${t}`).toBeGreaterThan(JUGGLE_HAND_Y + JUGGLE_BALL_R - 1e-9)
      }
      // Never more balls held than hands; a ball always in the air.
      expect(held).toBeLessThanOrEqual(2)
    }
  })

  it('throws every ball across, hand to hand, over the head', () => {
    // A throw every beat: watch each flight from just after its throw to just before its catch.
    for (let n = 0; n < 6; n++) {
      const j = n % 3
      const start = at(n * JUGGLE_BEAT + 1e-4).balls[j]!
      const end = at((n + JUGGLE_FLIGHT) * JUGGLE_BEAT - 1e-4).balls[j]!
      let top = 0
      for (let k = 0; k <= 40; k++) top = Math.max(top, at((n + (JUGGLE_FLIGHT * k) / 40) * JUGGLE_BEAT).balls[j]!.y)
      // The right hand (−x) throws on even beats, the left on odd; each ball lands on the other side.
      expect(Math.sign(start.x)).toBe(n % 2 === 0 ? -1 : 1)
      expect(Math.sign(end.x)).toBe(-Math.sign(start.x))
      expect(top).toBeGreaterThan(MECH_HEIGHT)
    }
  })
})

describe('every decoy on screen is the juggler', () => {
  it('the mission\'s and the story\'s decoys (CombatFx) and the training demo\'s are built by DecoyHologram', () => {
    const fx = read('game/fx/combatFx.ts')
    expect(fx).toContain('new DecoyHologram(this.paint)')
    expect(fx).not.toMatch(/buildMech\(/)
    const td = read('game/sim/trainingDirector.ts')
    expect(td).toContain('this.decoyHolo = new DecoyHologram(')
    expect(td).not.toMatch(/decoy\w*\s*=\s*buildMech\(/i)
    // The story draws its decoys through CombatFx.
    expect(read('game/story/cinema.ts')).toMatch(/cfx\?\.update\([^)]*decoys/)
  })

  it('nothing else builds a decoy of its own', () => {
    for (const f of walk(SRC)) {
      const s = readFileSync(f, 'utf8')
      if (f.endsWith('decoyHologram.ts')) continue
      expect(s, f).not.toMatch(/decoy\w*\s*=\s*buildMech\(/i)
      if (s.includes('new DecoyHologram(')) expect(/combatFx\.ts$|trainingDirector\.ts$/.test(f), f).toBe(true)
    }
  })

  it('the intro\'s decoy is the game\'s juggler too (#200): fed to CombatFx, no mech built for it', () => {
    const cin = read('game/story/cinema.ts')
    // The real intro has the game's combat effects in CM-07's paint (the tests' run has none: no canvas).
    expect(cin).toContain('new CombatFx(FREE_PAINT)')
    // Its yard decoy is a game decoy record, drawn by CombatFx, not a figure of the script's own.
    expect(cin).toMatch(/s\.decoys\[0\]\s*=\s*\{\s*x:\s*DECOY\[0\]/)
    // The one mech the story builds is CM-07 himself.
    expect(cin.match(/buildMech\(/g)).toHaveLength(1)
  })

  it('nothing poses a decoy with the old arm wave (#200)', () => {
    // The old decoy was a see-through mech waving its cable arm (`pose.cable` on a sine).
    expect(read('game/fx/combatFx.ts')).not.toMatch(/poseMech\(|restPose\(/)
    for (const f of walk(SRC)) {
      const s = readFileSync(f, 'utf8')
      expect(s, f).not.toMatch(/\.cable\s*=\s*[^=\n]*Math\.sin\(/)
      expect(s, f).not.toMatch(/It waves/)
    }
  })

  it('CombatFx stands one juggler per decoy, at its spot and heading', () => {
    // jsdom has no 2D canvas: the sparks' textures draw into nothing.
    const ctx: object = new Proxy(() => {}, { get: () => ctx, apply: () => ctx, set: () => true })
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
    const fx = new CombatFx()
    const decoys: Decoy[] = [
      { x: 3, y: 0, z: 4, yaw: 1, t: 0.5, life: 9, pulse: 0 },
      { x: -2, y: 1, z: 0, yaw: -1, t: 2, life: 9, pulse: 0 }
    ]
    fx.update(1 / 60, 1, [], decoys, 720, 60)
    const jugglers: Group[] = []
    fx.group.traverse(o => { if (o.children.some(c => c.type === 'Mesh' && (c as { geometry?: BufferGeometry }).geometry === decoyBallGeometry())) jugglers.push(o as Group) })
    expect(jugglers).toHaveLength(2)
    expect(jugglers.map(g => [g.position.x, g.position.z, g.rotation.y])).toEqual([[3, 4, 1], [-2, 0, -1]])
    fx.update(1 / 60, 1, [], decoys.slice(0, 1), 720, 60)
    expect(jugglers.map(g => g.visible)).toEqual([true, false])
    fx.dispose()
  })
})

describe('shared resources outlive one decoy', () => {
  it('disposing a decoy frees its own light, never the shared mech or balls', () => {
    const a = new DecoyHologram()
    const b = new DecoyHologram()
    expect(a.rig.mesh.geometry).toBe(b.rig.mesh.geometry)
    expect(a.balls[0]!.geometry).toBe(b.balls[0]!.geometry)
    const freed: string[] = []
    a.rig.mesh.geometry.addEventListener('dispose', () => freed.push('mech'))
    decoyBallGeometry().addEventListener('dispose', () => freed.push('ball'))
    for (const m of b.materials) m.addEventListener('dispose', () => freed.push('b-light'))
    let own = 0
    for (const m of a.materials) m.addEventListener('dispose', () => own++)
    a.dispose()
    expect(own).toBe(a.materials.length)
    expect(freed).toEqual([])
    // The other still draws, and a new one after it too.
    b.update(1, 1, 1)
    const c = new DecoyHologram()
    expect(c.rig.mesh.geometry).toBe(b.rig.mesh.geometry)
    c.update(0.5, 0.5, 1)
  })
})
