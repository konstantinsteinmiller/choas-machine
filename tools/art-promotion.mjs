#!/usr/bin/env node
/**
 * ─── art:promotion: the store-page side of the art pipeline ──────────────────
 *
 *   pnpm art:promotion                    the shipping scenario: paint what is
 *                                         missing, cut every size, compress
 *   pnpm art:promotion --plates           (re)shoot the plates from the game
 *   pnpm art:promotion --doc              write the prompt document only
 *   pnpm art:promotion --check            CI: is the prompt document current?
 *   pnpm art:promotion --scenarios all    every scenario, not just the pick
 *   pnpm art:promotion --only 1x1,16x9    just these aspect families
 *   pnpm art:promotion --no-generate      cut and compress from what is on disk
 *   pnpm art:promotion --force            re-roll every selected master
 *   pnpm art:promotion --no-compress      leave the cuts uncompressed
 *   pnpm art:promotion --keep-window      leave the Gemini window open
 *
 * What it makes, from `src/game/art/promotionSheet.ts`:
 *
 *   art-sheets/promotion/<scenario>/cover-<aspect>.png      plates: screenshots
 *       of the game's own models, staged and framed per scenario and aspect
 *   art-sheets/promotion/painted/<scenario>/cover-<aspect>.*  the painted masters
 *   art-sheets/promotion/COMPARE-<aspect>.jpg   every scenario, plate against
 *       painting, at full size and at 250 px: what the pick is judged on
 *   src/assets/promotion/cover-<W>x<H>[-logo].{jpg,webp}    the shipping
 *       scenario's cuts, each from a master of its OWN aspect
 *   src/assets/promotion/logo-512.png           the lockup, on its own
 *
 * The plates need the game running: `--plates` starts a dev server of its own
 * on a free port and drives a headless Chrome through `window.__preview`
 * (`src/game/preview.ts`). Everything else is sharp and the Art Desk's painter.
 *
 * Run through the ts hook, which is what lets it read the game's manifest:
 *   node --import ./tools/ts-resolve.mjs tools/art-promotion.mjs
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHEETS = join(ROOT, 'art-sheets', 'promotion')
const PAINTED = join(SHEETS, 'painted')
const OUT = join(ROOT, 'src', 'assets', 'promotion')
const BACKUP = 'promotion-backup'
const DOC = join(SHEETS, 'PROMPTS-PROMOTION.md')
const RECEIPT = join(PAINTED, '.painted.json')
const RENDERED = join(SHEETS, '.rendered.json')
const STATUS = join(SHEETS, 'PROMOTION-STATUS.md')
const STYLE_REF = join(ROOT, 'game-and-feel-reference.jpg')
const TITLE = 'Chaos Machine'

const { values: opt } = parseArgs({
  options: {
    plates: { type: 'boolean', default: false },
    doc: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    scenarios: { type: 'string' },
    only: { type: 'string' },
    // `parseArgs` has no `--no-x` form: the negations are spelled out.
    'no-generate': { type: 'boolean', default: false },
    'no-compress': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'keep-window': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  }
})

if (opt.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf-8')
    .split('*/')[0].split('\n').slice(2, 15).map(l => l.replace(/^ \* ?/, '')).join('\n'))
  process.exit(0)
}

const { default: sharp } = await import('sharp')
const {
  COVER_ASPECTS, COVER_PICK, COVER_SCENARIOS, LOGO_PLACEMENT, coverFiles, plateStem, promotionPromptDoc, promptForCover
} = await import(pathToFileURL(join(ROOT, 'src', 'game', 'art', 'promotionSheet.ts')).href)

