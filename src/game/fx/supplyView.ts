import { DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type Material } from 'three'
import { buildAmmoCrate, buildAmmoPouch, buildFuelBarrel, buildRepairKit } from '../models/supplies'
import { glowVC, toonVC, toonVCInstanced } from '../models/toon'
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

/** How long a picked-up supply takes to fly into its bar on the HUD (#111). */
export const FLY_S = 0.65

interface Flight {
  supply: Supply
  g: Group
  t: number
  from: Vector3
}

export class SupplyView {
  readonly group = new Group()
  private kinds: Record<SupplyKind | 'barrel', Kind>
  /** Picked up, on their way into the HUD (#111). */
  private flights: Flight[] = []
  private flyLit = toonVC()
  private flyGlow = glowVC()

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

  /**
   * A supply just picked up flies to its bar on the HUD (#111): up off the
   * floor in an arc, toward `to` (a point in front of the camera over the
   * bar), shrinking until it is gone inside it.
   */
  fly(s: Supply): void {
    const k = this.kinds[s.kind]
    const g = new Group()
    g.add(new Mesh(k.lit.geometry, this.flyLit), new Mesh(k.glow.geometry, this.flyGlow))
    g.position.set(s.x, s.y, s.z)
    this.group.add(g)
    this.flights.push({ supply: s, g, t: 0, from: new Vector3(s.x, s.y + 0.2, s.z) })
  }

  /** Move the flights on; `to` says where each kind's bar is in the world. Returns those that arrived. */
  stepFlights(dt: number, to: (s: Supply) => Vector3): Supply[] {
    const done: Supply[] = []
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!
      f.t += dt
      const k = Math.min(1, f.t / FLY_S)
      const e = k * k * (3 - 2 * k)
      const end = to(f.supply)
      f.g.position.lerpVectors(f.from, end, e)
      f.g.position.y += Math.sin(k * Math.PI) * 0.9
      f.g.rotation.y = k * 6
      f.g.scale.setScalar(Math.max(0.02, 1 - 0.92 * e))
      if (k >= 1) {
        this.group.remove(f.g)
        this.flights.splice(i, 1)
        done.push(f.supply)
      }
    }
    return done
  }

  dispose(): void {
    this.flyLit.dispose()
    this.flyGlow.dispose()
    for (const k of Object.values(this.kinds)) {
      for (const g of k.geos) g.dispose()
      k.lit.dispose()
      k.glow.dispose()
    }
  }
}
