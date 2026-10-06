import {
  AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, PlaneGeometry, ShaderMaterial, type Material
} from 'three'
import { RigBuilder, cap, merge, rbox, rcone, rcyl, sph, stripUv, torus, xform, type Rig, type V3 } from './kit'
import { PAL } from './palette'
import { at, beam, newParts, rod, type Parts } from './propKit'
import type { WeaponId } from '../data/ids'

/**
 * ─── The Armory's weapons lab ────────────────────────────────────────────────
 *
 * Where the weapons are modified: a rack on the back wall holding the
 * mech's three (sniper rifle, mini-gun, rocket launcher) in clamps, each
 * slot with its status light; a workbench in front, drawers, a parts tray, a
 * data pad and a holo projector, the weapon being worked on turning in its
 * hologram above it; a robotic welding arm on the bench's end; two
 * holographic screens on a stand. Origin at the foot; faces +z.
 *
 * The weapons are the mech's own (`models/mech.ts`), drawn at its size
 * with more of their detail: they are built here as props, muzzle up.
 */

const STEEL = '#5a4f9a'
const STEEL_DARK = '#3d3478'
const PANEL = '#4a3f8c'
const INK = '#241848'

/** Where the hologram turns, and where the arm stands (lab frame). */
export const LAB_HOLO_AT: V3 = [-0.45, 1.62, 0.32]
export const LAB_ARM_AT: V3 = [0.5, 1.06, 0.28]

/** A weapon as a prop, muzzle up (+y), its grip at the origin. */
export const weaponParts = (id: WeaponId): Parts => {
  const p = newParts()
  const { lit, fine, glow } = p
  const M = PAL.gunMetal
  const D = PAL.gunDark
  if (id === 'sniper') {
    lit.push(at(rbox(0.09, 0.42, 0.13, 0.4, 8, 8), M, [0, 0.05, 0]))
    lit.push(at(stripUv(new CylinderGeometry(0.024, 0.026, 0.9, 8)), D, [0, 0.7, 0]))
    lit.push(at(rcyl(0.04, 0.22, 0.012, 10, 2), M, [0, 1.12, 0]))
    for (const y of [1.06, 1.12, 1.18]) fine.push(at(torus(0.041, 0.008, 4, 10), INK, [0, y, 0], [Math.PI / 2, 0, 0]))
    lit.push(at(rcyl(0.04, 0.3, 0.012, 10, 2), D, [0, 0.16, 0.11]))
    lit.push(at(rcyl(0.05, 0.05, 0.01, 10, 1), M, [0, 0.33, 0.11]))
    glow.push(at(sph(0.03, 6, 5), PAL.gunAccent, [0, 0.36, 0.11]))
    lit.push(at(rbox(0.075, 0.3, 0.12, 0.45, 6, 6), D, [0, -0.3, -0.01]))
    lit.push(at(rbox(0.05, 0.12, 0.06, 0.4, 4, 4), D, [0, -0.05, 0.09], [0.4, 0, 0]))
    for (const s of [-1, 1]) lit.push(rod([s * 0.015, 0.5, -0.02], [s * 0.06, 0.28, -0.08], 0.01, INK, 5))
  } else if (id === 'minigun') {
    lit.push(at(rbox(0.2, 0.38, 0.22, 0.35, 8, 8), M, [0, 0.0, 0]))
    lit.push(at(rbox(0.1, 0.16, 0.24, 0.45, 6, 6), D, [0, -0.15, 0.12]))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      lit.push(at(stripUv(new CylinderGeometry(0.02, 0.02, 0.6, 6)), D, [Math.cos(a) * 0.062, 0.48, Math.sin(a) * 0.062]))
    }
    for (const y of [0.3, 0.72]) lit.push(at(rcyl(0.1, 0.05, 0.015, 12, 1), M, [0, y, 0]))
    glow.push(at(torus(0.1, 0.012, 4, 14), PAL.gunAccent, [0, 0.21, 0], [Math.PI / 2, 0, 0]))
    lit.push(at(rcyl(0.13, 0.11, 0.03, 14, 2), D, [0.15, -0.02, 0], [0, 0, Math.PI / 2]))
    lit.push(rod([0.15, 0.08, 0], [0.04, 0.2, 0], 0.025, INK, 6))
  } else {
    lit.push(at(rcyl(0.105, 0.88, 0.03, 12, 2), M, [0, 0.3, 0.0]))
    lit.push(at(rcyl(0.135, 0.13, 0.03, 12, 2), D, [0, 0.74, 0]))
    lit.push(at(rcyl(0.125, 0.12, 0.03, 12, 2), D, [0, -0.12, 0]))
    lit.push(at(torus(0.108, 0.012, 4, 14), INK, [0, 0.5, 0], [Math.PI / 2, 0, 0]))
    glow.push(at(rbox(0.06, 0.16, 0.08, 0.5, 4, 6), PAL.gunAccent, [0, 0.28, 0.115]))
    lit.push(at(rbox(0.06, 0.12, 0.14, 0.4, 4, 4), D, [0, 0.05, 0.16]))
    lit.push(at(rbox(0.05, 0.14, 0.06, 0.4, 4, 4), D, [0, 0.02, -0.14], [-0.3, 0, 0]))
  }
  return p
}