const rel = f => relative(ROOT, f).split('\\').join('/')
const rev = buf => createHash('sha1').update(buf).digest('hex').slice(0, 12)
const revOfFile = f => (existsSync(f) ? rev(readFileSync(f)) : null)
const readJson = (f, fallback) => { try { return JSON.parse(readFileSync(f, 'utf-8')) } catch { return fallback } }
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`, 'utf-8') }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const pick = (list, wanted, what) => {
  if (!wanted || wanted === 'all') return list
  const ids = new Set(wanted.split(',').map(s => s.trim()).filter(Boolean))
  const unknown = [...ids].filter(id => !list.some(x => x.id === id))
  if (unknown.length) { console.error(`${what} ${unknown.join(', ')}: unknown. Known: ${list.map(x => x.id).join(', ')}`); process.exit(2) }
  return list.filter(x => ids.has(x.id))
}
const aspects = pick(COVER_ASPECTS, opt.only, '--only')
const scenarios = opt.scenarios ? pick(COVER_SCENARIOS, opt.scenarios, '--scenarios') : COVER_SCENARIOS.filter(s => s.id === COVER_PICK)
const shipping = COVER_SCENARIOS.find(s => s.id === COVER_PICK)
if (!shipping) { console.error(`COVER_PICK "${COVER_PICK}" is not a scenario`); process.exit(2) }

// ─── 1. The prompt document ──────────────────────────────────────────────────

const doc = promotionPromptDoc()
const docCurrent = existsSync(DOC) && readFileSync(DOC, 'utf-8') === doc
if (opt.check) {
  // `art-sheets/` is not committed, so a fresh clone has no document to be out
  // of date: only a document that EXISTS and differs fails.
  if (!existsSync(DOC) || docCurrent) { console.log(`  = ${rel(DOC)}  ${existsSync(DOC) ? 'unchanged' : 'not written yet'}`); process.exit(0) }
  console.error(`  ! ${rel(DOC)} is out of date: run pnpm art:promotion --doc`)
  process.exit(1)
}
mkdirSync(SHEETS, { recursive: true })
if (!docCurrent) writeFileSync(DOC, doc, 'utf-8')
console.log(`  ${docCurrent ? '=' : '✓'} ${rel(DOC)}  ${(doc.length / 1024).toFixed(0)} kB`)
if (opt.doc) process.exit(0)

// ─── 2. The plates ───────────────────────────────────────────────────────────
//
// A plate is a screenshot: the game's own models, put where the scenario wants
// them, seen by a director's camera, with the whole interface hidden. The
// staging is here and not in the manifest because it is code, not copy.

const plateFile = (s, a) => join(SHEETS, s.id, `${plateStem(a)}.png`)

/** Field of view per shape: the same staging, framed for each. */
const FOV = { landscape: 0, square: 8, portrait: 20 }

/**
 * Where everybody stands, per scenario. `at(forward, right)` is a point on the
 * ground relative to the scene's origin and heading; the camera is given the
 * same way, with a height.
 */
const STAGING = {
  ambush: {
    level: 2,
    radius: 4,
    fov: 38,
    mech: { f: -1.25, r: 0.25, turn: 0, crouched: false },
    pins: [{ kind: 'guard', n: 0, f: 0, r: 0, turn: 0 }],
    cam: { f: 2.7, r: 0.9, up: 1.45 },
    look: { f: -0.5, r: 0.1, up: 1.8 },
    hands: []
  },
  scope: {
    level: 2,
    radius: 4,
    fov: 34,
    mech: { f: 0, r: 0, turn: 0, crouched: true },
    pins: [{ kind: 'guard', n: 0, f: 16, r: 6, turn: Math.PI }],
    cam: { f: 2.5, r: -1.3, up: 1.25 },
    look: { f: 0.1, r: 0, up: 1.25 },
    // Not scoped: the game hides the mech while it looks down the scope.
    hands: [['weapon', 1]]
  },
  chaos: {
    level: 4,
    radius: 9,
    fov: 46,
    mech: { f: 0, r: 0, turn: 0, crouched: false },
    pins: [
      { kind: 'guard', n: 0, f: -5, r: 2.6, turn: 0 },
      { kind: 'guard', n: 1, f: -6.5, r: -2.4, turn: 0 },
      { kind: 'enforcer', n: 0, f: -9, r: 0.4, turn: 0 }
    ],
    cam: { f: 3.8, r: 0.9, up: 0.85 },
    look: { f: 0, r: 0, up: 1.6 },
    hands: [['weapon', 2], ['trigger', true]]
  },
  goliath: {
    level: 4,
    // The origin is the tank itself; the mech stands off in front of it.
    around: 'goliath',
    radius: 13,
    fov: 52,
    mech: { f: 7.5, r: 1.1, turn: Math.PI, crouched: false },
    pins: [],
    cam: { f: 10.6, r: -0.6, up: 0.7 },
    look: { f: 1.5, r: 0.2, up: 2.3 },
    hands: [['weapon', 3]]
  }
}

const NO_POINTER_LOCK = () => {
  // A headless Chrome still takes the REAL pointer lock, which grabs the mouse
  // of whoever is working on this machine: the page gets a pretend one.
  let locked = null
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked })
  Element.prototype.requestPointerLock = function () {
    locked = this
    queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')))
    return Promise.resolve()
  }
  Document.prototype.exitPointerLock = function () {
    if (!locked) return
    locked = null
    queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')))
  }
}

const CLEAN_FEED = 'body * { visibility: hidden !important } .canvas-host canvas { visibility: visible !important }'

const shootPlates = async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(join(ROOT, 'package.json'))
  const { chromium } = require('playwright-core')
  const { createServer } = await import('vite')
  // A dependency cache of its own: never the one a running `pnpm dev` uses.
  process.env.VITE_CACHE_DIR = 'node_modules/.vite-promotion'
  process.env.VITE_LEADERBOARD_URL = ''
  const server = await createServer({
    root: ROOT,
    server: { port: 0, strictPort: false, host: '127.0.0.1', open: false, hmr: false, watch: null },
    logLevel: 'warn'
  })
  await server.listen()
  const address = server.httpServer?.address()
  const base = `http://127.0.0.1:${address.port}/`
  let browser = null
  try {
    // The served page must be THIS game.
    const html = await (await fetch(base)).text()
    if (!html.includes(`<title>${TITLE}`)) throw new Error(`the server on ${base} is not ${TITLE}`)
    const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => existsSync(p))
    browser = await chromium.launch({
      ...(chrome ? { executablePath: chrome } : { channel: 'chrome' }),
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio']
    })
    for (const s of scenarios) {
      const st = STAGING[s.id]
      if (!st) throw new Error(`no staging for scenario "${s.id}"`)
      const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.addInitScript(NO_POINTER_LOCK)
      page.on('pageerror', e => console.log(`    ! page error: ${e.message}`))
      await page.goto(`${base}?preview=1&level=${st.level}`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => !!window.__preview, null, { timeout: 120_000 })
      await page.evaluate(() => window.__preview.begin())
      await page.waitForFunction(() => window.__preview.ready(), null, { timeout: 180_000 })
      await page.addStyleTag({ content: CLEAN_FEED })
      await sleep(600)

      // The origin: flat ground with room for everybody and the camera.
      const origin = await page.evaluate(([around, radius]) => {
        const P = window.__preview
        const u = P.unit(around ?? 'guard', 0)
        if (!u) return null
        const h = P.ground(u.x, u.z)
        // The heading with the most level ground along it.
        let best = null
        for (let a = 0; a < 24; a++) {
          const yaw = (a / 24) * Math.PI * 2
          let ok = 0
          for (let d = -radius * 0.6; d <= radius; d += 1) {
            for (const side of [-2, 0, 2]) {
              const x = u.x + Math.sin(yaw) * d - Math.cos(yaw) * side
              const z = u.z + Math.cos(yaw) * d + Math.sin(yaw) * side
              if (Math.abs(P.ground(x, z) - h) < 0.3) ok++
            }
          }
          // For a scene round a machine, face the way it faces.
          const bias = around ? Math.cos(yaw - u.yaw) * 6 : 0
          if (!best || ok + bias > best.score) best = { yaw, score: ok + bias }
        }
        return { x: u.x, z: u.z, h, yaw: best.yaw, id: u.id }
      }, [st.around ?? null, st.radius])
      if (!origin) throw new Error(`${s.id}: nothing to build the scene round`)

      const at = (f, r) => ({
        x: origin.x + Math.sin(origin.yaw) * f - Math.cos(origin.yaw) * r,
        z: origin.z + Math.cos(origin.yaw) * f + Math.sin(origin.yaw) * r
      })
      const mech = at(st.mech.f, st.mech.r)
      const cam = at(st.cam.f, st.cam.r)
      const look = at(st.look.f, st.look.r)
      await page.evaluate(([st, origin, mech, pins]) => {
        const P = window.__preview
        P.unpin()
        for (const p of pins) {
          const u = P.unit(p.kind, p.n)
          if (u) P.pin(u.id, p.x, p.z, origin.yaw + p.turn)
        }
        P.place(mech.x, mech.z, origin.yaw + st.mech.turn, 0, st.mech.crouched)
        for (const [hand, v] of st.hands) P[hand](v)
      }, [st, origin, mech, st.pins.map(p => ({ ...p, ...at(p.f, p.r) }))])
      await sleep(900)

      for (const a of aspects) {
        await page.setViewportSize({ width: a.plate.w / 2, height: a.plate.h / 2 })
        await page.evaluate(([cam, look, h, st, fov]) => {
          const P = window.__preview
          P.fragile(1)
          P.shot({ px: cam.x, py: h + st.cam.up, pz: cam.z, lx: look.x, ly: h + st.look.up, lz: look.z, fov })
        }, [cam, look, origin.h, st, st.fov + FOV[a.shape]])
        await sleep(500)
        const png = await page.screenshot({ type: 'png' })
        const file = plateFile(s, a)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, png)
        const meta = await sharp(png).metadata()
        console.log(`  ✓ ${rel(file)}  ${meta.width}x${meta.height}`)
      }
      await context.close()
    }
  } finally {
    await browser?.close().catch(() => {})
    await server.close()
  }
}

