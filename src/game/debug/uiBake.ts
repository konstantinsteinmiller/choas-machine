import {
  CanvasTexture, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace,
  type WebGLRenderer
} from 'three'
import {
  cssFor, decodeSvg, drawRaster, findUnits, loadCss, paintRect, serializeUnit, styleWithoutPosition, svgDataUrl,
  type Rect, type Unit, type UnitKind
} from './domRaster'

/**
 * ─── UI bake: the HTML HUD drawn INTO the game canvas ────────────────────────
 *
 * DEBUG FEATURE, `VITE_APP_RENDER_UI_BAKE=true` only. Poki's playtest recorder
 * captures the canvas, not the page, so the HUD, the prompts and the modals —
 * all DOM — never appear in a playtest video. With the flag on, the DOM is
 * rasterized panel by panel (`domRaster.ts`) and every panel is drawn as a
 * textured quad over each rendered frame, so the canvas carries the UI. With
 * the flag off, `vite.config.ts` aliases this module to `uiBake.stub.ts` and
 * the call sites fold away: none of this code ships.
 *
 * A CYCLE runs every 5-8 frames: find the units (panels, markers, bubbles),
 * re-bake those whose DOM changed or that are animating (rationed, below),
 * move the quads of those that only moved. Every step waits for an idle
 * period with room for what it measured last time (`requestIdleCallback`), so
 * the bake spends FREE frame time; once a cycle is overdue (`MAX_FRAMES`) one
 * step runs regardless (rationed: `FORCED_SHARE`), so a loaded device still
 * gets its UI, a little later, instead of never.
 *
 * Each panel rasterizes on a CPU canvas inside its own measured step and
 * uploads as its own small texture. Measured first the other way — every
 * panel composited on one accelerated 2D canvas, uploaded full-screen — the
 * GPU process did that work out of sight of the idle scheduling and the
 * production build dropped ~19 % of frames.
 *
 * The player keeps seeing the live DOM on top; the bake sits under it (the
 * same pixels, a few frames old). While the game loop is paused (a modal,
 * the pause menu), a finished cycle asks for a redraw itself, so a recording
 * shows the modal too.
 */

/** Earliest and latest frame count between two cycles. */
export const MIN_FRAMES = 5
export const MAX_FRAMES = 8
const FRAME_MS = 1000 / 60
/**
 * With no idle time at all (a loaded device), an overdue step runs anyway, but
 * forced work never takes more than `FORCED_SHARE` of the main thread: after a
 * forced step of t ms the next waits t / FORCED_SHARE (and at least
 * `FORCE_MS`). The UI's cadence stretches; the game's frames barely do — a
 * playtest on a weak device must not play slower than it would without this.
 */
const FORCE_MS = 250
const FORCED_SHARE = 0.05
/**
 * Bakes are rationed: the browser decodes each SVG in a task of its own that
 * no idle scheduling reaches. At most this many per cycle (new panels first),
 * and a panel re-bakes for changed content at most every `CONTENT_MS`, for an
 * animation alone (a pulse, a blink) at most every `ANIM_MS`.
 */
const BAKES_PER_CYCLE = 2
const NEW_PER_CYCLE = 4
const CONTENT_MS = 150
const ANIM_MS = 400

export interface UiBakeHost {
  canvas: HTMLCanvasElement
  /** Draw the game once (the loop is paused, a fresh bake has landed). */
  redraw(): void
  /** Whether the game loop is drawing frames by itself. */
  running(): boolean
}

/** One unit's quad: its own canvas, texture and mesh. */
interface Baked {
  kind: UnitKind
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: CanvasTexture
  mesh: Mesh
  /** The unit's box and paint rect when it was baked, CSS px. */
  box: Rect
  paint: Rect
  dpr: number
  /** The viewport it was baked for (rem, vmin and breakpoints follow it). */
  vw: number
  vh: number
  /** performance.now() of the bake. */
  at: number
  /** Raster units: what was drawn (source, size, clip), to redraw only on change. */
  key: string
}

let host: UiBakeHost | null = null
/** The game's renderer, known from the first frame drawn: uploads go through it in idle time. */
let gl: WebGLRenderer | null = null
const layer = new Scene()
const camera = new OrthographicCamera(0, 1, 0, -1, -1, 1)
const quadGeometry = new PlaneGeometry(1, 1)

