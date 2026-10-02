import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry } from 'three'
import { merge, paint, stripUv, xform, type V3 } from './kit'
import { glowVC, outlineMat, toonVC } from './toon'
import { PAL } from './palette'

/**
 * The stealth dropship that delivers the mech and takes it out again (GDD 6).
 * A static prop: one lit mesh with its outline and one glowing mesh. It faces
 * +z; its belly hatch is at the origin.
 */

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0], s: V3 | number = 1): BufferGeometry =>
  paint(xform(stripUv(g), p, r, s), color)

export interface Dropship {
  group: Group
  dispose(): void
}

export const buildDropship = (): Dropship => {
  const HULL = '#6b5bc4'
  const HULL_DARK = '#3d2f86'
  const lit: BufferGeometry[] = [
    // A flat wedge of a hull, wider than it is tall.
    part(new BoxGeometry(4.2, 1.1, 7.2), HULL, [0, 1.3, 0]),
    part(new ConeGeometry(2.4, 3.2, 4), HULL, [0, 1.3, 5.0], [Math.PI / 2, Math.PI / 4, 0], [0.9, 1, 0.32]),
    part(new BoxGeometry(2.2, 0.7, 2.4), HULL_DARK, [0, 2.0, 1.2]),
    // Stub wings carrying the engines.
    part(new BoxGeometry(9.6, 0.3, 2.6), HULL_DARK, [0, 1.5, -1.2]),
    part(new CylinderGeometry(0.75, 0.9, 2.6, 10), HULL, [4.4, 1.4, -1.2], [Math.PI / 2, 0, 0]),
    part(new CylinderGeometry(0.75, 0.9, 2.6, 10), HULL, [-4.4, 1.4, -1.2], [Math.PI / 2, 0, 0]),
    // Twin tail fins.
    part(new BoxGeometry(0.2, 1.6, 1.8), HULL_DARK, [1.5, 2.4, -3.0], [0.25, 0, 0.3]),
    part(new BoxGeometry(0.2, 1.6, 1.8), HULL_DARK, [-1.5, 2.4, -3.0], [0.25, 0, -0.3])
  ]
  const glow: BufferGeometry[] = [
    // The cockpit strip, the engines' exhausts, and the open hatch.
    part(new BoxGeometry(1.5, 0.22, 0.1), PAL.glowPink, [0, 2.05, 2.42]),
    part(new SphereGeometry(0.62, 10, 8), PAL.glowCyan, [4.4, 1.4, -2.55], [0, 0, 0], [1, 1, 0.5]),
    part(new SphereGeometry(0.62, 10, 8), PAL.glowCyan, [-4.4, 1.4, -2.55], [0, 0, 0], [1, 1, 0.5]),
    part(new BoxGeometry(1.5, 0.08, 1.5), PAL.glowCyan, [0, 0.74, 0])
  ]
  const group = new Group()
  group.name = 'dropship'
  const litGeo = merge(lit)
  const glowGeo = merge(glow)
  // The materials are the scene's shared ones: only the geometry is ours.
  const body = new Mesh(litGeo, toonVC())
  const line = new Mesh(litGeo, outlineMat(0.05))
  line.renderOrder = -1
  group.add(body, line, new Mesh(glowGeo, glowVC()))
  for (const g of [...lit, ...glow]) g.dispose()
  return {
    group,
    dispose: () => {
      litGeo.dispose()
      glowGeo.dispose()
    }
  }
}
