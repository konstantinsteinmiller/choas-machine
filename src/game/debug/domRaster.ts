/**
 * ─── DOM → pixels, for the UI bake ───────────────────────────────────────────
 *
 * Paints the page's DOM (everything but the game canvas) into canvases, with
 * no library: a piece of the live tree is cloned, wrapped in an SVG
 * `foreignObject` together with the page's own stylesheets, and the browser
 * rasterizes that SVG as an image. Framework- and engine-agnostic on purpose:
 * the scheduling and the three.js compositing live in `uiBake.ts`.
 *
 * The page is cut into UNITS (`findUnits`) — one HUD panel, one marker, one
 * bubble — baked one at a time and only when they change, because an SVG
 * document costs a fresh layout every time it is drawn (measured on a fast
 * laptop: the whole HUD in one SVG, ~25-30 ms of main-thread draw per bake;
 * a single panel ~3 ms). A container that is big, holds the game canvas or
 * holds a raster image is split: its own box (a "shell") is baked alone, its
 * children become units. Raster images (`<img>`, `<canvas>`, `<video>`) never
 * go through the SVG at all — any image inside an SVG image makes Chrome load
 * the whole document synchronously (+40-60 ms blocked, even for a 1×1 PNG) —
 * they are drawn straight from the live, already-decoded element.
 *
 * What an SVG image cannot do, and how each gap is closed:
 * - It loads NO subresources: fonts in the CSS are inlined as data URLs
 *   (same-origin bundle files, fetched once; nothing external is requested).
 * - `html` selectors match nothing (its root is `<svg>`): rewritten to a
 *   wrapper div carrying `<html>`'s attributes; the svg root takes `<html>`'s
 *   font-size so `rem` stays right. The SVG is viewport-sized, so `vw`/`vh`
 *   are right too; a unit is drawn out of it by source rectangle.
 * - Animations would restart at their first keyframe (a fade-in would show
 *   nothing): all are off in the image, and whatever is animating NOW has its
 *   current computed values inlined instead.
 * - A unit's ancestors are kept (as empty, neutralised shells) so descendant
 *   selectors, inherited fonts and colours and CSS variables still apply; the
 *   unit itself is pinned where it is on screen.
 */

const XHTML = 'http://www.w3.org/1999/xhtml'
const HTML_CLASS = 'uib-html'
const ANCESTOR_ATTR = 'data-uib-anc'
/** Room around a unit's boxes for shadows and glows, CSS px. */
const MARGIN = 16

export interface Rect { x: number; y: number; w: number; h: number }