const baked = new Map<Element, Baked>()
/** Nodes whose content changed since the last cycle (text, children, attributes). */
let touched = new Set<Node>()
/** Elements whose attributes changed (beyond a move): every unit inside them re-bakes. */
let restyled = new Set<Element>()
/** Elements running a CSS animation or transition this cycle. */
let animated = new Set<Element>()

type Reason = 'new' | 'content' | 'anim'
/** Units that need a bake, kept across cycles until they get one. */
const pending = new Map<Element, { reason: Reason; since: number }>()

let frames = 0
/** The last window resize, and how long after it new panels bake faster. */
let resizedAt = -Infinity
/** The viewport the quads were last placed for. */
let placedVw = 0
let placedVh = 0
const RESIZE_CATCHUP_MS = 3000
const NEW_AFTER_RESIZE = 12
let forcedAt = -Infinity
let forcedGap = FORCE_MS
let busy = false
let failures = 0
/** EMA of each sync step's cost, ms, so a step waits for an idle slot it fits. */
const cost = { walk: 1, serialize: 1, draw: 2, raster: 0.5, place: 0.5 }
/** For the console: `__uiBake`. */
const stats = { cycles: 0, bakes: 0, units: 0, failures: 0, cycleMs: 0, busyMs: 0, forced: 0, why: { new: 0, content: 0, anim: 0 }, frameMs: 0, redraws: 0, cost }

const ric: (cb: IdleRequestCallback, opt?: IdleRequestOptions) => number =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    // Safari: no idle callbacks. A task right after the frame, with the
    // frame's leftover time as the deadline.
    : (cb) => window.setTimeout(() => {
        const start = performance.now()
        cb({ didTimeout: false, timeRemaining: () => Math.max(0, FRAME_MS - 4 - (performance.now() - start)) })
      }, 0)

interface Step { ms: number; run: () => void }
const queue: Step[] = []
let pumping = false

/**
 * The idle pump: runs queued steps while the idle period has room for the
 * next one (what that step measured last time), several per period when they
 * fit. Once the cycle is overdue, a step runs without room, within `FORCED_SHARE`.
 */
const pump = async (d: IdleDeadline): Promise<void> => {
  for (;;) {
    const step = queue[0]
    if (!step) break
    // Headroom: Chrome's idle estimate leaves out work still to come in the frame.
    let forced = false
    if (d.timeRemaining() < step.ms * 1.5 + 1) {
      if (frames < MAX_FRAMES || performance.now() - forcedAt < forcedGap) break
      forced = true
      stats.forced++
    }
    queue.shift()
    const t = performance.now()
    step.run()
    if (forced) {
      forcedAt = performance.now()
      forcedGap = Math.max(FORCE_MS, (forcedAt - t) / FORCED_SHARE)
    }
    // Let the bake's promise chain queue its next step into this same period.
    for (let i = 0; i < 4; i++) await null
  }
  if (queue.length) ric(d2 => void pump(d2), { timeout: FRAME_MS })
  else pumping = false
}

/** Run `fn` in idle time (see `pump`). */
const whenIdle = <T>(ms: number, fn: () => T): Promise<T> => new Promise((resolve, reject) => {
  queue.push({ ms, run: () => { try { resolve(fn()) } catch (e) { reject(e) } } })
  if (!pumping) { pumping = true; ric(d => void pump(d), { timeout: FRAME_MS }) }
})

const timed = <T>(key: keyof typeof cost, fn: () => T): T => {
  const t = performance.now()
  const r = fn()
  const ms = performance.now() - t
  cost[key] = cost[key] * 0.7 + ms * 0.3
  stats.busyMs += ms
  return r
}

const viewport = () => ({ vw: Math.max(1, window.innerWidth), vh: Math.max(1, window.innerHeight) })

/** The game canvas's own backing ratio: the bake is exactly as sharp as the frame. */
const dprOf = (c: HTMLCanvasElement): number => c.width / Math.max(1, c.clientWidth || window.innerWidth)

/** A unit's quad, made on first use. */
const quadFor = (u: Unit): Baked => {
  let b = baked.get(u.el)
  if (b && b.kind === u.kind) return b
  if (b) drop(u.el, b)
  const canvas = document.createElement('canvas')
  // A CPU canvas: the SVG rasterizes HERE, inside the measured step, not
  // later in the GPU process where no idle scheduling sees it.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  const mesh = new Mesh(quadGeometry, new MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false
  }))
  mesh.visible = false
  mesh.frustumCulled = false
  layer.add(mesh)
  b = { kind: u.kind, canvas, ctx, texture, mesh, box: u.box, paint: u.box, dpr: 0, vw: 0, vh: 0, at: 0, key: '' }
  baked.set(u.el, b)
  return b
}

