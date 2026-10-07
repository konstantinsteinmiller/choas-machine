import {
  Color, DataTexture, RedFormat, NearestFilter, MeshToonMaterial, MeshBasicMaterial,
  ShaderMaterial, BackSide, DoubleSide, UniformsLib, UniformsUtils, type Material, type Texture
} from 'three'
import { ISLANDS_SHARED } from '@/use/perfVariants'

/**
 * ─── The cel-shaded look ─────────────────────────────────────────────────────
 *
 * Every lit surface in the game is a `MeshToonMaterial` over ONE shared
 * four-step gradient ramp, and every character carries an inverted-hull
 * outline. Together they give the clean "3D sprite" read of the modern
 * blue-bomber games: flat bands of colour, a crisp dark rim, no noisy PBR.
 *
 * Colours are authored as sRGB hex and converted by three's colour management;
 * vertex colours are written in LINEAR space (`Color.setHex` does that), which
 * is why `lin()` exists.
 */

let ramp: DataTexture | null = null
/** The shared 4-band light ramp. Nearest-filtered so the bands stay hard. */
export const toonRamp = (): DataTexture => {
  if (ramp) return ramp
  const data = new Uint8Array([128, 190, 236, 255])
  ramp = new DataTexture(data, data.length, 1, RedFormat)
  ramp.minFilter = NearestFilter
  ramp.magFilter = NearestFilter
  ramp.generateMipmaps = false
  ramp.needsUpdate = true
  return ramp
}

/** Outline colour: deep ink purple rather than black — black outlines read as
 *  "comic", ink reads as "shaded edge" and survives the bright palettes. */
export const OUTLINE_COLOR = new Color('#1c1233')

const toonCache = new Map<string, MeshToonMaterial>()

/** Shared (cached) toon material for a flat colour. Use for props/level. */
export const toon = (hex: string, opts: { emissive?: string; emissiveIntensity?: number } = {}): MeshToonMaterial => {
  const key = `${hex}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 0}`
  const hit = toonCache.get(key)
  if (hit) return hit
  const m = new MeshToonMaterial({ color: new Color(hex), gradientMap: toonRamp() })
  if (opts.emissive) {
    m.emissive = new Color(opts.emissive)
    m.emissiveIntensity = opts.emissiveIntensity ?? 1
  }
  toonCache.set(key, m)
  return m
}

let vcToon: MeshToonMaterial | null = null
/** Shared vertex-coloured toon material (static level geometry). */
export const toonVC = (): MeshToonMaterial => {
  if (vcToon) return vcToon
  vcToon = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
  return vcToon
}

let vcToonGlow: MeshToonMaterial | null = null
/**
 * The same look, with glowing parts in the same mesh: a vertex whose `aGlow`
 * is 1 is drawn in its own colour, unlit (as `glowVC` draws it; the renderer
 * does no tone mapping, so it matches exactly). A static set's lit and
 * glowing parts are then ONE draw call (`propKit.assembleBatch`).
 */
export const toonGlowVC = (): MeshToonMaterial => {
  if (vcToonGlow) return vcToonGlow
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
  m.onBeforeCompile = (s) => {
    s.vertexShader = `attribute float aGlow;
varying float vGlow;
${s.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  vGlow = aGlow;`)}`
    s.fragmentShader = `varying float vGlow;
${s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, diffuseColor.rgb, vGlow);
  #include <opaque_fragment>`)}`
  }
  m.customProgramCacheKey = () => 'toon-glow'
  vcToonGlow = m
  return m
}

let vcToonInstanced: MeshToonMaterial | null = null
/**
 * The same look for an InstancedMesh, as a material of its own.
 *
 * One material drawn by both an InstancedMesh and a plain Mesh (or a skinned
 * and a plain one) makes the renderer re-derive its program every time the
 * two alternate in the draw list. Nothing recompiles, but the parameter
 * gathering and the program's cache-key string are rebuilt per draw: it was
 * 5 % of a throttled CPU in the stealth phase (PERF-LEDGER.md, entry 2).
 */
export const toonVCInstanced = (): MeshToonMaterial => {
  if (ISLANDS_SHARED) return toonVC()
  if (vcToonInstanced) return vcToonInstanced
  vcToonInstanced = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() })
  return vcToonInstanced
}

let levelPlain: MeshToonMaterial | null = null
/**
 * The fortress's lit material: vertex colours times the level's detail
 * atlas where there is a document to bake one in, plain vertex colours where
 * there is not (the unit tests build levels in Node). Drawn from both sides:
 * the level is simple geometry, and a face seen from behind (from inside a
 * wall, or under a ledge) must never show as a hole in the world.
 */
export const levelMaterial = (atlas: () => Texture): MeshToonMaterial => {
  if (typeof document !== 'undefined') return toonVCMap(atlas())
  levelPlain ??= new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), side: DoubleSide })
  return levelPlain
}