/** `html` in selector position → the wrapper class. Pure, for the tests. */
export const rewriteHtmlSelectors = (css: string): string =>
  css.replace(/(^|[{},;\s>+~(])html(?=[\s,{.:#[>+~)])/g, `$1.${HTML_CLASS}`)

/** Every `url(...)` in a stylesheet text, resolved against its base. Pure. */
export const cssUrls = (css: string, base: string): Array<{ raw: string; abs: string }> => {
  const out: Array<{ raw: string; abs: string }> = []
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const u = m[2]!.trim()
    if (u.startsWith('data:') || u.startsWith('#')) continue
    try { out.push({ raw: m[0], abs: new URL(u, base).href }) } catch { /* not a URL */ }
  }
  return out
}

/**
 * A `style` attribute with only its POSITION left out: `left/top/right/bottom/
 * inset`, `translate`, and a `transform` that is nothing but a translate. Two
 * values with the same result differ by a move, which needs no re-bake (an
 * objective marker writes its transform every frame). Pure.
 */
export const styleWithoutPosition = (style: string | null): string =>
  (style ?? '').split(';').map(d => d.trim()).filter((d) => {
    if (!d) return false
    const i = d.indexOf(':')
    const prop = d.slice(0, i).trim().toLowerCase()
    const val = d.slice(i + 1).trim()
    if (/^(left|top|right|bottom|inset|translate)$/.test(prop)) return false
    if (prop === 'transform' && /^translate(3d|x|y)?\([^)]*\)$/i.test(val)) return false
    return true
  }).join(';')

/** Where an object-fit image's pixels land in its box. Pure. */
export const objectFit = (fit: string, nw: number, nh: number, box: Rect): { src: Rect; dst: Rect } => {
  const full = { x: 0, y: 0, w: nw, h: nh }
  if (fit === 'cover') {
    const s = Math.max(box.w / nw, box.h / nh)
    const w = box.w / s
    const h = box.h / s
    return { src: { x: (nw - w) / 2, y: (nh - h) / 2, w, h }, dst: box }
  }
  if (fit === 'contain' || fit === 'scale-down' || fit === 'none') {
    const s = fit === 'none' ? 1 : Math.min(box.w / nw, box.h / nh, fit === 'contain' ? Infinity : 1)
    const w = nw * s
    const h = nh * s
    return { src: full, dst: { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h } }
  }
  return { src: full, dst: box }
}

const dataUrls = new Map<string, string>()
const pendingUrls = new Map<string, Promise<string | null>>()

const toDataUrl = (abs: string): Promise<string | null> => {
  const done = dataUrls.get(abs)
  if (done) return Promise.resolve(done)
  let p = pendingUrls.get(abs)
  if (!p) {
    // Same-origin only: the bake never adds an external request to the page.
    if (new URL(abs, location.href).origin !== location.origin) return Promise.resolve(null)
    p = fetch(abs)
      .then(r => (r.ok ? r.blob() : null))
      .then(b => b && new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result as string)
        fr.onerror = () => rej(fr.error)
        fr.readAsDataURL(b)
      }))
      .then((d) => { if (d) dataUrls.set(abs, d); return d })
      .catch(() => null)
    pendingUrls.set(abs, p)
  }
  return p
}

/**
 * The keys a selector list can match by, browser-style: the id, else the
 * first class, else the tag of each selector's RIGHTMOST compound. `null`
 * when any selector in the list has none (`*`, `:root`, `[dir=rtl]`, `html`):
 * such a rule goes to every unit. Pure.
 */
export const selectorKeys = (selectorText: string): string[] | null => {
  const keys: string[] = []
  for (const sel of splitTopLevel(selectorText, ',')) {
    const parts = splitTopLevel(sel.trim(), ' >+~').filter(Boolean)
    const last = (parts[parts.length - 1] ?? '').replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, '')
    const id = /#((?:\\.|[\w-])+)/.exec(last)
    const cls = /\.((?:\\.|[\w-])+)/.exec(last)
    const tag = /^([a-zA-Z][\w-]*)/.exec(last)
    const unescape = (v: string) => v.replace(/\\(.)/g, '$1')
    if (id) keys.push('#' + unescape(id[1]!))
    else if (cls) keys.push('.' + unescape(cls[1]!))
    else if (tag && !/^(html|body)$/i.test(tag[1]!)) keys.push(tag[1]!.toLowerCase())
    else return null
  }
  return keys
}

/** Split on any of `seps` outside (), [] and quotes. Pure. */
const splitTopLevel = (s: string, seps: string): string[] => {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quote) { cur += ch; if (ch === quote && s[i - 1] !== '\\') quote = ''; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

/** `U+0000-00FF, U+0131` → code point ranges. Pure. */
export const unicodeRanges = (v: string): Array<[number, number]> =>
  v.split(',').map(t => t.trim().replace(/^u\+/i, '')).filter(Boolean).map((t) => {
    if (t.includes('?')) return [parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)] as [number, number]
    const [lo, hi] = t.split('-')
    return [parseInt(lo!, 16), parseInt(hi ?? lo!, 16)] as [number, number]
  })

interface CssEntry { order: number; text: string }
interface FontEntry { text: string; family: string; ranges: Array<[number, number]> | null }