/** How tall each weapon stands in the rack (its grip above the clamp line). */
const RACK_LIFT: Record<WeaponId, number> = { sniper: 0.95, minigun: 1.05, rocket: 1.0 }
const RACK_ORDER: readonly WeaponId[] = ['sniper', 'minigun', 'rocket']

/** The screens: [height, yaw] on the stand. */
const SCREENS: ReadonlyArray<readonly [number, number]> = [[1.35, 0.35], [1.95, 0.35]]
/** Where the screen stand is (x, z). */
const SCREEN_AT: readonly [number, number] = [-1.45, 0.15]

export const labParts = (): Parts => {
  const p = newParts()
  const { lit, fine, glow } = p

  // ── The rack on the back wall: a plinth, the wall, three lit slots ──
  lit.push(at(rbox(2.7, 0.14, 0.62, 0.2, 12, 6), STEEL_DARK, [0, 0.05, -0.62]))
  lit.push(at(rbox(2.56, 2.3, 0.16, 0.15, 16, 14), PANEL, [0, 1.25, -0.72]))
  lit.push(at(rbox(2.7, 0.18, 0.26, 0.25, 12, 6), STEEL_DARK, [0, 2.43, -0.7]))
  glow.push(at(rbox(2.4, 0.04, 0.03, 0.3, 8, 4), PAL.glowCyan, [0, 2.3, -0.62]))
  RACK_ORDER.forEach((id, i) => {
    const x = (i - 1) * 0.8
    lit.push(at(rbox(0.62, 1.86, 0.05, 0.2, 8, 12), STEEL, [x, 1.17, -0.62]))
    for (const y of [RACK_LIFT[id], RACK_LIFT[id] + 0.55]) {
      lit.push(at(rbox(0.32, 0.07, 0.2, 0.3, 6, 4), STEEL_DARK, [x, y, -0.5]))
      for (const s of [-1, 1]) lit.push(at(rbox(0.04, 0.1, 0.1, 0.35, 4, 4), INK, [x + s * 0.13, y + 0.02, -0.41]))
    }
    glow.push(at(sph(0.045, 8, 6), i === 1 ? PAL.glowYellow : PAL.glowGreen, [x, 2.16, -0.58]))
    // The weapon itself, muzzle up, in its clamps.
    const w = weaponParts(id)
    for (const k of ['lit', 'fine', 'glow'] as const) for (const g of w[k]) p[k].push(xform(g, [x, RACK_LIFT[id], -0.41]))
  })

  // ── The workbench: a cabinet with drawers, a thick top with a lit edge ──
  const bx = -0.25
  const bz = 0.32
  lit.push(at(rbox(1.86, 0.9, 0.7, 0.15, 12, 8), STEEL_DARK, [bx, 0.47, bz]))
  lit.push(at(rbox(2.0, 0.1, 0.82, 0.25, 14, 4), STEEL, [bx, 0.96, bz]))
  glow.push(at(rbox(1.8, 0.03, 0.03, 0.3, 8, 4), PAL.glowCyan, [bx, 0.95, bz + 0.42]))
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 2; r++) {
      const x = bx - 0.6 + c * 0.6
      const y = 0.3 + r * 0.34
      lit.push(at(rbox(0.54, 0.29, 0.04, 0.25, 6, 6), PANEL, [x, y, bz + 0.36]))
      fine.push(at(rbox(0.22, 0.03, 0.03, 0.4, 4, 4), INK, [x, y + 0.08, bz + 0.39]))
    }
  }
  // On the bench: the projector, a parts tray, a data pad.
  const [hx, , hz] = LAB_HOLO_AT
  lit.push(at(rcyl(0.24, 0.06, 0.02, 20, 2), INK, [hx, 1.035, hz]))
  glow.push(at(torus(0.18, 0.018, 4, 24), PAL.glowCyan, [hx, 1.075, hz], [Math.PI / 2, 0, 0]))
  glow.push(at(sph(0.05, 8, 6), PAL.glowWhite, [hx, 1.08, hz]))
  lit.push(at(rbox(0.42, 0.06, 0.3, 0.3, 6, 4), PANEL, [bx - 0.62, 1.035, bz + 0.12]))
  for (let i = 0; i < 4; i++) fine.push(at(sph(0.03, 6, 4), i % 2 ? PAL.steel : PAL.hazard, [bx - 0.75 + i * 0.09, 1.08, bz + 0.1 + (i % 2) * 0.06]))
  lit.push(at(rbox(0.3, 0.03, 0.22, 0.3, 6, 4), INK, [bx + 0.12, 1.02, bz + 0.2], [0, 0.3, 0]))
  glow.push(at(rbox(0.24, 0.02, 0.16, 0.3, 6, 4), '#5fd6ff', [bx + 0.12, 1.04, bz + 0.2], [0, 0.3, 0]))
  // The arm's mount, bolted to the bench's end.
  const [ax, , az] = LAB_ARM_AT
  lit.push(at(rcyl(0.2, 0.06, 0.02, 16, 1), STEEL_DARK, [ax, 1.03, az]))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    fine.push(at(sph(0.022, 5, 4), PAL.steel, [ax + Math.cos(a) * 0.16, 1.06, az + Math.sin(a) * 0.16]))
  }

  // ── The screen stand at the left end ──
  const [sx, sz] = SCREEN_AT
  lit.push(at(rcyl(0.22, 0.08, 0.03, 14, 2), STEEL_DARK, [sx, 0.05, sz - 0.14]))
  lit.push(at(rcyl(0.04, 1.95, 0.015, 8, 1), STEEL, [sx, 1.0, sz - 0.14]))
  for (const [y, yaw] of SCREENS) {
    // A frame of four bars round each screen.
    const R: V3 = [0, yaw, 0]
    for (const s of [-1, 1]) {
      lit.push(at(rbox(0.74, 0.04, 0.04, 0.3, 6, 4), INK, [sx, y + s * 0.24, sz], R))
      lit.push(at(rbox(0.04, 0.52, 0.04, 0.3, 4, 6), INK, [sx + Math.cos(yaw) * s * 0.37, y, sz - Math.sin(yaw) * s * 0.37], R))
    }
    lit.push(beam([sx, y, sz - 0.03], [sx, y, sz - 0.14], 0.05, 0.05, STEEL))
  }
  return p
}

