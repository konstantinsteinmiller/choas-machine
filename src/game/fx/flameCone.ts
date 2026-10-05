import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three'
import { sceneQuality } from '../engine/quality'

/**
 * ─── Flame material: a real fire look for jets, pillars and sheets ───────────
 *
 * The flame traps and vents used to be flat additive cones and curtains with
 * a flickering opacity: they read as coloured glass. This material draws fire
 * on the same geometry: domain-warped fractal noise climbing along the flame
 * (the UV's v runs mouth → tip) so its tongues curl, a ragged tip that eats
 * into the shape, a white-hot core down the axis near the mouth, a heat ramp
 * through orange to a deep red edge, smoky tears, embers riding out to the
 * tip, a flicker, and a soft falloff at grazing angles so a cone's silhouette
 * is soft rather than a hard ring. Additive, no depth write. A `glow` variant
 * draws the warm halo round a jet on a wider cone.
 *
 * One program for every flame (the defines only pick the noise depth and the
 * plane variant), so a sector compiles it once. Low-quality devices get two
 * noise octaves instead of four — the look holds, the cost halves.
 *
 * The owner drives it per frame with `setFlame(mat, power, time)`.
 */

export interface FlameColors {
  core: string
  mid: string
  edge: string
}

const VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalMatrix * normal;
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */`
uniform float uTime;
uniform float uPower;
uniform float uSeed;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    s += a * noise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
void main() {
  float v = vUv.y;
  float t = uTime;
  #ifdef PLANE
  float facing = 1.0 - abs(vUv.x - 0.5) * 2.0;
  #else
  // How squarely the surface faces the eye (1 head on, 0 edge on), per pixel:
  // interpolated from the vertices it is too coarse to fade the silhouette.
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  #endif
  // Domain-warped turbulence: licks that curl and climb, not a scrolling texture.
  vec2 p = vec2(vUv.x * 6.0 + uSeed, v * 3.0 - t * 3.6);
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3) + t * 0.45));
  float n = fbm(p + 1.8 * q);
  float n2 = fbm(vec2(vUv.x * 12.0 - uSeed, v * 6.0 - t * 6.5) + q);
  float ragged = (n - 0.5) * 0.7 + (n2 - 0.5) * 0.3;
  // The body: fat at the mouth, torn into tongues toward the tip.
  float body = smoothstep(1.0, 0.35, v + ragged * (0.4 + v)) * smoothstep(0.0, 0.05, v);
  #ifdef PLANE
  float soft = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 3.0);
  #else
  // Edge-on the cone fades out fully, ragged with the noise: no hard silhouette line.
  float soft = smoothstep(0.08, 0.55 + (n2 - 0.5) * 0.3, facing) * pow(facing, 0.4);
  #endif
  // The white-hot core runs down the axis (where the cone faces the eye), near the mouth.
  float core = pow(facing, 3.0) * smoothstep(0.75, 0.0, v + ragged * 0.3);
  float heat = clamp(1.0 - v * 1.15 + ragged * 0.9 + core * 0.5, 0.0, 1.0);
  vec3 col = mix(uEdge, uMid, smoothstep(0.1, 0.5, heat));
  col = mix(col, uCore, smoothstep(0.55, 0.9, heat));
  // Darker, smoky where a tongue tears.
  col *= mix(0.55, 1.0, smoothstep(0.25, 0.6, n));
  // Embers riding the flow out toward the tip.
  float ember = step(0.985, hash(floor(vec2(vUv.x * 40.0, v * 30.0 - t * 14.0)))) * smoothstep(0.3, 0.9, v) * body;
  float flick = 0.86 + 0.14 * sin(t * 31.0 + uSeed) * sin(t * 17.0 + uSeed * 0.5);
  #ifdef GLOW
  // The halo round the jet: wide, soft, warm, no detail.
  float a = body * pow(facing, 1.5) * 0.32 * uPower * flick;
  col = mix(uEdge, uMid, 0.65);
  #else
  // Tongues: nearly solid at the mouth, breaking into separate licks toward
  // the tip, so the fire has a shape and not the look of a lamp's beam.
  float tongues = smoothstep(0.32, 0.72, n + (1.0 - v) * 0.38);
  float a = (body * soft * tongues * (0.55 + 0.6 * n2) + ember * 0.9) * uPower * flick * 0.85;
  #endif
  if (a < 0.01) discard;
  // Kept under white: an additive flame on a light floor clips to a flat glare.
  gl_FragColor = vec4(col * (0.72 + heat * 0.5 + ember * 1.6), a);
  #include <colorspace_fragment>
}
`

let seed = 0

/**
 * A flame material (cone or, with `plane`, a sheet whose UV x spans it).
 * `glow`: the soft halo drawn round a jet on a wider cone (no detail).
 */
export const makeFlameMaterial = (c: FlameColors, plane = false, glow = false): ShaderMaterial => {
  const low = sceneQuality() === 'low'
  const defines: Record<string, number | string> = { OCTAVES: low ? 2 : 4 }
  if (plane) defines.PLANE = 1
  if (glow) defines.GLOW = 1
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPower: { value: 0 },
      uSeed: { value: (seed++ * 7.31) % 50 },
      uCore: { value: new Color(c.core) },
      uMid: { value: new Color(c.mid) },
      uEdge: { value: new Color(c.edge) }
    },
    defines,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false
  })
}

/** Drive a flame: `power` 0..1 (off .. full burn), the mission clock. */
export const setFlame = (m: ShaderMaterial, power: number, time: number): void => {
  m.uniforms.uPower!.value = power
  m.uniforms.uTime!.value = time
}
