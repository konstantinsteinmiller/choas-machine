import {
  BackSide, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Fog, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Scene, SphereGeometry, Vector3
} from 'three'
import { rock, sph, paint, paintBy } from '../models/kit'
import { toonVC } from '../models/toon'
import { mulberry32 } from './rng'
import { sceneQuality } from '../engine/quality'

/**
 * ─── Sky, light and the far distance ─────────────────────────────────────────
 *
 * A fortress floats in the open: a gradient sky dome (blue overhead, lilac,
 * a pink band at the horizon), one sun and a hemisphere light, haze that
 * fades the far end of the island into the horizon colour, and a ring of
 * distant islands and cloud puffs so the eye has something to measure the
 * height by.
 *
 * The backdrop is two instanced meshes (islands, clouds): two draw calls for
 * the whole distance, and half as many instances on a low-scenery device.
 */

export interface SkyColors {
  zenith: string
  mid: string
  horizon: string
  below: string
  sun: string
  skyLight: string
  groundLight: string
  cloud: string
  farIsland: string
  farIslandFoot: string
}

export const DUSK: SkyColors = {
  zenith: '#5a78ff',
  mid: '#a78bff',
  horizon: '#ffa6dc',
  below: '#3d2a80',
  sun: '#fff1f8',
  skyLight: '#d5dcff',
  groundLight: '#7a5cc4',
  cloud: '#ffd9f0',
  farIsland: '#8a78d2',
  farIslandFoot: '#3b2c78'
}

/** Where the haze starts and where it is complete, in metres. Far enough
 *  that a sniper sees across the whole base. */
export const HAZE_NEAR = 70
export const HAZE_FAR = 260

const SKY_RADIUS = 400

/** The dome: a sphere seen from inside, coloured by height. */
const buildDome = (c: SkyColors): Mesh => {
  const geo = new SphereGeometry(SKY_RADIUS, 24, 14)
  const zenith = new Color(c.zenith)
  const mid = new Color(c.mid)
  const horizon = new Color(c.horizon)
  const below = new Color(c.below)
  const pos = geo.attributes.position!
  const col = new Float32Array(pos.count * 3)
  const tmp = new Color()
  for (let i = 0; i < pos.count; i++) {
    // -1 straight down … 0 the horizon … 1 straight up.
    const k = pos.getY(i) / SKY_RADIUS
    if (k >= 0.35) tmp.copy(mid).lerp(zenith, Math.min(1, (k - 0.35) / 0.5))
    else if (k >= 0) tmp.copy(horizon).lerp(mid, k / 0.35)
    else tmp.copy(horizon).lerp(below, Math.min(1, -k / 0.3))
    col[i * 3] = tmp.r
    col[i * 3 + 1] = tmp.g
    col[i * 3 + 2] = tmp.b
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  geo.deleteAttribute('uv')
  geo.deleteAttribute('normal')
  const mat = new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false, fog: false, toneMapped: false })
  const dome = new Mesh(geo, mat)
  dome.name = 'sky'
  dome.renderOrder = -100
  dome.frustumCulled = false
  return dome
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _axis = new Vector3(0, 1, 0)

/** A ring of far islands around the base, between `near` and `far` metres. */
const buildFarIslands = (c: SkyColors, count: number, centre: Vector3, near: number, far: number): InstancedMesh => {
  const top = new Color(c.farIsland)
  const foot = new Color(c.farIslandFoot)
  // One rock, flat on top and tapering below, painted by height.
  const geo = rock(1, 7)
  const pos = geo.attributes.position!
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y > 0.15) pos.setY(i, 0.15)
    else pos.setY(i, y * 1.7)
  }
  geo.computeVertexNormals()
  paintBy(geo, (_x, y) => (y > 0 ? top : foot.clone().lerp(top, Math.max(0, 1 + y / 1.7))))
  const mesh = new InstancedMesh(geo, toonVC(), count)
  mesh.name = 'far-islands'
  const rng = mulberry32(20261002)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.5
    const dist = near + rng() * (far - near)
    const size = 8 + rng() * 16
    _p.set(centre.x + Math.cos(a) * dist, centre.y - 24 + rng() * 40, centre.z + Math.sin(a) * dist)
    _q.setFromAxisAngle(_axis, rng() * Math.PI * 2)
    _s.set(size, size * (0.55 + rng() * 0.5), size * (0.7 + rng() * 0.5))
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

/** Cloud puffs: squashed spheres, unlit, drifting slowly round the base. */
const buildClouds = (c: SkyColors, count: number, centre: Vector3): { mesh: InstancedMesh; drift: (t: number) => void } => {
  const geo = paint(sph(1, 8, 6), c.cloud) as BufferGeometry
  const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false })
  const mesh = new InstancedMesh(geo, mat, count)
  mesh.name = 'clouds'
  mesh.frustumCulled = false
  const rng = mulberry32(77031)
  const seeds = Array.from({ length: count }, () => ({
    a: rng() * Math.PI * 2,
    dist: 120 + rng() * 150,
    y: -46 + rng() * 26,
    sx: 16 + rng() * 26,
    sy: 3 + rng() * 3,
    sz: 10 + rng() * 14,
    speed: 0.004 + rng() * 0.006
  }))
  const drift = (t: number): void => {
    for (let i = 0; i < count; i++) {
      const s = seeds[i]!
      const a = s.a + t * s.speed
      _p.set(centre.x + Math.cos(a) * s.dist, centre.y + s.y, centre.z + Math.sin(a) * s.dist)
      _q.setFromAxisAngle(_axis, -a)
      _s.set(s.sx, s.sy, s.sz)
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  drift(0)
  return { mesh, drift }
}

export interface Sky {
  group: Group
  /** Keep the dome centred on the camera, and drift the clouds. */
  update(cameraPos: Vector3, time: number): void
  dispose(): void
}

/**
 * Light the scene and surround it. `centre` is the middle of the base at
 * ground level; the far islands ring it.
 */
export const buildSky = (scene: Scene, centre: Vector3, c: SkyColors = DUSK): Sky => {
  const group = new Group()
  group.name = 'sky-group'
  const horizon = new Color(c.horizon)
  scene.background = horizon
  scene.fog = new Fog(horizon, HAZE_NEAR, HAZE_FAR)

  const hemi = new HemisphereLight(new Color(c.skyLight), new Color(c.groundLight), 1.15)
  const sun = new DirectionalLight(new Color(c.sun), 1.5)
  sun.position.set(0.55, 1, 0.35)
  group.add(hemi, sun, sun.target)

  const dome = buildDome(c)
  group.add(dome)

  const low = sceneQuality() === 'low'
  const islands = buildFarIslands(c, low ? 7 : 14, centre, 190, 300)
  const clouds = buildClouds(c, low ? 8 : 18, centre)
  group.add(islands, clouds.mesh)
  scene.add(group)

  // Clouds move slowly: their matrices are rewritten a few times a second,
  // not every frame.
  let lastDrift = -1
  return {
    group,
    update: (cameraPos, time) => {
      dome.position.copy(cameraPos)
      if (time - lastDrift > 0.25) {
        clouds.drift(time)
        lastDrift = time
      }
    },
    dispose: () => {
      dome.geometry.dispose()
      ;(dome.material as MeshBasicMaterial).dispose()
      islands.geometry.dispose()
      islands.dispose()
      clouds.mesh.geometry.dispose()
      ;(clouds.mesh.material as MeshBasicMaterial).dispose()
      clouds.mesh.dispose()
      scene.remove(group)
    }
  }
}