/** The screens' glass, for the holo material (has uvs: the screen draws in them). */
export const labScreenGeometry = (): BufferGeometry => {
  const geos = SCREENS.map(([y, yaw]) => {
    const g = new PlaneGeometry(0.68, 0.44)
    g.rotateY(yaw)
    g.translate(SCREEN_AT[0], y, SCREEN_AT[1])
    return g
  })
  const out = merge(geos)
  for (const g of geos) g.dispose()
  return out
}

/** A weapon's shape for the hologram: its parts merged, lying along x. */
export const weaponHoloGeometry = (id: WeaponId): BufferGeometry => {
  const w = weaponParts(id)
  const all = [...w.lit, ...w.fine, ...w.glow]
  const g = merge(all)
  for (const x of all) x.dispose()
  g.deleteAttribute('color')
  g.computeBoundingBox()
  const b = g.boundingBox!
  g.translate(0, -(b.min.y + b.max.y) / 2, 0)
  g.rotateZ(Math.PI / 2)
  return g
}

// ─── The robotic arm: a little rig of its own ────────────────────────────────

export interface LabArm {
  rig: Rig
  /** Sweep, reach and weld (the tool's glow flickers while it works). */
  pose(time: number): void
}

export const buildLabArm = (): LabArm => {
  const b = new RigBuilder()
  b.bone('base', null, [0, 0, 0], [0, -Math.PI / 2, 0])
  b.bone('turn', 'base', [0, 0.06, 0])
  b.bone('shoulder', 'turn', [0, 0.2, 0])
  b.bone('elbow', 'shoulder', [0, 0.52, 0])
  b.bone('wrist', 'elbow', [0, 0.46, 0])
  b.part('base', rcyl(0.15, 0.1, 0.03, 14, 2), STEEL, { p: [0, 0.03, 0] })
  b.part('turn', rcyl(0.1, 0.2, 0.03, 12, 2), STEEL_DARK, { p: [0, 0.1, 0] })
  b.part('turn', torus(0.11, 0.02, 4, 16), PAL.hazard, { p: [0, 0.16, 0], r: [Math.PI / 2, 0, 0] })
  b.part('shoulder', sph(0.1, 10, 8), STEEL_DARK)
  b.part('shoulder', rbox(0.1, 0.5, 0.13, 0.35, 8, 8), PAL.steel, { p: [0, 0.26, 0] })
  b.part('shoulder', cap(0.025, 0.3, 6, 2), INK, { p: [0, 0.24, -0.09] })
  b.part('elbow', sph(0.08, 10, 8), STEEL_DARK)
  b.part('elbow', rbox(0.08, 0.44, 0.1, 0.35, 8, 8), PAL.steel, { p: [0, 0.23, 0] })
  b.part('wrist', sph(0.06, 8, 6), STEEL_DARK)
  b.part('wrist', rcone(0.06, 0.025, 0.16, 0.01, 10), INK, { p: [0, 0.1, 0] })
  b.part('wrist', sph(0.03, 6, 5), '#fff3c0', { p: [0, 0.2, 0], glow: true, outline: false })
  const rig = b.build({ outline: 0.015, height: 1.2 })
  return {
    rig,
    pose: (t) => {
      // It works the weapon under the hologram: sweeps along it, dips, welds.
      const r = rig.rest
      const set = (name: string, rx: number, ry: number): void => {
        const bone = rig.bones[name]!
        bone.quaternion.copy(r[name]!.q)
        bone.rotateX(rx)
        bone.rotateY(ry)
      }
      set('turn', 0, Math.sin(t * 0.45) * 0.45)
      set('shoulder', 0.75 + Math.sin(t * 0.7) * 0.12, 0)
      set('elbow', 1.05 + Math.sin(t * 0.9 + 1) * 0.18, 0)
      set('wrist', 0.85 + Math.sin(t * 1.3) * 0.2, 0)
      const weld = Math.sin(t * 0.7) > 0.3
      rig.glowMaterial.color.setScalar(weld ? 0.8 + Math.random() * 0.6 : 0.35)
    }
  }
}

