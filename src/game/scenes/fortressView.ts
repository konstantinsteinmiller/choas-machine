import { PerspectiveCamera, Vector3 } from 'three'
import { getRenderer } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'
import { noSlice, type Slice } from '../engine/slicer'
import { CELL } from '../world/grid'
import type { Fortress } from '../world/fortress'
import { buildFortressMesh, type FortressMesh } from '../world/fortressMesh'
import { buildDecor, type DecorMesh } from '../world/decor'
import { buildSky, type Sky } from '../world/sky'

/**
 * A fortress on a turntable: the island, its sky and its dressing, with the
 * camera orbiting it. It is what the game shows until the mission mode takes
 * over, and what the fortress bench (`?view=az,el,dist` on the URL) frames a
 * layout with while it is being authored.
 */
export interface ViewAngle {
  /** Degrees round the island; absent = a slow orbit. */
  az?: number
  /** Degrees above the horizon. */
  el: number
  /** Metres from the island's centre. */
  dist: number
  /** Narrow the lens (a scope's view), in degrees of vertical field. */
  fov?: number
}

export class FortressView implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(55, 1, 0.5, 900)
  private mesh!: FortressMesh
  private decor!: DecorMesh
  private sky!: Sky
  private centre = new Vector3()
  private t = 0

  private constructor(readonly fortress: Fortress, private angle: ViewAngle) {}

  static async create(
    fortress: Fortress, angle: ViewAngle = { el: 32, dist: 78 }, slice: Slice = noSlice, onProgress: (p01: number) => void = () => {}
  ): Promise<FortressView> {
    const v = new FortressView(fortress, angle)
    v.centre.set((fortress.grid.w * CELL) / 2, 2, (fortress.grid.d * CELL) / 2)
    v.sky = buildSky(v.scene, v.centre)
    v.mesh = await buildFortressMesh(fortress, undefined, slice, onProgress)
    v.decor = buildDecor(fortress.decor)
    v.scene.add(v.mesh.group, v.decor.group)
    v.place(0)
    return v
  }

  private place(t: number): void {
    const az = ((this.angle.az ?? 215 + t * 4) * Math.PI) / 180
    const el = (this.angle.el * Math.PI) / 180
    const d = this.angle.dist
    this.camera.position.set(
      this.centre.x + Math.sin(az) * Math.cos(el) * d,
      this.centre.y + Math.sin(el) * d,
      this.centre.z + Math.cos(az) * Math.cos(el) * d
    )
    this.camera.lookAt(this.centre)
  }

  enter(): void {
    if (this.angle.fov) {
      this.camera.fov = this.angle.fov
      this.camera.updateProjectionMatrix()
    }
  }

  resize(): void {
    // The app resets the lens for the aspect; a pinned view keeps its own.
    this.enter()
  }

  update(dt: number): void {
    this.t += dt
  }

  render(): void {
    this.place(this.t)
    this.sky.update(this.camera.position, this.t)
    const r = getRenderer()
    r.info.reset()
    r.render(this.scene, this.camera)
  }

  dispose(): void {
    this.mesh.dispose()
    this.decor.dispose()
    this.sky.dispose()
  }
}

/** `?view=az,el,dist[,fov]` → a pinned camera; `az` may be `orbit`. */
export const viewAngleFromUrl = (search: string): ViewAngle | undefined => {
  const raw = new URLSearchParams(search).get('view')
  if (!raw) return undefined
  const [az, el, dist, fov] = raw.split(',')
  const num = (s: string | undefined, d: number): number => (s !== undefined && Number.isFinite(Number(s)) ? Number(s) : d)
  return {
    az: az === 'orbit' || az === undefined ? undefined : num(az, 215),
    el: num(el, 32),
    dist: num(dist, 78),
    fov: fov !== undefined ? num(fov, 55) : undefined
  }
}