if (opt.plates) {
  console.log('\nplates')
  await shootPlates()
}

const missingPlates = scenarios.flatMap(s => aspects.filter(a => !existsSync(plateFile(s, a))).map(a => `${s.id}/${a.id}`))
if (missingPlates.length) {
  console.error(`\nno plate for ${missingPlates.join(', ')}: run pnpm art:promotion --plates${opt.scenarios ? ` --scenarios ${opt.scenarios}` : ''}`)
  process.exit(1)
}
if (opt.plates && opt['no-generate'] && !existsSync(PAINTED)) {
  console.log('\n--plates --no-generate: the plates are shot; nothing painted yet.')
}

// ─── 3. The masters ──────────────────────────────────────────────────────────

const receipt = readJson(RECEIPT, { files: {} })
receipt.files ??= {}

const masterOf = (s, a) => {
  const dir = join(PAINTED, s.id)
  if (!existsSync(dir)) return null
  const f = readdirSync(dir).find(n => /\.(png|jpe?g|webp)$/i.test(n) && n.replace(/\.[^.]+$/, '') === plateStem(a))
  return f ? join(dir, f) : null
}
const keyOf = (s, file) => `${s.id}/${basename(file)}`

/** `paint` · `stale` · `ok`: what a family needs before anything is cut. */
const needs = (s, a) => {
  const master = masterOf(s, a)
  if (!master) return { state: 'paint', why: 'nothing painted yet', master: null }
  const line = receipt.files[keyOf(s, master)]
  if (line?.painting && line.painting !== revOfFile(master)) return { state: 'ok', why: 're-rolled by hand', master }
  const plate = revOfFile(plateFile(s, a))
  if (line?.plate && line.plate !== plate) return { state: 'stale', why: 'the plate was reshot since', master }
  return { state: 'ok', why: 'painted', master }
}