let cssKey = ''
let always: CssEntry[] = []
let byKey = new Map<string, CssEntry[]>()
let fonts: FontEntry[] = []
let layers: string[] = []

const TAIL =
  '\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' +
  // A unit's ancestors are there for selectors and inheritance only.
  `\n[${ANCESTOR_ATTR}]::before,[${ANCESTOR_ATTR}]::after{content:none!important}`

/** A cheap fingerprint of the page's stylesheets: rebuilt only when it moves. */
const sheetsKey = (): string => {
  let k = ''
  for (const s of Array.from(document.styleSheets)) {
    let n = -1
    try { n = s.cssRules.length } catch { /* cross-origin sheet */ }
    k += `${s.href ?? 'i'}:${n};`
  }
  return k
}

const inlineUrls = async (text: string, base: string): Promise<string> => {
  for (const { raw, abs } of cssUrls(text, base)) {
    const d = await toDataUrl(abs)
    text = text.split(raw).join(d ? `url("${d}")` : 'none')
  }
  return text
}

/**
 * Index the page's CSS (every url() inlined) so each unit gets only the rules
 * that can match it: the whole stylesheet in every unit's SVG made each draw
 * re-resolve ~1,300 rules (measured: 5-9 ms a unit, 0.6 ms with none).
 * Cached until the stylesheets change.
 */
export const loadCss = async (): Promise<void> => {
  const key = sheetsKey()
  if (key === cssKey) return
  const nextAlways: CssEntry[] = []
  const nextByKey = new Map<string, CssEntry[]>()
  const nextFonts: FontEntry[] = []
  const nextLayers: string[] = []
  let order = 0
  const addLayer = (name: string) => {
    for (const n of name.split(',')) { const t = n.trim(); if (t && !nextLayers.includes(t)) nextLayers.push(t) }
  }
  const visit = async (rules: CSSRuleList, base: string, open: string, close: string): Promise<void> => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSImportRule) { if (r.styleSheet) await walkSheet(r.styleSheet); continue }
      // Animations are off in the image (see the header): keyframes are dead weight.
      if (r instanceof CSSKeyframesRule) continue
      if (typeof CSSLayerStatementRule !== 'undefined' && r instanceof CSSLayerStatementRule) { r.nameList.forEach(addLayer); continue }
      if (r instanceof CSSFontFaceRule) {
        const range = r.style.getPropertyValue('unicode-range')
        nextFonts.push({
          text: await inlineUrls(r.cssText, base),
          family: r.style.getPropertyValue('font-family').replace(/['"]/g, '').trim().toLowerCase(),
          ranges: range ? unicodeRanges(range) : null
        })
        continue
      }
      if (r instanceof CSSStyleRule) {
        let text = rewriteHtmlSelectors(r.cssText)
        if (text.includes('url(')) text = await inlineUrls(text, base)
        const entry = { order: order++, text: open + text + close }
        const keys = selectorKeys(r.selectorText)
        if (!keys) nextAlways.push(entry)
        else for (const k of keys) { const list = nextByKey.get(k); if (list) list.push(entry); else nextByKey.set(k, [entry]) }
        continue
      }
      if ('cssRules' in r && (r as CSSGroupingRule).cssRules) {
        // @media, @supports, @layer, @container: each rule keeps its wrapper.
        if (typeof CSSLayerBlockRule !== 'undefined' && r instanceof CSSLayerBlockRule) addLayer(r.name)
        const head = r.cssText.slice(0, r.cssText.indexOf('{') + 1)
        await visit((r as CSSGroupingRule).cssRules, base, open + head, '}' + close)
        continue
      }
      // Anything else (@property, @counter-style...) is small: every unit gets it.
      nextAlways.push({ order: order++, text: open + r.cssText + close })
    }
  }
  const walkSheet = async (sheet: CSSStyleSheet): Promise<void> => {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { return }
    await visit(rules, sheet.href ?? document.baseURI, '', '')
  }
  for (const s of Array.from(document.styleSheets)) await walkSheet(s)
  always = nextAlways
  byKey = nextByKey
  cssMemo.clear()
  fonts = nextFonts
  layers = nextLayers
  cssKey = key
}

