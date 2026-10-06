/**
 * ─── Device class, resolved once, from what the browser will actually tell us ─
 *
 * Written for a playtest report that the whole quality ladder could not act on
 * in time: a Chromebook on `ANGLE (freedreno, FD618, OpenGL ES 3.2)` at
 * `devicePixelRatio` 1.6 and a 1366x768 window, running the game at 5–12 fps
 * and quitting fifteen seconds in.
 *
 * ── Why the ladder was not enough ──
 *
 * `useVfx`'s calibration is a MEASUREMENT: it opens at `high`, watches the
 * median frame time and steps down. That is the right control for the steady
 * state and it is structurally too late for this player. The measurement needs
 * frames to measure, the resolution ratchet needs a sustained verdict on top of
 * that, and every one of those frames is rendered at the resolution the ladder
 * has not yet decided is wrong — 2.7 Mpx, at ~3.5 screens of fill each, on a
 * GPU that cannot do it. The player leaves during the measurement.
 *
 * A device that says `freedreno FD618` before the first frame does not need to
 * be measured to know it should not open at 2.7 Mpx. So this module reads the
 * three signals a browser gives away for free and hands back one word.
 *
 * ── What it is allowed to change ──
 *
 * Originally the canvas resolution and nothing else. Since round 5 it may not
 * touch resolution either: nothing draws below the display's own pixel ratio
 * (`renderer.ts`), because a canvas stretched up is a soft picture on exactly
 * the phones people play on. What a weak device gives up now is the backdrop
 * (`quality.ts`, low scenery) and MSAA; never the effect tier, the particle
 * budget or a renderer pass, which are what the game LOOKS like.
 *
 * ── Why the GPU string and not a benchmark ──
 *
 * A boot-time benchmark measures the machine while the machine is at its
 * busiest — parsing, compiling, decoding, baking — so it reads every device as
 * slow. The renderer string is free, stable, and names the exact part.
 */

export type DeviceClass = 'weak' | 'normal'

/**
 * GPUs that are known not to carry a full-resolution 2D canvas at 60 fps.
 *
 * Deliberately conservative — every entry is a part that ships in a budget
 * phone, a Chromebook or a software fallback, and nothing here is a GPU
 * anybody bought on purpose to play games with:
 *
 *   · `freedreno` / `FD3xx-FD6xx` — the open-source Adreno driver ChromeOS and
 *     Linux use. `FD618` is the exact part in the report this file exists for.
 *   · Adreno 3xx–6xx — the same silicon under Qualcomm's own driver. 7xx and
 *     8xx are not listed: they are current flagship parts.
 *   · Mali-T and Mali-G3x/G5x — ARM's budget line. G7x and up are not listed.
 *   · PowerVR and VideoCore — entry-level phones and the Raspberry Pi.
 *   · Intel HD/UHD 5xx/6xx — the integrated part in a decade of cheap laptops.
 *   · llvmpipe / SwiftShader / "Software" — no GPU at all. Nothing that lands
 *     here can afford full resolution, by definition.
 */
const WEAK_GPU = new RegExp([
  'freedreno',
  'fd[3-6]\\d\\d',
  'adreno[^0-9]*[3-6]\\d\\d',
  'mali-t\\d',
  'mali-g[35]\\d',
  'powervr',
  'videocore',
  'llvmpipe',
  'swiftshader',
  'software\\s*rasterizer',
  // Intel's integrated line reports as `Intel(R) UHD Graphics 620` — the
  // vendor word is separated from the part by a `(R)` and a comma, so the part
  // number carries the match on its own. Iris and Arc are deliberately absent.
  '\\bu?hd graphics [456]\\d\\d'
].join('|'), 'i')

/**
 * The GPU's own name, or `''` when the browser will not say.
 *
 * One throwaway WebGL context. `WEBGL_debug_renderer_info` is the unmasked
 * name; browsers that gate it for fingerprinting fall back to `RENDERER`,
 * which in Chrome is the same ANGLE string anyway and elsewhere is a generic
 * word that matches nothing below — a device we cannot identify is treated as
 * `normal`, which is the safe side of this guess.
 *
 * The context is explicitly lost afterwards rather than left to the collector:
 * a live WebGL context on a device with one shared memory pool is exactly the
 * thing this module is trying not to spend.
 */
const readRenderer = (): string => {
  try {
    if (typeof document === 'undefined') return ''
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const gl = (probe.getContext('webgl') ?? probe.getContext('experimental-webgl')) as
      WebGLRenderingContext | null
    if (!gl) return ''
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(
      (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null) ?? gl.getParameter(gl.RENDERER) ?? ''
    )
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return ''
  }
}

/**
 * The verdict for one renderer string, with no browser in it.
 *
 * Split out so the table above can be tested against the exact strings real
 * devices report — including `ANGLE (freedreno, FD618, OpenGL ES 3.2)`, the one
 * this file was written for — rather than only against whatever GPU the machine
 * running the suite happens to have.
 */
export const classifyRenderer = (renderer: string): DeviceClass =>
  WEAK_GPU.test(renderer) ? 'weak' : 'normal'

let cached: DeviceClass | null = null
let cachedRenderer = ''

/**
 * `weak` when the device has told us something that makes a full-resolution
 * canvas a bad opening bet. Resolved on the first call and remembered.
 *
 * `?device=weak|normal` pins it, for QA and for A/B arms — there is otherwise
 * no way to see what a Chromebook is shown from a desk.
 */
export const deviceClass = (): DeviceClass => {
  if (cached) return cached

  let pinned: string | null = null
  try { pinned = new URLSearchParams(window.location.search).get('device') } catch { /* no window */ }
  if (pinned === 'weak' || pinned === 'normal') {
    cached = pinned
    return cached
  }

  cachedRenderer = readRenderer()
  const nav = typeof navigator === 'undefined'
    ? undefined
    : navigator as Navigator & { deviceMemory?: number }
  // `deviceMemory` is Chrome-only and rounded down to a power of two, so 2 means
  // "2 GB or a browser lying downwards" — either way not a machine to open at
  // full resolution. `undefined` is most browsers and is not evidence.
  const tinyRam = typeof nav?.deviceMemory === 'number' && nav.deviceMemory <= 2
  const fewCores = typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2

  cached = (classifyRenderer(cachedRenderer) === 'weak' || tinyRam || fewCores) ? 'weak' : 'normal'
  return cached
}

/** The renderer string the class was decided from — diagnostics only. Empty
 *  until `deviceClass()` has run at least once. */
export const deviceRenderer = (): string => cachedRenderer

/**
 * An iPhone or iPad (iPadOS included, which reports a Mac user agent).
 *
 * iOS reports neither `deviceMemory` nor a weak GPU name ("Apple GPU"), so
 * every iPhone — a 3 GB one included — looked like a desktop-class device and
 * opened at full scenery. iOS kills a tab that grows too
 * large instead of slowing it down, and that reads as a crash. Until a real
 * device has been measured, iOS opens one step lighter (see PERF-LEDGER).
 */
export const isAppleTouch = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
}

/** Test seam: forget the answer. */
export const __resetDeviceClass = (): void => { cached = null; cachedRenderer = '' }