const drop = (el: Element, b: Baked): void => {
  layer.remove(b.mesh)
  b.texture.dispose()
  ;(b.mesh.material as MeshBasicMaterial).dispose()
  baked.delete(el)
}

/**
 * Upload a quad's texture NOW, inside the idle step that drew it. Left to
 * three.js it would upload lazily during the next frame's render, which is
 * exactly the frame time the bake must not take (measured: the game's draw
 * phase ~20 % slower on a 2× throttled CPU).
 */
const upload = (b: Baked): void => {
  b.texture.needsUpdate = true
  gl?.initTexture(b.texture)
}

/** Size a quad's canvas; a new size needs a new texture (WebGL2 storage is immutable). */
const resize = (b: Baked, w: number, h: number): void => {
  if (b.canvas.width === w && b.canvas.height === h) { b.ctx.clearRect(0, 0, w, h); return }
  b.canvas.width = w
  b.canvas.height = h
  b.texture.dispose()
}

/** Why this unit needs a bake, if it does. */
const bakeReason = (u: Unit, prev: Baked | undefined, dpr: number): Reason | null => {
  const { vw, vh } = viewport()
  if (!prev || prev.kind !== u.kind || prev.dpr !== dpr || (prev.kind !== 'raster' && (prev.vw !== vw || prev.vh !== vh))) return 'new'
  if (Math.abs(prev.box.w - u.box.w) > 0.5 || Math.abs(prev.box.h - u.box.h) > 0.5) return 'new'
  const hit = (t: Node) => (u.kind === 'tree' ? u.el.contains(t) : t === u.el || (t.parentNode === u.el && t.nodeType === 3))
  for (const t of touched) if (hit(t)) return 'content'
  for (const e of restyled) if (e !== u.el && e.contains(u.el)) return 'content'
  for (const e of animated) if (hit(e) || e.contains(u.el)) return 'anim'
  return null
}

const RANK: Record<Reason, number> = { new: 0, content: 1, anim: 2 }

/** This cycle's share of the pending bakes: new panels first, then the longest waiting, each within its rate. */
const pickBakes = (units: Unit[], dpr: number): Unit[] => {
  const now = performance.now()
  for (const u of units) {
    if (u.kind === 'raster') continue
    const why = bakeReason(u, baked.get(u.el), dpr)
    if (!why) continue
    const was = pending.get(u.el)
    // The strongest reason wins; the wait counts from the first.
    if (!was) pending.set(u.el, { reason: why, since: now })
    else if (RANK[why] < RANK[was.reason]) was.reason = why
  }
  const fresh: Unit[] = []
  const due: Array<{ u: Unit; since: number }> = []
  for (const u of units) {
    const p = pending.get(u.el)
    if (!p) continue
    if (p.reason === 'new') { fresh.push(u); continue }
    const last = baked.get(u.el)?.at ?? 0
    if (now - last >= (p.reason === 'anim' ? ANIM_MS : CONTENT_MS)) due.push({ u, since: p.since })
  }
  due.sort((x, y) => x.since - y.since)
  // Just after a resize every panel is stale at once: catch up faster.
  const newCap = now - resizedAt < RESIZE_CATCHUP_MS ? NEW_AFTER_RESIZE : NEW_PER_CYCLE
  const out = [...fresh.slice(0, newCap), ...due.slice(0, BAKES_PER_CYCLE).map(d => d.u)]
  for (const u of out) {
    stats.why[pending.get(u.el)!.reason]++
    pending.delete(u.el)
  }
  return out
}

interface Job { u: Unit; box: Rect; paint: Rect; vw: number; vh: number; img: Promise<HTMLImageElement | null> }

/** Serialize one unit and start its decode. */
const prepare = (u: Unit): Promise<Job | null> => {
  const { vw, vh } = viewport()
  return whenIdle(cost.serialize, () => timed('serialize', () => {
    if (!u.el.isConnected) return null
    // Fresh: frames may have passed since the walk.
    const r = u.el.getBoundingClientRect()
    u.box = { x: r.left, y: r.top, w: r.width, h: r.height }
    const paint = paintRect(u, vw, vh)
    if (!paint.w || !paint.h) return null
    const url = svgDataUrl(cssFor(u), serializeUnit(u, vw, vh), vw, vh)
    // One unit that will not decode is skipped, not the whole cycle.
    return { u, paint, box: { ...u.box }, vw, vh, img: decodeSvg(url, vw, vh).catch(() => null) }
  }))
}

