import { AdditiveBlending, Color, ShaderMaterial } from 'three'

/**
 * ─── Hologram material (round 4, #87) ────────────────────────────────────────
 *
 * The training lessons are shown by a hologram of the mech over a projector
 * disc: translucent cyan, bright at its silhouette, scanlines running up it,
 * a flicker now and then and a glitch band, and a dissolve for when the
 * lesson is done. Additive with no depth write, so it never hides the room or
 * reads as a solid body (playtest 2: the old ghost looked like a target).
 *
 * One program for everything the hologram shows (the mech, a dummy, a rope):
 * the owner drives it with `setHologram(mat, time, fade)`.
 */

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vWorld;
varying float vRim;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorld = world.xyz;
  vec3 n = normalize(mat3(modelMatrix) * objectNormal);
  vec3 v = normalize(cameraPosition - world.xyz);
  vRim = 1.0 - abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const FRAG = /* glsl */`
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
varying vec3 vWorld;
varying float vRim;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  // Scanlines rising up the figure, and a brighter band sweeping through.
  float lines = 0.55 + 0.45 * step(0.5, fract(vWorld.y * 14.0 - uTime * 1.6));
  float sweep = smoothstep(0.0, 0.08, 0.08 - abs(fract(vWorld.y * 0.35 - uTime * 0.45) - 0.5) * 0.16);
  // A flicker now and then.
  float flick = 0.85 + 0.15 * step(0.08, hash(floor(uTime * 12.0)));
  // The dissolve: cells of the figure blink out as uFade goes to 0.
  float cell = hash(floor(vWorld.x * 9.0) * 7.1 + floor(vWorld.y * 9.0) * 13.3 + floor(vWorld.z * 9.0) * 3.7);
  if (cell > uFade) discard;
  float a = (0.16 + 0.55 * pow(vRim, 1.6)) * lines * flick + sweep * 0.25;
  gl_FragColor = vec4(uColor * a * 1.6, a) * uFade;
}
`

/** A hologram material; `skinned` for a rig's skinned mesh. */
export const makeHologramMaterial = (color = '#5fe9ff'): ShaderMaterial => new ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uFade: { value: 1 },
    uColor: { value: new Color(color) }
  },
  vertexShader: VERT,
  fragmentShader: FRAG,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false
})

/** Drive a hologram: the clock, and 1 shown … 0 dissolved. */
export const setHologram = (m: ShaderMaterial, time: number, fade: number): void => {
  m.uniforms.uTime!.value = time
  m.uniforms.uFade!.value = fade
}