const queue = scenarios.flatMap(s => aspects.map(a => ({ s, a, ...needs(s, a) }))).filter(j => opt.force || j.state !== 'ok')
let painterError = null
let painted = 0

if (!opt['no-generate'] && queue.length) {
  const { loadConfig } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'config.mjs')).href)
  const { Gemini } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'gemini.mjs')).href)
  const { ledger } = await import(pathToFileURL(join(ROOT, 'tools', 'art-desk', 'usage.mjs')).href)
  const cfg = loadConfig(ROOT)
  const g = cfg.gemini
  const usage = ledger(g.usageFile)
  const painter = new Gemini({ root: ROOT, ...g, log: (line, level) => console.log(`    ${level === 'err' ? '! ' : ''}${line}`) })
  console.log(`\npainting ${queue.length} cover${queue.length === 1 ? '' : 's'}  (${usage.usedToday()} generations today, cap ${g.dailyCap})`)
  let consecutive = 0
  for (const [i, job] of queue.entries()) {
    if (usage.usedToday() >= g.dailyCap) { painterError = `daily cap reached (${usage.usedToday()}/${g.dailyCap})`; break }
    if (i > 0) {
      const gap = Math.round(g.gapSeconds + Math.random() * g.jitterSeconds)
      console.log(`  … waiting ${gap} s before the next generation`)
      await sleep(gap * 1000)
    }
    const plate = plateFile(job.s, job.a)
    console.log(`  → ${job.s.id} / ${job.a.id} (${job.why})`)
    let last = ''
    try {
      const { bytes } = await painter.paint({
        refFile: plate,
        styleFiles: existsSync(STYLE_REF) ? [STYLE_REF] : [],
        prompt: promptForCover(job.s, job.a),
        timeoutMs: g.timeoutSeconds * 1000,
        onPhase: (phase, quiet) => { if (quiet && phase === last) return; last = phase; console.log(`    ${phase}`) }
      })
      usage.countGeneration()
      const dir = join(PAINTED, job.s.id)
      mkdirSync(dir, { recursive: true })
      const type = bytes.slice(0, 4).toString('hex') === '89504e47' ? 'png' : bytes.slice(0, 2).toString('hex') === 'ffd8' ? 'jpg' : 'webp'
      // A replaced master is archived, not dropped: the one that came back
      // worse is the one you want back.
      for (const old of readdirSync(dir)) {
        if (/\.(png|jpe?g|webp)$/i.test(old) && old.replace(/\.[^.]+$/, '') === plateStem(job.a)) {
          const to = join(dir, 'replaced', `${plateStem(job.a)}.${Date.now()}${old.slice(old.lastIndexOf('.'))}`)
          mkdirSync(dirname(to), { recursive: true })
          renameSync(join(dir, old), to)
          delete receipt.files[`${job.s.id}/${old}`]
        }
      }
      const dest = join(dir, `${plateStem(job.a)}.${type}`)
      writeFileSync(dest, bytes)
      receipt.files[keyOf(job.s, dest)] = { plate: revOfFile(plate), painting: rev(bytes), at: new Date().toISOString() }
      writeJson(RECEIPT, receipt)
      const meta = await sharp(bytes).metadata()
      console.log(`    ✓ ${rel(dest)}  ${meta.width}x${meta.height} ${type}, ${(bytes.length / 1024).toFixed(0)} kB`)
      painted++
      consecutive = 0
    } catch (e) {
      consecutive++
      if (e.counted) usage.countGeneration()
      console.log(`    ! ${job.s.id}/${job.a.id} failed: ${e.message}`)
      if (['QUOTA', 'SIGNED_OUT', 'CONSENT', 'BROWSER'].includes(e.code)) { painterError = `${e.code}: ${e.message}`; break }
      if (consecutive >= g.maxConsecutiveFailures) { painterError = `${consecutive} failures in a row`; break }
    }
  }
  // A one-shot command closes its window; the desk is a server and keeps its own.
  if (!opt['keep-window']) await painter.closeWindow().catch(() => {})
} else if (queue.length) {
  console.log(`\n${queue.length} cover(s) have no current painting; --no-generate, so the plate stands in.`)
}