// ─── The hologram material ───────────────────────────────────────────────────

const HOLO_VERT = /* glsl */`
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
void main() {
  vPos = position;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`
const HOLO_FRAG = /* glsl */`
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
void main() {
  float t = uTime;
  #ifdef SCREEN
  // A screen: a faint grid, a few bars of a readout climbing, a sweep line.
  vec2 g = abs(fract(vUv * vec2(14.0, 9.0)) - 0.5);
  float grid = step(0.46, max(g.x, g.y)) * 0.25;
  float col = floor(vUv.x * 7.0);
  float h = 0.25 + 0.5 * fract(sin(col * 12.9 + floor(t * 1.5 + col) * 3.1) * 43758.5);
  float bars = step(vUv.y, h * 0.62) * step(0.15, fract(vUv.x * 7.0)) * step(fract(vUv.x * 7.0), 0.75) * step(0.08, vUv.y);
  float sweep = smoothstep(0.02, 0.0, abs(vUv.y - fract(t * 0.35)));
  float edge = step(0.94, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0);
  float a = 0.16 + grid + bars * 0.4 + sweep * 0.6 + edge * 0.5;
  #else
  // A model: lit at its rim, ruled with scan lines, a bright band sweeping up it.
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float rim = pow(1.0 - facing, 2.0);
  float lines = 0.55 + 0.45 * step(0.5, fract(vPos.y * 38.0 - t * 2.0));
  float band = smoothstep(0.12, 0.0, abs(fract(vPos.y * 0.9 - t * 0.5) - 0.5));
  float a = (0.18 + rim * 0.9) * lines + band * 0.45;
  #endif
  float flick = 0.9 + 0.1 * sin(t * 37.0) * sin(t * 13.0);
  gl_FragColor = vec4(uColor, clamp(a * flick * uOpacity, 0.0, 1.0));
  #include <colorspace_fragment>
}
`

/** The hologram look (cyan, additive, no depth write); `screen` draws a readout in the geometry's uvs. */
export const makeHoloMaterial = (color: string = PAL.glowCyan, opacity = 1, screen = false): ShaderMaterial => new ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity }, uColor: { value: new Color(color) } },
  defines: screen ? { SCREEN: 1 } : {},
  vertexShader: HOLO_VERT,
  fragmentShader: HOLO_FRAG,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  side: DoubleSide,
  toneMapped: false
})

export const setHoloTime = (m: Material, t: number): void => {
  ;(m as ShaderMaterial).uniforms.uTime!.value = t
}
