import {
  AmbientLight, Color, CylinderGeometry, DirectionalLight, Fog, Mesh, MeshLambertMaterial,
  OctahedronGeometry, PerspectiveCamera, RingGeometry, MeshBasicMaterial, DoubleSide
} from 'three'
import { getRenderer } from '../engine/renderer'
import { newScene, type GameMode } from '../engine/app'

/**
 * The standby scene: a landing pad under a slow-turning marker. It stands in
 * for the Command Base until that scene is built, so the loader, the loop,
 * the pause gates and the platform signals all have a real mode to run.
 */
export class StandbyMode implements GameMode {
  scene = newScene()
  camera = new PerspectiveCamera(55, 1, 0.1, 200)
  private marker: Mesh
  private ring: Mesh
  private t = 0

  constructor() {
    const sky = new Color('#2a1b4d')
    this.scene.background = sky
    this.scene.fog = new Fog(sky, 18, 60)
    this.scene.add(new AmbientLight('#b9a6ff', 1.1))
    const sun = new DirectionalLight('#ffd1f0', 1.6)
    sun.position.set(4, 8, 3)
    this.scene.add(sun)

    const pad = new Mesh(
      new CylinderGeometry(4, 4.4, 0.5, 6),
      new MeshLambertMaterial({ color: '#5b4a9e', flatShading: true })
    )
    pad.position.y = -0.25
    this.scene.add(pad)

    this.ring = new Mesh(
      new RingGeometry(2.6, 2.8, 48),
      new MeshBasicMaterial({ color: '#5fe3f5', side: DoubleSide })
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.02
    this.scene.add(this.ring)

    this.marker = new Mesh(
      new OctahedronGeometry(0.9),
      new MeshLambertMaterial({ color: '#ff6fbd', flatShading: true })
    )
    this.marker.position.y = 1.6
    this.scene.add(this.marker)

    this.camera.position.set(0, 3.2, 9)
    this.camera.lookAt(0, 1.2, 0)
  }

  update(dt: number): void {
    this.t += dt
    this.marker.rotation.y = this.t * 0.9
    this.marker.position.y = 1.6 + Math.sin(this.t * 1.7) * 0.15
    this.ring.scale.setScalar(1 + Math.sin(this.t * 2.2) * 0.03)
  }

  render(): void {
    getRenderer().render(this.scene, this.camera)
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      ;(Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => mat.dispose())
    })
  }
}