// ─── 4. The comparison ───────────────────────────────────────────────────────
//
// Every scenario, plate against painting, once large and once at the 250 px a
// portal's grid shows it at. This is what the pick is made on.

for (const a of aspects) {
  const rows = COVER_SCENARIOS.filter(s => existsSync(plateFile(s, a)))
  if (rows.length < 2) continue
  const big = 480
  const bh = Math.round(big * a.plate.h / a.plate.w)
  const small = 250
  const sh = Math.round(small * a.plate.h / a.plate.w)
  const colW = big + small + 12
  const rowH = Math.max(bh, sh) + 12
  const comps = []
  for (const [i, s] of rows.entries()) {
    for (const [j, file] of [plateFile(s, a), masterOf(s, a)].entries()) {
      if (!file) continue
      const x = j * (colW + 12)
      const y = i * rowH
      comps.push({ input: await sharp(file).resize(big, bh, { fit: 'cover' }).png().toBuffer(), left: x, top: y })
      comps.push({ input: await sharp(file).resize(small, sh, { fit: 'cover' }).png().toBuffer(), left: x + big + 12, top: y })
    }
  }
  const file = join(SHEETS, `COMPARE-${a.id}.jpg`)
  await sharp({ create: { width: colW * 2 + 12, height: rowH * rows.length, channels: 3, background: '#1c1233' } })
    .composite(comps).jpeg({ quality: 88 }).toFile(file)
  console.log(`  ✓ ${rel(file)}  rows: ${rows.map(s => s.id).join(', ')}  (plate | painting)`)
}

