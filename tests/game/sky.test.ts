// The jam build's visual bugs: rocks split open down their seam; a chain's end hung in the air.
import { describe, expect, it } from 'vitest'
import { SphereGeometry } from 'three'
import { rock, weldKey } from '@/game/models/kit'

describe('rocks are closed', () => {
  it('a seam vertex at −0 and its twin at 0 share one weld key', () => {
    expect(weldKey(1, 0.5, -2.4e-16)).toBe(weldKey(1, 0.5, 0))
    expect(weldKey(-0.0001, 0, 0, 2)).toBe(weldKey(0, 0, 0, 2))
  })

  it('every vertex of a rock that started where another did ends where it does (no crack down the seam)', () => {
    for (const seed of [1, 7, 11, 23]) {
      const src = new SphereGeometry(1, 11, 8).attributes.position!
      const out = rock(1, seed, 11, 8).attributes.position!
      const at = new Map<string, [number, number, number]>()
      for (let i = 0; i < src.count; i++) {
        const key = weldKey(src.getX(i), src.getY(i), src.getZ(i))
        const p: [number, number, number] = [out.getX(i), out.getY(i), out.getZ(i)]
        const seen = at.get(key)
        if (seen) expect(Math.hypot(seen[0] - p[0], seen[1] - p[1], seen[2] - p[2]), `seed ${seed}`).toBeLessThan(1e-6)
        else at.set(key, p)
      }
    }
  })
})

describe('clouds in the sky (cheap: one draw call, no per-frame work but a turn)', () => {
  it('one instanced mesh, every cloud above the horizon and inside the dome, the ring turning with time', async () => {
    const { Scene, Vector3, Matrix4, InstancedMesh } = await import('three')
    const { buildSky, SKY_CLOUD_SPIN } = await import('@/game/world/sky')
    const scene = new Scene()
    const centre = new Vector3(40, 0, 30)
    const sky = buildSky(scene, centre)
    const ring = scene.getObjectByName('sky-cloud-ring')!
    const mesh = scene.getObjectByName('sky-clouds') as InstanceType<typeof InstancedMesh>
    expect(mesh.isInstancedMesh).toBe(true)
    expect(ring.children).toHaveLength(1)
    const m = new Matrix4()
    const p = new Vector3()
    let high = 0
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      // Low ones hug the horizon, high ones stand in the sky; none under the base's level.
      expect(p.y).toBeGreaterThan(5)
      if (p.y > 40) high++
      // Inside the 400 m dome even from a camera 80 m off the centre.
      expect(Math.hypot(p.x, p.z) + 80 + 40).toBeLessThan(400)
    }
    expect(high).toBeGreaterThan(0)
    expect(high).toBeLessThan(mesh.count)
    sky.update(new Vector3(), 100)
    expect(ring.rotation.y).toBeCloseTo(100 * SKY_CLOUD_SPIN, 9)
    sky.dispose()
  })
})
