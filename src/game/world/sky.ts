import {
  BackSide, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Euler, Float32BufferAttribute, Fog, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Scene, SphereGeometry, Vector3
} from 'three'
import { rbox, rock, sph, torus, paint, paintBy } from '../models/kit'
import { toonVCInstanced } from '../models/toon'
import { mulberry32 } from './rng'
import { sceneQuality } from '../engine/quality'

/**
 * ─── Sky, light and the far distance ─────────────────────────────────────────
 *
 * A fortress stands on a mountain top above a sea of clouds (#59: a place,
 * not a flying island): a gradient sky dome (blue overhead, lilac, a pink
 * band at the horizon), one sun and a hemisphere light, haze that fades the
 * far end into the horizon colour, the cloud sea below with rock spires
 * standing out of it, the mountain under the base going down into it, and
 * two great chains anchoring the base to the nearest spires.
 *
 * The backdrop is a handful of instanced meshes (islands, spires, the cloud
 * sea, drifting clouds, chain links): a draw call each for the whole
 * distance, and about half as many instances on a low-scenery device.
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
  const mesh = new InstancedMesh(geo, toonVCInstanced(), count)
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

/** The sea of clouds the mountains stand in: flat, wide puffs at one level. */
export const CLOUD_SEA_Y = -32

const buildCloudSea = (c: SkyColors, count: number, centre: Vector3, inner: number): InstancedMesh => {
  const geo = paint(sph(1, 16, 9), c.cloud) as BufferGeometry
  const pos = geo.attributes.position!
  const col = geo.attributes.color!
  const under = new Color(c.mid)
  const top = new Color(c.cloud)
  const tmp = new Color()
  // Lit on top, lilac underneath.
  for (let i = 0; i < pos.count; i++) {
    tmp.copy(under).lerp(top, Math.min(1, Math.max(0, (pos.getY(i) + 0.6) / 1.2)))
    col.setXYZ(i, tmp.r, tmp.g, tmp.b)
  }
  const mat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const mesh = new InstancedMesh(geo, mat, count)
  mesh.name = 'cloud-sea'
  const rng = mulberry32(5150)
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2
    const dist = inner + Math.sqrt(rng()) * (360 - inner)
    _p.set(centre.x + Math.cos(a) * dist, centre.y + CLOUD_SEA_Y + rng() * 4, centre.z + Math.sin(a) * dist)
    _q.setFromAxisAngle(_axis, rng() * Math.PI)
    _s.set(26 + rng() * 34, 5 + rng() * 5, 20 + rng() * 26)
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

/** Tall rock spires standing out of the cloud sea, rounded and low in polygons. */
const buildSpires = (c: SkyColors, spots: ReadonlyArray<{ x: number; z: number; h: number; r: number }>): InstancedMesh => {
  const top = new Color(c.farIsland)
  const foot = new Color(c.farIslandFoot)
  const geo = rock(1, 11, 8, 8)
  paintBy(geo, (_x, y) => foot.clone().lerp(top, Math.min(1, Math.max(0, (y + 1) / 2))))
  const mesh = new InstancedMesh(geo, toonVCInstanced(), spots.length)
  mesh.name = 'spires'
  spots.forEach((s, i) => {
    _p.set(s.x, CLOUD_SEA_Y + s.h / 2 - 8, s.z)
    _q.setFromAxisAngle(_axis, i * 1.7)
    _s.set(s.r, s.h / 2, s.r * 0.85)
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

/** The mountain under the base: a rough, wide-footed rock from under the island down into the clouds. */
const buildMountain = (c: SkyColors, centre: Vector3, half: number): Mesh => {
  const geo = new CylinderGeometry(half * 0.62, half * 1.05, 44, 14, 5, true)
  const pos = geo.attributes.position!
  const rng = mulberry32(9091)
  const bumps = new Map<string, number>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`
    let k = bumps.get(key)
    if (k === undefined) { k = 0.85 + rng() * 0.3; bumps.set(key, k) }
    pos.setX(i, pos.getX(i) * k)
    pos.setZ(i, pos.getZ(i) * k)
  }
  geo.computeVertexNormals()
  const topC = new Color(c.farIsland).lerp(new Color(c.farIslandFoot), 0.4)
  const footC = new Color(c.farIslandFoot)
  paintBy(geo, (_x, y) => footC.clone().lerp(topC, Math.min(1, Math.max(0, (y + 22) / 44))))
  const mesh = new Mesh(geo, toonVCInstanced())
  mesh.name = 'mountain'
  mesh.position.set(centre.x, centre.y - 22 - 6, centre.z)
  return mesh
}

/** Two great chains from the base's edge to the tops of two spires, link by link. */
const buildChains = (c: SkyColors, ends: ReadonlyArray<{ a: Vector3; b: Vector3 }>): Group => {
  const group = new Group()
  group.name = 'chains'
  const LINK = 1.7
  const links: Array<{ p: Vector3; q: Quaternion }> = []
  const anchors: BufferGeometry[] = []
  const e = new Euler()
  for (const { a, b } of ends) {
    const span = a.distanceTo(b)
    const n = Math.max(4, Math.round(span / LINK))
    const sag = span * 0.12
    const prev = new Vector3()
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const p = new Vector3().lerpVectors(a, b, t)
      p.y -= Math.sin(t * Math.PI) * sag
      if (k > 0) {
        const mid = prev.clone().add(p).multiplyScalar(0.5)
        const dir = p.clone().sub(prev).normalize()
        const yaw = Math.atan2(dir.x, dir.z)
        const pitch = -Math.asin(dir.y)
        // Every other link turned a quarter round its own length.
        e.set(pitch, yaw, k % 2 ? Math.PI / 2 : 0, 'YXZ')
        links.push({ p: mid, q: new Quaternion().setFromEuler(e) })
      }
      prev.copy(p)
    }
    for (const at of [a, b]) {
      const g = paint(rbox(2.4, 1.6, 2.4, 0.4, 6, 4), c.farIslandFoot) as BufferGeometry
      g.translate(at.x, at.y - 0.4, at.z)
      anchors.push(g)
    }
  }
  const linkGeo = paint(torus(0.62, 0.17, 5, 10), '#4f4985') as BufferGeometry
  linkGeo.rotateX(Math.PI / 2)
  linkGeo.scale(1, 1, 1.5)
  const mesh = new InstancedMesh(linkGeo, toonVCInstanced(), links.length)
  links.forEach((l, i) => mesh.setMatrixAt(i, _m.compose(l.p, l.q, _s.set(1, 1, 1))))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  group.add(mesh)
  for (const g of anchors) group.add(new Mesh(g, toonVCInstanced()))
  return group
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
export const buildSky = (scene: Scene, centre: Vector3, c: SkyColors = DUSK, ground?: { w: number; d: number }): Sky => {
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
  const islands = buildFarIslands(c, low ? 5 : 9, centre, 230, 320)
  const clouds = buildClouds(c, low ? 8 : 18, centre)
  group.add(islands, clouds.mesh)
  // The mountain the base stands on, the cloud sea, spires out of it, and
  // (round a fortress) two chains to the nearest spires.
  const half = ground ? Math.max(ground.w, ground.d) / 2 : 40
  const sea = buildCloudSea(c, low ? 55 : 120, centre, ground ? half * 0.5 : 20)
  const rng = mulberry32(31337)
  const spots: Array<{ x: number; z: number; h: number; r: number }> = []
  const nSpires = low ? 7 : 12
  for (let i = 0; i < nSpires; i++) {
    const a = (i / nSpires) * Math.PI * 2 + rng() * 0.4
    const dist = half + 60 + rng() * 170
    spots.push({ x: centre.x + Math.cos(a) * dist, z: centre.z + Math.sin(a) * dist, h: 36 + rng() * 46, r: 7 + rng() * 7 })
  }
  const extra: Array<Mesh | Group | InstancedMesh> = [sea]
  let chains: Group | null = null
  if (ground) {
    // Two nearer spires for the chains: one off each long side, a little lower than the base.
    const anchorSpires = [
      { x: centre.x - half - 38, z: centre.z - half * 0.3, h: 42, r: 9 },
      { x: centre.x + half + 42, z: centre.z + half * 0.35, h: 44, r: 10 }
    ]
    spots.push(...anchorSpires)
    const mountain = buildMountain(c, centre, half)
    extra.push(mountain)
    chains = buildChains(c, anchorSpires.map((s, k) => ({
      a: new Vector3(centre.x + (k === 0 ? -ground.w / 2 + 3 : ground.w / 2 - 3), centre.y - 1.5, s.z),
      b: new Vector3(s.x + (k === 0 ? 4 : -4), CLOUD_SEA_Y + s.h - 8, s.z)
    })))
    extra.push(chains)
  }
  const spires = buildSpires(c, spots)
  extra.push(spires)
  group.add(...extra)
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
      for (const o of extra) {
        o.traverse((n) => {
          const m = n as Mesh
          if (!m.isMesh) return
          m.geometry.dispose()
          ;(m.material as MeshBasicMaterial).dispose()
          if ((m as unknown as InstancedMesh).isInstancedMesh) (m as unknown as InstancedMesh).dispose()
        })
      }
      clouds.mesh.geometry.dispose()
      ;(clouds.mesh.material as MeshBasicMaterial).dispose()
      clouds.mesh.dispose()
      scene.remove(group)
    }
  }
}