// ─── 5. The cuts ─────────────────────────────────────────────────────────────
//
// Only the shipping scenario leaves `art-sheets/`. Every size from a master of
// its OWN aspect (or its plate); the logo composited afterwards, never painted.

/** The lockup, as the game draws it: the one in `index.html`. */
const logoSvg = () => {
  const m = readFileSync(join(ROOT, 'index.html'), 'utf-8').match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 300 256"[\s\S]*?<\/svg>/)
  if (!m) throw new Error('the logo lockup is not in index.html: run node scripts/render-logo.mjs')
  // The lockup inherits its stroke from the page; on its own it needs it stated.
  return m[0].replace('<svg ', '<svg stroke="#1c1233" stroke-linejoin="round" stroke-linecap="round" ')
}
const logoPng = async (width) => sharp(Buffer.from(logoSvg()), { density: 72 * (width / 300) * 1.05 }).resize({ width }).png().toBuffer()

const rendered = readJson(RENDERED, { files: {} })
rendered.files ??= {}
mkdirSync(OUT, { recursive: true })
console.log(`\ncuts (${shipping.id})`)
const pending = []
let cut = 0
const logoRev = rev(Buffer.from(logoSvg()))
for (const a of COVER_ASPECTS) {
  if (opt.only && !aspects.includes(a)) continue
  const master = masterOf(shipping, a)
  const src = master ?? plateFile(shipping, a)
  if (!existsSync(src)) { console.log(`  · ${a.id}  no plate and no painting: skipped`); continue }
  const from = master ? 'painted' : 'plate'
  const srcRev = revOfFile(src)
  // A painter sometimes puts a frame round the picture although the prompt
  // forbids one. A thin, even border on all four sides is cut off here, and
  // said out loud; anything else is left exactly as it came.
  let srcInput = src
  if (master) {
    const meta = await sharp(src).metadata()
    const { data, info } = await sharp(src).trim({ threshold: 28 }).toBuffer({ resolveWithObject: true })
    const l = -(info.trimOffsetLeft ?? 0)
    const t = -(info.trimOffsetTop ?? 0)
    const r = meta.width - info.width - l
    const b = meta.height - info.height - t
    const short = Math.min(meta.width, meta.height)
    const sides = [l, t, r, b]
    if (sides.every(v => v >= short * 0.004 && v <= short * 0.06)) {
      srcInput = data
      console.log(`  ! ${a.id}: the painting came back with a frame (${sides.join('/')} px): cut off`)
    }
  }
  for (const f of coverFiles(a)) {
    const file = join(OUT, f.file)
    const stamp = `${shipping.id}:${srcRev}:${srcInput === src ? 'whole' : 'unframed'}:${f.logo ? logoRev : '-'}:${f.size.w}x${f.size.h}:${f.format}`
    const seen = rendered.files[f.file]
    if (!opt.force && existsSync(file) && seen?.stamp === stamp) {
      if (!opt['no-compress'] && !seen.packed) pending.push({ file, name: f.file })
      continue
    }
    let img = sharp(srcInput).resize(f.size.w, f.size.h, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).flatten({ background: '#1c1233' })
    if (f.logo) {
      const place = LOGO_PLACEMENT[a.shape]
      const short = Math.min(f.size.w, f.size.h)
      const lw = Math.round(short * place.size)
      const logo = await logoPng(lw)
      const lh = (await sharp(logo).metadata()).height
      const margin = Math.round(short * place.margin)
      const left = f.size.w - lw - margin
      const top = place.anchor === 'top-right' ? margin : f.size.h - lh - margin
      // A soft dark pool under the lockup, so it reads over any painting.
      const pool = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${f.size.w}" height="${f.size.h}"><defs><radialGradient id="p" cx="${((left + lw / 2) / f.size.w * 100).toFixed(1)}%" cy="${((top + lh / 2) / f.size.h * 100).toFixed(1)}%" r="${(lw * 0.85 / Math.max(f.size.w, f.size.h) * 100).toFixed(1)}%">`
        + '<stop offset="0%" stop-color="#1c1233" stop-opacity="0.62"/><stop offset="100%" stop-color="#1c1233" stop-opacity="0"/>'
        + `</radialGradient></defs><rect width="${f.size.w}" height="${f.size.h}" fill="url(#p)"/></svg>`)
      img = sharp(await img.png().toBuffer()).composite([{ input: pool }, { input: logo, left, top }])
    }
    // Written generously: the compressor searches DOWN from what it is given.
    const buf = f.format === 'jpg'
      ? await img.jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
      : await img.webp({ quality: 92, effort: 6, smartSubsample: true }).toBuffer()
    writeFileSync(file, buf)
    rendered.files[f.file] = { stamp, packed: false }
    pending.push({ file, name: f.file })
    cut++
    console.log(`  ✓ ${f.file}  ${(buf.length / 1024).toFixed(0)} kB  (${from})`)
  }
}

