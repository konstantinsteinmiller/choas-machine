import { DynamicDrawUsage, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three'
import { buildAmmoCrate, buildAmmoPouch, buildFuelBarrel, buildRepairKit } from '../models/supplies'
import { glowVC, toonVCInstanced } from '../models/toon'
import type { Supply, SupplyKind } from '../sim/supplies'
import type { Barrel } from '../sim/barrels'

/**
 * ─── Supplies and barrels, drawn ─────────────────────────────────────────────
 *
 * Two instanced draws per kind (lit and glowing). A kit and a pouch turn and
 * bob a little so they read as things to pick up; a crate and a barrel stand
 * still. Taken or blown up: scaled to nothing.
 */

const MAX_POUCHES = 24

interface Kind {
  lit: InstancedMesh
  glow: InstancedMesh
  geos: BufferGeometry[]
}

const make = (built: { lit: BufferGeometry; glow: BufferGeometry }, n: number, litMat: Material, glowMat: Material): Kind => {
  const lit = new InstancedMesh(built.lit, litMat, Math.max(1, n))
  const glow = new InstancedMesh(built.glow, glowMat, Math.max(1, n))
  for (const m of [lit, glow]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.count = 0
    m.frustumCulled = false
  }
  return { lit, glow, geos: [built.lit, built.glow] }
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const UP = new Vector3(0, 1, 0)

export class SupplyView {
  readonly group = new Group()
  private kinds: Record<SupplyKind | 'barrel', Kind>

  constructor(supplies: readonly Supply[], barrels: readonly Barrel[]) {
    const count = (k: SupplyKind): number => supplies.filter(s => s.kind === k).length
    const lit = toonVCInstanced()
    const glow = glowVC()
    this.kinds = {
      kit: make(buildRepairKit(), count('kit'), lit, glow),
      crate: make(buildAmmoCrate(), count('crate'), lit, glow),
      pouch: make(buildAmmoPouch(), MAX_POUCHES, lit, glow),
      barrel: make(buildFuelBarrel(), barrels.length, lit, glow)
    }
    for (const k of Object.values(this.kinds)) this.group.add(k.lit, k.glow)
  }

  /** Write every instance for this frame. */
  update(supplies: readonly Supply[], barrels: readonly Barrel[], time: number): void {
    const n: Record<SupplyKind | 'barrel', number> = { kit: 0, crate: 0, pouch: 0, barrel: 0 }
    for (let i = 0; i < supplies.length; i++) {
      const s = supplies[i]!
      const k = this.kinds[s.kind]
      const at = n[s.kind]
      if (at >= k.lit.instanceMatrix.count) continue
      const floating = s.kind !== 'crate'
      _p.set(s.x, s.y + (floating ? 0.12 + Math.sin(time * 2.4 + i) * 0.06 : 0), s.z)
      _q.setFromAxisAngle(UP, floating ? time * 1.1 + i : (i * 1.7) % Math.PI)
      _s.setScalar(s.taken ? 0.0001 : floating ? 1.25 : 1)
      _m.compose(_p, _q, _s)
      k.lit.setMatrixAt(at, _m)
      k.glow.setMatrixAt(at, _m)
      n[s.kind] = at + 1
    }
    for (let i = 0; i < barrels.length; i++) {
      const b = barrels[i]!
      _p.set(b.x, b.y, b.z)
      _q.setFromAxisAngle(UP, (i * 2.1) % Math.PI)
      _s.setScalar(b.live ? 1 : 0.0001)
      _m.compose(_p, _q, _s)
      this.kinds.barrel.lit.setMatrixAt(i, _m)
      this.kinds.barrel.glow.setMatrixAt(i, _m)
      n.barrel = i + 1
    }
    for (const [key, k] of Object.entries(this.kinds) as Array<[SupplyKind | 'barrel', Kind]>) {
      k.lit.count = n[key]
      k.glow.count = n[key]
      k.lit.instanceMatrix.needsUpdate = true
      k.glow.instanceMatrix.needsUpdate = true
    }
  }

  dispose(): void {
    for (const k of Object.values(this.kinds)) {
      for (const g of k.geos) g.dispose()
      k.lit.dispose()
      k.glow.dispose()
    }
  }
}
