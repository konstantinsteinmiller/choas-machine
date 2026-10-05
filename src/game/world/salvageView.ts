import { AdditiveBlending, BufferGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'
import { merge, paint, rbox, rcyl, xform, type V3 } from '../models/kit'
import { toonVC, glowVC } from '../models/toon'
import type { Pile } from '../sim/salvage'

/**
 * ─── Salvage piles, drawn ────────────────────────────────────────────────────
 *
 * A scrap plate with machine parts on it and what is worth carrying away:
 * glowing alloy bars and a power cell. Glowing so they are found from a
 * perch, in amber and cyan so they are never mistaken for the heaps of plain
 * scrap the yard is full of. The big one on the keep is half as large again.
 *
 * One small group per pile (it has to vanish on its own when stripped): three
 * draw calls each, eight piles in a base.
 */

const STEEL = '#8b86b8'
const STEEL_DARK = '#4f4985'
const RUST = '#b96b4d'
const ALLOY = '#ffb14a'
const CELL = '#5fe9ff'

const part = (g: BufferGeometry, color: string, p: V3, r: V3 = [0, 0, 0]): BufferGeometry => paint(xform(g, p, r), color)

const pileParts = (): { lit: BufferGeometry[]; glow: BufferGeometry[] } => ({
  lit: [
    part(rcyl(0.95, 0.12, 0.04, 14, 2), STEEL_DARK, [0, 0.06, 0]),
    part(rbox(0.6, 0.3, 0.45, 0.3, 6, 4), STEEL, [-0.35, 0.28, 0.2], [0, 0.4, 0.1]),
    part(rbox(0.5, 0.22, 0.6, 0.3, 6, 4), RUST, [0.3, 0.24, -0.25], [0.2, 1.1, 0]),
    part(rbox(0.32, 0.32, 0.32, 0.3, 6, 4), STEEL, [0.45, 0.32, 0.35], [0.5, 0.7, 0.3]),
    part(rcyl(0.1, 0.9, 0.03, 8, 2), STEEL_DARK, [-0.1, 0.5, -0.45], [1.2, 0.2, 0.3])
  ],
  glow: [
    part(rbox(0.38, 0.13, 0.18, 0.35, 6, 4), ALLOY, [0.05, 0.47, 0.05], [0, 0.3, 0]),
    part(rbox(0.38, 0.13, 0.18, 0.35, 6, 4), ALLOY, [-0.08, 0.6, 0.12], [0, -0.4, 0]),
    part(rbox(0.38, 0.13, 0.18, 0.35, 6, 4), ALLOY, [0.18, 0.6, -0.08], [0, 1.1, 0]),
    part(rcyl(0.11, 0.34, 0.03, 10, 2), CELL, [-0.42, 0.55, -0.1], [0, 0, 0.3])
  ]
})

interface PileView {
  group: Group
  /** Being stripped bit by bit (`strip`): the breath stops. */
  stripping?: boolean
  /** Seconds since it was stripped; −1 while it lies there. */
  gone: number
  scale: number
}

export class SalvageView {
  readonly group = new Group()
  private views: PileView[] = []
  private geos: BufferGeometry[] = []
  /** An amber ring on the ground round each pile, so it is found from a perch. */
  private ringMat = new MeshBasicMaterial({ color: ALLOY, transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false, toneMapped: false })

  constructor(piles: readonly Pile[]) {
    this.group.name = 'salvage'
    const parts = pileParts()
    const lit = merge(parts.lit)
    const glow = merge(parts.glow)
    for (const g of [...parts.lit, ...parts.glow]) g.dispose()
    const ring = new RingGeometry(1.05, 1.3, 28)
    ring.rotateX(-Math.PI / 2)
    ring.translate(0, 0.04, 0)
    this.geos.push(lit, glow, ring)
    for (const p of piles) {
      const g = new Group()
      g.add(new Mesh(lit, toonVC()), new Mesh(glow, glowVC()), new Mesh(ring, this.ringMat))
      const scale = p.big ? 1.8 : 1.3
      g.position.set(p.x, p.y, p.z)
      g.rotation.y = (p.id * 2.39) % (Math.PI * 2)
      g.scale.setScalar(scale)
      this.group.add(g)
      this.views.push({ group: g, gone: -1, scale })
    }
  }

  /**
   * Stripped bit by bit (the salvage scene): `k` 0 … 1 of the way, the pile
   * shrinking as its parts come off; at 1 it sinks and is gone.
   */
  strip(id: number, k: number): void {
    const v = this.views[id]
    if (!v || v.gone >= 0) return
    if (k >= 1) { this.take(id); return }
    v.group.scale.setScalar(v.scale * (1 - 0.55 * Math.max(0, k)))
    v.stripping = k > 0
  }

  /** The pile was stripped: it sinks and is gone. */
  take(id: number): void {
    const v = this.views[id]
    if (v && v.gone < 0) v.gone = 0
  }

  update(dt: number, time: number): void {
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i]!
      if (v.gone < 0) {
        if (v.stripping) continue
        // A slow breath, so a pile catches the eye from a distance.
        v.group.scale.setScalar(v.scale * (1 + Math.sin(time * 2.2 + i) * 0.025))
        continue
      }
      if (!v.group.visible) continue
      v.gone += dt
      const k = Math.min(1, v.gone / 0.45)
      v.group.scale.setScalar(v.scale * (1 - k * k))
      if (k >= 1) v.group.visible = false
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose()
    this.ringMat.dispose()
    this.group.clear()
  }
}