// The lockup on its own, for the forms that ask for a logo file.
{
  const name = 'logo-512.png'
  const stamp = `${logoRev}:512`
  if (opt.force || !existsSync(join(OUT, name)) || rendered.files[name]?.stamp !== stamp) {
    const logo = await logoPng(512)
    const buf = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: logo, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer()
    writeFileSync(join(OUT, name), buf)
    rendered.files[name] = { stamp, packed: false }
    pending.push({ file: join(OUT, name), name })
    cut++
    console.log(`  ✓ ${name}`)
  } else if (!opt['no-compress'] && !rendered.files[name].packed) pending.push({ file: join(OUT, name), name })
}
writeJson(RENDERED, rendered)

// ─── 6. Compress ─────────────────────────────────────────────────────────────

const run = argv => new Promise((res) => {
  const [cmd, ...args] = argv
  const child = spawn(cmd === 'node' ? process.execPath : cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '0' } })
  child.on('close', code => res(code))
  child.on('error', () => res(-1))
})
let compressed = 0
if (!opt['no-compress'] && pending.length) {
  console.log(`\ncompressing ${pending.length} file(s)`)
  // `--fresh --only`: these are NEW originals, so a backup of the same name is
  // from an older cut and compressing FROM it would ship the old cover.
  const code = await run(['node', 'scripts/compress-images.mjs', 'src/assets/promotion', '--max-effort', '--backup-dir', BACKUP, '--fresh', '--quiet', '--only', pending.map(p => rel(p.file)).join(',')])
  if (code !== 0) { console.error(`\nthe compressor failed (exit ${code}): the cuts are written but not compressed`); process.exit(1) }
  for (const p of pending) rendered.files[p.name].packed = true
  writeJson(RENDERED, rendered)
  compressed = pending.length
}

// ─── 7. What stands ──────────────────────────────────────────────────────────

const MARK = { ok: '✓', stale: '!', paint: '·' }
const lines = COVER_SCENARIOS.flatMap(s => COVER_ASPECTS.filter(a => existsSync(plateFile(s, a))).map((a) => {
  const n = needs(s, a)
  return `| ${MARK[n.state]} | ${s.id === COVER_PICK ? `**${s.id}**` : s.id} | ${a.id} | ${n.why} |`
}))
writeFileSync(STATUS, [
  '# Promotion status (generated by `pnpm art:promotion`)',
  '',
  `Shipping scenario: **${COVER_PICK}**. ✓ painted · ! plate reshot since · · still the plate.`,
  '',
  '| | Scenario | Aspect | State |',
  '| --- | --- | --- | --- |',
  ...lines,
  ''
].join('\n'), 'utf-8')
const files = readdirSync(OUT).filter(f => /\.(jpe?g|webp|png)$/i.test(f)).length
console.log(`\n${rel(OUT)}: ${files} files  ·  ${painted} painted, ${cut} cut, ${compressed} compressed`)
if (painterError) { console.error(`\nthe painter stopped: ${painterError}`); process.exit(1) }