/** The CSS one unit needs: the rules its (and its ancestors') keys can match, and the fonts its text uses. */
export const cssFor = (u: Unit): string => {
  const keys = new Set<string>()
  const add = (e: Element) => {
    keys.add(e.localName)
    if (e.id) keys.add('#' + e.id)
    for (const c of Array.from(e.classList)) keys.add('.' + c)
  }
  for (let p = u.el.parentElement; p; p = p.parentElement) add(p)
  add(u.el)
  if (u.kind === 'tree') for (const d of Array.from(u.el.getElementsByTagName('*'))) add(d)
  // Same keys and same text glyphs, same stylesheet: built once.
  const sig = [...keys].sort().join(' ') + '|' + glyphKey(u.el.textContent ?? '')
  const hit = cssMemo.get(sig)
  if (hit !== undefined) return hit
  const picked = new Map<number, string>()
  for (const e of always) picked.set(e.order, e.text)
  for (const k of keys) for (const e of byKey.get(k) ?? []) picked.set(e.order, e.text)
  const body = [...picked.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]).join('\n')
  // Font faces: a family the picked rules name, a subset the unit's text needs.
  const lower = body.toLowerCase()
  const codes = new Set<number>()
  for (const ch of (u.el.textContent ?? '') + '0123456789') codes.add(ch.codePointAt(0)!)
  const faces = fonts.filter(f => lower.includes(f.family) &&
    (!f.ranges || f.ranges.some(([lo, hi]) => { for (const c of codes) if (c >= lo && c <= hi) return true; return false })))
  const css = (layers.length ? `@layer ${layers.join(', ')};\n` : '') + faces.map(f => f.text).join('\n') + '\n' + body + TAIL
  if (cssMemo.size >= 256) cssMemo.delete(cssMemo.keys().next().value!)
  cssMemo.set(sig, css)
  return css
}

const cssMemo = new Map<string, string>()

/** Which font subsets a text can need: its distinct non-ASCII characters (ASCII is one subset). */
const glyphKey = (text: string): string => {
  let out = ''
  for (const ch of text) if (ch.charCodeAt(0) > 127 && !out.includes(ch)) out += ch
  return out
}

// ─── Units ──────────────────────────────────────────────────────────────────

export type UnitKind = 'tree' | 'shell' | 'raster'

export interface Unit {
  el: Element
  kind: UnitKind
  /** Border box on screen, transforms included. */
  box: Rect
  /** Raster units: effective opacity, and the clip of an overflow-clipping ancestor. */
  opacity: number
  clip: Rect | null
}

const SKIP = new Set(['script', 'style', 'link', 'noscript', 'template', 'iframe', 'meta', 'head'])
const RASTER = new Set(['img', 'canvas', 'video'])
const RASTER_SELECTOR = 'img,canvas,video'

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

const intersect = (a: Rect | null, b: Rect): Rect => {
  if (!a) return b
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }
}

const transparent = (c: string) => c === 'transparent' || /,\s*0\)$/.test(c)

/** Does a split container paint anything of its own (it then bakes as a shell)? */
const paintsOwnBox = (el: Element, cs: CSSStyleDeclaration): boolean => {
  if (cs.display === 'contents' || cs.visibility === 'hidden') return false
  if (!transparent(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return true
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none') return true
  }
  if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) return true
  for (const p of ['::before', '::after']) {
    const c = getComputedStyle(el, p).content
    if (c && c !== 'none' && c !== 'normal') return true
  }
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && n.textContent!.trim()) return true
  return false
}