/** Rasterize a decoded unit into its quad's canvas at css × dpr. */
const finish = async (job: Job, dpr: number): Promise<void> => {
  const img = await job.img
  if (!img || !job.u.el.isConnected) return
  // Baked for a viewport that has since changed (a resize mid-cycle): its
  // layout is the old one. Dropped, and baked again for the new one; landed,
  // it put the scope's ring half a lens off its centre in a playtest.
  const now = viewport()
  if (now.vw !== job.vw || now.vh !== job.vh) {
    pending.set(job.u.el, { reason: 'new', since: performance.now() })
    return
  }
  await whenIdle(cost.draw, () => timed('draw', () => {
    const { u, paint } = job
    const b = quadFor(u)
    // Drawn at the destination size, so the SVG rasterizes at css × dpr:
    // never below the display's own ratio (soft text in the recording).
    resize(b, Math.max(1, Math.round(paint.w * dpr)), Math.max(1, Math.round(paint.h * dpr)))
    b.ctx.drawImage(img, paint.x, paint.y, paint.w, paint.h, 0, 0, b.canvas.width, b.canvas.height)
    upload(b)
    Object.assign(b, { box: job.box, paint, dpr, vw: job.vw, vh: job.vh, at: performance.now() })
    stats.bakes++
  }))
}

/** A raster unit (img, canvas, video) redrawn from the live element when it changed. */
const rasterize = (u: Unit, dpr: number, vw: number, vh: number): void => {
  const clip = u.clip ?? { x: 0, y: 0, w: vw, h: vh }
  const x0 = Math.max(u.box.x, clip.x), y0 = Math.max(u.box.y, clip.y)
  const x1 = Math.min(u.box.x + u.box.w, clip.x + clip.w), y1 = Math.min(u.box.y + u.box.h, clip.y + clip.h)
  if (x1 <= x0 || y1 <= y0) return
  const el = u.el as HTMLImageElement
  const live = u.el.localName !== 'img'
  const key = `${el.currentSrc ?? ''}|${u.box.w}x${u.box.h}|${x0 - u.box.x},${y0 - u.box.y},${x1 - x0},${y1 - y0}|${u.opacity}`
  const b = quadFor(u)
  const paint = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  if (live || b.key !== key || b.dpr !== dpr) {
    resize(b, Math.max(1, Math.round(paint.w * dpr)), Math.max(1, Math.round(paint.h * dpr)))
    b.ctx.setTransform(dpr, 0, 0, dpr, -paint.x * dpr, -paint.y * dpr)
    drawRaster(b.ctx, u)
    b.ctx.setTransform(1, 0, 0, 1, 0, 0)
    // A cross-origin image would taint the canvas and WebGL would throw on
    // every upload: such a unit is simply left out.
    try { b.ctx.getImageData(0, 0, 1, 1) } catch { drop(u.el, b); return }
    upload(b)
    b.key = key
  }
  Object.assign(b, { box: { ...u.box }, paint, dpr })
}

/** Put every quad where its unit is now, in paint order; hide the rest. */
const place = (units: Unit[], dpr: number): void => {
  const { vw, vh } = viewport()
  placedVw = vw
  placedVh = vh
  camera.right = vw
  camera.bottom = -vh
  camera.updateProjectionMatrix()
  for (const b of baked.values()) b.mesh.visible = false
  units.forEach((u, i) => {
    if (!u.el.isConnected) return
    if (u.kind === 'raster') {
      const r = u.el.getBoundingClientRect()
      u.box = { x: r.left, y: r.top, w: r.width, h: r.height }
      rasterize(u, dpr, vw, vh)
    }
    const b = baked.get(u.el)
    if (!b || b.kind !== u.kind || !b.dpr) return
    // Where it is NOW: a unit that only moved is drawn at its new place,
    // snapped to device pixels so its texels map 1:1.
    // One that also changed size since (a resize, until its fresh bake
    // lands) is stretched onto its new box: a little soft for a moment, never
    // out of place.
    const r = u.el.getBoundingClientRect()
    const sx = b.box.w > 0.5 && r.width > 0.5 ? r.width / b.box.w : 1
    const sy = b.box.h > 0.5 && r.height > 0.5 ? r.height / b.box.h : 1
    const w = b.paint.w * sx
    const h = b.paint.h * sy
    const x = Math.round((r.left + (b.paint.x - b.box.x) * sx) * dpr) / dpr
    const y = Math.round((r.top + (b.paint.y - b.box.y) * sy) * dpr) / dpr
    b.mesh.position.set(x + w / 2, -(y + h / 2), 0)
    b.mesh.scale.set(w, h, 1)
    b.mesh.renderOrder = i
    b.mesh.visible = true
  })
}