const glowMapCache = new Map<Texture, MeshToonMaterial>()
/**
 * The level's material with its lights folded in (#147): an `aGlow` of 1 on a
 * vertex draws it unlit at its own colour, as `glowVC` does, so a chunk's
 * floors, walls and lamps are one draw call instead of two.
 */
export const levelGlowMaterial = (atlas: () => Texture): MeshToonMaterial => {
  const map = typeof document !== 'undefined' ? atlas() : null
  const hit = map ? glowMapCache.get(map) : levelGlowPlain
  if (hit) return hit
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), side: DoubleSide, ...(map ? { map } : {}) })
  m.onBeforeCompile = (s) => {
    s.vertexShader = `attribute float aGlow;
varying float vGlow;
${s.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  vGlow = aGlow;`)}`
    s.fragmentShader = `varying float vGlow;
${s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, vColor.rgb, vGlow);
  #include <opaque_fragment>`)}`
  }
  m.customProgramCacheKey = () => (map ? 'level-glow-map' : 'level-glow')
  if (map) glowMapCache.set(map, m)
  else levelGlowPlain = m
  return m
}
let levelGlowPlain: MeshToonMaterial | null = null

const vcMapCache = new Map<Texture, MeshToonMaterial>()
/** Vertex-coloured toon material with a detail texture (the level's floors and walls), drawn from both sides. */
export const toonVCMap = (map: Texture): MeshToonMaterial => {
  const hit = vcMapCache.get(map)
  if (hit) return hit
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), map, side: DoubleSide })
  vcMapCache.set(map, m)
  return m
}

/** A PER-CHARACTER toon material (vertex coloured). Not cached: each rig gets
 *  its own instance so its hit-flash (`emissive`) does not flash every other
 *  enemy of the same kind. Same defines → same GL program, so the cost is a
 *  uniform upload, not a shader compile. */
export const rigToon = (): MeshToonMaterial =>
  new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: new Color(0, 0, 0) })

/** Unlit vertex-coloured material for glowing parts (eyes, visors, cores). */
export const rigGlow = (): MeshBasicMaterial =>
  new MeshBasicMaterial({ vertexColors: true, toneMapped: false })

let glowShared: MeshBasicMaterial | null = null
export const glowVC = (): MeshBasicMaterial => {
  if (glowShared) return glowShared
  glowShared = rigGlow()
  return glowShared
}

const basicCache = new Map<string, MeshBasicMaterial>()
export const glow = (hex: string): MeshBasicMaterial => {
  const hit = basicCache.get(hex)
  if (hit) return hit
  const m = new MeshBasicMaterial({ color: new Color(hex), toneMapped: false })
  basicCache.set(hex, m)
  return m
}

// ─── Inverted-hull outline ───────────────────────────────────────────────────
//
// A back-face-only copy of the mesh pushed out along its normals. Written as a
// ShaderMaterial with three's own skinning / instancing / fog chunks so the
// same material outlines a skinned character, an instanced crate and a static
// prop alike — and so a rig's outline is ONE extra draw call bound to the same
// skeleton, never one per body part.
//
// A character's parts each carry an `outlineBias` (#178): the part's ring is
// drawn that much nearer the eye, so it wins over the parts just behind it (an
// arm swung past the chest, a thigh into the hip) instead of being cut off
// where they come close. It is sized to the part (a fraction of its thinnest
// side) so it never darkens the part itself. Props have none (0).

const OUTLINE_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
uniform float uThickness;
attribute float outlineBias;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uThickness;
  #include <project_vertex>
  mvPosition.xyz -= normalize(mvPosition.xyz) * outlineBias * length(modelViewMatrix[0].xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`
const OUTLINE_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

const outlineCache = new Map<string, ShaderMaterial>()
/** Outline material of a given object-space thickness. Cached per thickness. */
/**
 * `skinned` is part of the cache key on purpose: see `toonVCInstanced`. A
 * character's outline and a prop's outline of the same thickness are two
 * materials.
 */
export const outlineMat = (thickness = 0.03, color: Color = OUTLINE_COLOR, skinned = false): ShaderMaterial => {
  const key = `${thickness.toFixed(4)}|${color.getHexString()}|${skinned ? 's' : 'm'}`
  const hit = outlineCache.get(key)
  if (hit) return hit
  const m = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uThickness: { value: thickness },
        uColor: { value: color.clone() },
        uOpacity: { value: 1 }
      }
    ]),
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: BackSide,
    fog: true
  })
  // A geometry without its own bias (props, batches) reads 0, not a stale value.
  ;(m as ShaderMaterial & { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues.outlineBias = [0]
  outlineCache.set(key, m)
  return m
}

/** Scratch colour for vertex-colour writes (linear space). */
const tmp = new Color()
export const lin = (hex: string): Color => tmp.set(hex)

export const disposeMaterial = (m: Material | Material[]): void => {
  if (Array.isArray(m)) m.forEach(x => x.dispose())
  else m.dispose()
}