const zOf = (el: Element): number => {
  const cs = getComputedStyle(el)
  return cs.position === 'static' ? 0 : parseInt(cs.zIndex, 10) || 0
}

/**
 * The page's units in paint order (tree order, siblings by z-index). Reads
 * computed styles and rects of the containers walked; units themselves are
 * not entered.
 */
export const findUnits = (exclude: Element, vw: number, vh: number): Unit[] => {
  const out: Unit[] = []
  const bigArea = vw * vh * 0.4
  const visit = (el: Element, opacity: number, clip: Rect | null): void => {
    if (el === exclude || SKIP.has(el.localName)) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return
    const op = opacity * (parseFloat(cs.opacity) || 0)
    if (op <= 0.002) return
    const box = rectOf(el)
    const area = box.w * box.h
    if (RASTER.has(el.localName)) {
      if (area > 0 && cs.visibility !== 'hidden') out.push({ el, kind: 'raster', box, opacity: op, clip })
      return
    }
    const kids = el.childElementCount > 0
    const holdsGame = el.contains(exclude)
    // A turned or scaled container is baked whole: its children are drawn in
    // its frame, and a unit's ancestors are neutralised (a nudge arrow, turned
    // to point at a button, was baked pointing straight down).
    const turned = cs.rotate !== 'none' || cs.scale !== 'none' || (cs.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(cs.transform))
    // Never split inside an SVG: its children only make sense in its coordinates.
    const split = kids && (holdsGame || (!turned && !(el instanceof SVGElement) &&
      (area === 0 || area >= bigArea || el.querySelector(RASTER_SELECTOR) !== null)))
    if (!split) {
      if ((area > 0 || kids) && cs.visibility !== 'hidden') out.push({ el, kind: 'tree', box, opacity: op, clip: null })
      return
    }
    // The game canvas's ancestors never paint: they would cover the frame.
    if (!holdsGame && area > 0 && paintsOwnBox(el, cs)) out.push({ el, kind: 'shell', box, opacity: op, clip: null })
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none'
    const childClip = clips && area > 0 ? intersect(clip, box) : clip
    const order = Array.from(el.children).map((c, i) => ({ c, i, z: zOf(c) })).sort((a, b) => a.z - b.z || a.i - b.i)
    for (const k of order) visit(k.c, op, childClip)
  }
  visit(document.body, 1, null)
  return out
}

/** What a unit paints: its box and its descendants', with room for shadows, on screen. */
export const paintRect = (u: Unit, vw: number, vh: number): Rect => {
  let x0 = u.box.x, y0 = u.box.y, x1 = u.box.x + u.box.w, y1 = u.box.y + u.box.h
  if (u.kind === 'tree') {
    for (const d of Array.from(u.el.getElementsByTagName('*'))) {
      const r = d.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top)
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom)
    }
  }
  x0 = Math.max(0, Math.floor(x0 - MARGIN)); y0 = Math.max(0, Math.floor(y0 - MARGIN))
  x1 = Math.min(vw, Math.ceil(x1 + MARGIN)); y1 = Math.min(vh, Math.ceil(y1 + MARGIN))
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

const NEUTRAL: Array<[string, string]> = [
  ['position', 'static'], ['transform', 'none'], ['translate', 'none'], ['rotate', 'none'], ['scale', 'none'],
  ['display', 'block'], ['margin', '0'], ['padding', '0'], ['border', '0'], ['background', 'none'],
  ['box-shadow', 'none'], ['outline', 'none'], ['overflow', 'visible'], ['clip-path', 'none'], ['mask', 'none'],
  ['width', 'auto'], ['height', 'auto'], ['min-width', '0'], ['min-height', '0'], ['max-width', 'none'],
  ['max-height', 'none'], ['contain', 'none'], ['container-type', 'normal'], ['backdrop-filter', 'none']
]