const cycle = async (h: UiBakeHost): Promise<void> => {
  const t0 = performance.now()
  const dpr = dprOf(h.canvas)
  const { vw, vh } = viewport()
  const units = await whenIdle(cost.walk, () => timed('walk', () => {
    animated = new Set()
    // Whatever is animating changes pixels without touching the DOM.
    for (const a of document.getAnimations()) {
      const t = (a.effect as KeyframeEffect | null)?.target
      if (t) animated.add(t)
    }
    return findUnits(h.canvas, vw, vh)
  }))
  stats.units = units.length
  // Units gone from the page give back their textures.
  const present = new Set(units.map(u => u.el))
  for (const [el, b] of baked) if (!present.has(el)) drop(el, b)
  // The window changed: everything goes to its new place now, before the bakes.
  if (vw !== placedVw || vh !== placedVh) await whenIdle(cost.place, () => timed('place', () => place(units, dpr)))
  for (const el of pending.keys()) if (!present.has(el)) pending.delete(el)
  const todo = pickBakes(units, dpr)
  // What changes from here on belongs to the next cycle.
  touched = new Set()
  restyled = new Set()
  if (todo.length) {
    await loadCss()
    // Every step queued at once: the pump fits what it can into each idle
    // period, and the decodes run side by side meanwhile.
    const jobs = await Promise.all(todo.map(prepare))
    await Promise.all(jobs.map(j => (j ? finish(j, dpr) : null)))
  }
  await whenIdle(cost.place, () => timed('place', () => place(units, dpr)))
  if (!h.running()) { h.redraw(); stats.redraws++ }
  stats.cycles++
  stats.cycleMs = performance.now() - t0
}

const onMutations = (records: MutationRecord[]): void => {
  for (const r of records) {
    if (r.type === 'attributes') {
      const el = r.target as Element
      // A move is not a change: the quad is simply drawn at its new place.
      if (r.attributeName === 'style' && styleWithoutPosition(r.oldValue) === styleWithoutPosition(el.getAttribute('style'))) continue
      touched.add(el)
      restyled.add(el)
    } else {
      touched.add(r.target)
    }
  }
}

const reset = (): void => {
  for (const [el, b] of [...baked]) drop(el, b)
  pending.clear()
}

/** Start baking. Idempotent. */
export const installUiBake = (h: UiBakeHost): void => {
  host = h
  const w = window as unknown as { __uiBake?: unknown }
  if (w.__uiBake) return
  w.__uiBake = stats
  new MutationObserver(onMutations).observe(document.body, {
    subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true
  })
  // New size, new rem, new breakpoints: every bake is stale. The old ones stay
  // up, stretched onto their new boxes, until each is baked again (dropping
  // them all left the recording without a HUD for seconds), and the next
  // cycle comes at once.
  window.addEventListener('resize', () => { resizedAt = performance.now(); frames = MIN_FRAMES })
  // Its own frame counter, so the bake keeps going while the game loop is
  // paused under a modal.
  const tick = () => {
    requestAnimationFrame(tick)
    frames++
    if (busy || frames < MIN_FRAMES || !host) return
    busy = true
    cycle(host).then(() => { failures = 0 }, (e: unknown) => {
      // Once per failure streak, and backing off: a page that cannot bake
      // must not retry every few frames.
      if (failures++ === 0) console.warn('[uiBake] bake failed', e)
      stats.failures = failures
      reset()
    }).finally(() => {
      busy = false
      frames = -Math.min(600, failures * 60)
    })
  }
  requestAnimationFrame(tick)
}

/** Draw the baked UI over the frame just rendered. Call after every render. */
export const drawUiBake = (renderer: WebGLRenderer): void => {
  gl = renderer
  if (!baked.size) return
  const t = performance.now()
  renderer.setRenderTarget(null)
  renderer.render(layer, camera)
  stats.frameMs = stats.frameMs * 0.95 + (performance.now() - t) * 0.05
}
