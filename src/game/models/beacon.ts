import { AdditiveBlending, BufferGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { merge, paint, rbox, rcone, rcyl, sph, xform, type V3 } from './kit'
import { toonVC } from './toon'

/**
 * ─── The alarm beacon ────────────────────────────────────────────────────────
 *
 * The Bastion's braziers (after Assassin's Creed: Odyssey): a siren mast with
 * a hazard-striped foot, a big horn, a crank a guard turns to light it, and a
 * red dome lamp. Ready, the lamp glows low; being lit, it flashes; lit, it
 * spins a red beam over the yard; sabotaged, it is dark with a cut wire
 * hanging from the box. Origin at the foot; faces +z.
 */

const STEEL = '#6d6799'
const STEEL_DARK = '#3c3770'
const HAZARD = '#ffd23f'
const INK = '#241848'
const RED = '#ff3b5c'

export const BEACON_TOP = 3.1

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0]): BufferGeometry => paint(xform(g, p, r), color)

export interface BeaconView {
  group: Group
  lamp: Mesh
  lampMat: MeshBasicMaterial
  beam: Mesh
  beamMat: MeshBasicMaterial
  wire: Mesh
}

export const buildBeacon = (): BeaconView => {
  const lit: BufferGeometry[] = [
    // The foot: a squat box in hazard stripes.
    part(rbox(0.9, 0.5, 0.9, 0.3, 6, 4), STEEL_DARK, [0, 0.25, 0]),
    ...[0, 1, 2, 3].map(i => part(rbox(0.92, 0.1, 0.2, 0.2, 4, 2), i % 2 ? INK : HAZARD, [0, 0.15 + i * 0.1, 0.44], [0, 0, 0])),
    // The mast, and the crank box half-way up.
    part(rcyl(0.11, 2.4, 0.03, 10, 2), STEEL, [0, 1.6, 0]),
    part(rbox(0.36, 0.42, 0.3, 0.35, 6, 6), STEEL_DARK, [0, 1.25, 0.18]),
    part(rcyl(0.04, 0.32, 0.01, 6, 1), STEEL, [0.24, 1.28, 0.28], [0, 0, Math.PI / 2]),
    part(sph(0.07, 6, 5), RED, [0.4, 1.28, 0.28]),
    // The horn, facing out over the yard.
    part(rcone(0.07, 0.34, 0.6, 0.02, 12), STEEL, [0, 2.65, 0.32], [Math.PI / 2, 0, 0]),
    part(rcyl(0.18, 0.16, 0.03, 12, 2), STEEL_DARK, [0, 2.95, 0]),
  ]
  const g = merge(lit)
  for (const x of lit) x.dispose()
  const group = new Group()
  group.name = 'beacon'
  group.add(new Mesh(g, toonVC()))
  // The lamp: its own material, so each beacon can glow in its own state.
  const lampMat = new MeshBasicMaterial({ color: RED, toneMapped: false })
  const lamp = new Mesh(sph(0.22, 14, 10), lampMat)
  lamp.position.y = BEACON_TOP
  group.add(lamp)
  // The rotating beam of a lit beacon: a long flat cone, additive.
  const beamGeo = new ConeGeometry(1.4, 9, 16, 1, true)
  beamGeo.translate(0, -4.5, 0)
  beamGeo.rotateZ(Math.PI / 2)
  const beamMat = new MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
  const beam = new Mesh(beamGeo, beamMat)
  beam.position.y = BEACON_TOP
  beam.visible = false
  group.add(beam)
  // The cut wire of a sabotaged beacon.
  const wire = new Mesh(rcyl(0.02, 0.5, 0.005, 5, 1), new MeshBasicMaterial({ color: INK }))
  wire.position.set(0.18, 0.95, 0.3)
  wire.rotation.z = 0.5
  wire.visible = false
  group.add(wire)
  return { group, lamp, lampMat, beam, beamMat, wire }
}

/** Show a beacon's state: `lit` is 0 … 1 while it is being lit. */
export const poseBeacon = (v: BeaconView, state: 'ready' | 'lighting' | 'lit' | 'sabotaged', lit: number, time: number): void => {
  const c = v.lampMat.color
  if (state === 'sabotaged') {
    c.set('#2a2440')
    v.beam.visible = false
    v.wire.visible = true
    return
  }
  v.wire.visible = false
  if (state === 'ready') {
    // A low, slow glow: it is there, and it works.
    c.set(RED).multiplyScalar(0.35 + 0.1 * Math.sin(time * 1.5))
    v.beam.visible = false
  } else if (state === 'lighting') {
    // Being cranked: flashing faster as it comes up.
    const on = Math.sin(time * (8 + lit * 18)) > 0
    c.set(on ? RED : '#55202c')
    v.beam.visible = false
  } else {
    c.set(RED)
    v.beam.visible = true
    v.beam.rotation.y = time * 3.2
  }
}

export const disposeBeacon = (v: BeaconView): void => {
  for (const c of v.group.children) {
    const m = c as Mesh
    m.geometry.dispose()
    if (m.material !== toonVC()) (m.material as MeshBasicMaterial).dispose()
  }
}