/** Inline, on the clones, the current values of whatever is animating. */
const freezeAnimations = (map: Map<Element, Element>): void => {
  for (const a of document.getAnimations()) {
    const eff = a.effect as KeyframeEffect | null
    if (!eff?.target || eff.pseudoElement) continue
    const clone = map.get(eff.target) as HTMLElement | undefined
    if (!clone?.style) continue
    const cs = getComputedStyle(eff.target)
    const props = a instanceof CSSTransition
      ? [a.transitionProperty]
      : eff.getKeyframes().flatMap(k => Object.keys(k)).filter(p => p !== 'offset' && p !== 'easing' && p !== 'composite' && p !== 'computedOffset')
    for (const p of props) {
      const name = p.startsWith('--') ? p : p.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
      const v = cs.getPropertyValue(name)
      if (v) clone.style.setProperty(name, v, 'important')
    }
  }
}

/**
 * An element's untransformed border-box size, to the fraction of a pixel.
 * `offsetWidth` rounds: a bubble whose words just fit ("Uau, que brilho!")
 * came out 0.4px narrower in the copy, wrapped to two lines and spilled out of
 * its one-line box.
 */
export const layoutSize = (el: HTMLElement): { w: number; h: number } => {
  const cs = getComputedStyle(el)
  let w = parseFloat(cs.width)
  let h = parseFloat(cs.height)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return { w: el.offsetWidth, h: el.offsetHeight }
  if (cs.boxSizing !== 'border-box') {
    const px = (p: string): number => parseFloat(cs.getPropertyValue(p)) || 0
    w += px('padding-left') + px('padding-right') + px('border-left-width') + px('border-right-width')
    h += px('padding-top') + px('padding-bottom') + px('border-top-width') + px('border-bottom-width')
  }
  return { w, h }
}

/** Pin a unit's clone where the unit is on screen, its own translation folded in. */
const pin = (clone: HTMLElement, u: Unit): void => {
  const s = clone.style
  const set = (p: string, v: string) => s.setProperty(p, v, 'important')
  const el = u.el
  const html = el instanceof HTMLElement
  const { w, h } = html ? layoutSize(el) : u.box
  // Rotation and scale about the centre leave the centre where it is: the
  // layout box goes centred on the box's centre, with only the linear part
  // of its transform (its translation is already in where the box is).
  set('position', 'absolute')
  set('left', `${u.box.x + u.box.w / 2 - w / 2}px`)
  set('top', `${u.box.y + u.box.h / 2 - h / 2}px`)
  set('right', 'auto'); set('bottom', 'auto'); set('margin', '0')
  set('width', `${w}px`); set('height', `${h}px`); set('box-sizing', 'border-box')
  set('min-width', '0'); set('min-height', '0'); set('max-width', 'none'); set('max-height', 'none')
  set('translate', 'none'); set('transform-origin', '50% 50%')
  const m = html ? /^matrix\(([^,]+),([^,]+),([^,]+),([^,]+),/.exec(getComputedStyle(el).transform) : null
  set('transform', m ? `matrix(${m[1]},${m[2]},${m[3]},${m[4]},0,0)` : 'none')
  if (!html) { set('rotate', 'none'); set('scale', 'none') }
}

/** One unit as the XHTML inside the SVG: its ancestors as neutral shells, then it. */
export const serializeUnit = (u: Unit, vw: number, vh: number): string => {
  const map = new Map<Element, Element>()
  const clone = u.el.cloneNode(u.kind === 'tree') as HTMLElement
  if (u.kind === 'shell') {
    // Its own text stays; the children are units of their own.
    for (const n of Array.from(u.el.childNodes)) if (n.nodeType === 3) clone.appendChild(n.cloneNode())
  } else {
    const a = document.createTreeWalker(u.el, NodeFilter.SHOW_ELEMENT)
    const b = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT)
    const drop: Element[] = []
    for (let s = a.nextNode() as Element | null, c = b.nextNode() as Element | null; s && c; s = a.nextNode() as Element | null, c = b.nextNode() as Element | null) {
      map.set(s, c)
      if (SKIP.has(s.localName)) drop.push(c)
      else if (s.localName === 'input' || s.localName === 'textarea') c.setAttribute('value', (s as HTMLInputElement).value)
    }
    for (const c of drop) c.remove()
  }
  map.set(u.el, clone)
  let inner: Element = clone
  for (let p = u.el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const shell = p.cloneNode(false) as HTMLElement
    for (const [k, v] of NEUTRAL) shell.style?.setProperty(k, v, 'important')
    shell.setAttribute(ANCESTOR_ATTR, '')
    shell.appendChild(inner)
    map.set(p, shell)
    inner = shell
  }
  freezeAnimations(map)
  pin(clone, u)

  const html = document.documentElement
  const wrap = document.createElementNS(XHTML, 'div') as HTMLElement
  for (const at of Array.from(html.attributes)) wrap.setAttribute(at.name, at.value)
  wrap.classList.add(HTML_CLASS)
  const ws: Array<[string, string]> = [['position', 'relative'], ['width', `${vw}px`], ['height', `${vh}px`], ['overflow', 'hidden'], ['background', 'transparent']]
  for (const [k, v] of ws) wrap.style.setProperty(k, v, 'important')
  wrap.appendChild(inner)
  return new XMLSerializer().serializeToString(wrap)
}

const encoded = new Map<string, string>()

/**
 * The SVG document around a serialized unit, as a `data:` URL. Not a `blob:`
 * one: Chrome taints a canvas that draws a blob SVG holding `foreignObject`
 * (and any `createImageBitmap` of an SVG), and WebGL refuses a tainted
 * texture; a `drawImage` of a data-URL SVG stays clean, and every CSP already
 * allows `data:` images. A unit's stylesheet is URL-encoded once and reused
 * while it stays the same, so a bake mostly only encodes its markup.
 */
export const svgDataUrl = (css: string, xhtml: string, vw: number, vh: number): string => {
  const fs = getComputedStyle(document.documentElement).fontSize
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" style="font-size:${fs}">`
  const key = head + css
  let enc = encoded.get(key)
  if (enc === undefined) {
    enc = encodeURIComponent(head + `<style><![CDATA[${css.split(']]>').join(']]]]><![CDATA[>')}]]></style>`)
    if (encoded.size >= 64) encoded.delete(encoded.keys().next().value!)
    encoded.set(key, enc)
  }
  return 'data:image/svg+xml;charset=utf-8,' + enc + encodeURIComponent(
    `<foreignObject x="0" y="0" width="${vw}" height="${vh}">${xhtml}</foreignObject></svg>`)
}

/** Load and decode the SVG (async: with no raster image inside, off the main thread). */
export const decodeSvg = async (url: string, vw: number, vh: number): Promise<HTMLImageElement> => {
  const img = new Image(vw, vh)
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return img
}

/** Draw a raster unit straight from the live element (CSS px; the caller scales by dpr). */
export const drawRaster = (ctx: CanvasRenderingContext2D, u: Unit): void => {
  const el = u.el as HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
  const nw = el instanceof HTMLImageElement ? el.naturalWidth : el instanceof HTMLVideoElement ? el.videoWidth : el.width
  const nh = el instanceof HTMLImageElement ? el.naturalHeight : el instanceof HTMLVideoElement ? el.videoHeight : el.height
  if (!nw || !nh) return
  const { src, dst } = objectFit(getComputedStyle(el).objectFit, nw, nh, rectOf(el))
  ctx.save()
  if (u.clip) {
    ctx.beginPath()
    ctx.rect(u.clip.x, u.clip.y, u.clip.w, u.clip.h)
    ctx.clip()
  }
  ctx.globalAlpha = u.opacity
  try { ctx.drawImage(el, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h) } catch { /* not ready */ }
  ctx.restore()
}
