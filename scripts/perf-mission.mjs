#!/usr/bin/env node
// ─── Perf over REAL mission play, on the BUILT bundle ───────────────────────
//
//   npx vite build --outDir dist           # or any build mode
//   node scripts/perf-mission.mjs [--dist dist] [--throttle 4] [--seconds 25]
//   node scripts/perf-mission.mjs --arms base,noportal --reps 3     # A/B
//   node scripts/perf-mission.mjs --stealth                         # the quiet phase
//   node scripts/perf-mission.mjs --dist dist-prof --profile        # where the CPU goes
//
// Serves the built output, opens it headless with the in-page probe on
// (`?perfprobe=1`, see `src/use/usePerfProbe.ts`), throttles the CPU over CDP
// and PLAYS: the Bastion with an in-page driver that walks, turns and holds
// the minigun, so the numbers are the game and not an idle title card.
// Reports p50/p95/p99 work-per-frame, RAF interval, long tasks and the
// step/draw split — the rows `PERF-LEDGER.md` records.
//
// Why these choices:
// - BUILT bundle, not the dev server: the dev server runs unminified modules
//   through Vite's transform; its frame times are not the shipping ones.
// - The driver runs IN the page: a CDP round trip per input event is, under
//   throttling, as slow and as noisy as the thing being measured.
// - The probe is RESET after a settle, so boot, shader compile and the JIT
//   warm-up never land in the percentiles.
// - A/B arms are INTERLEAVED (base, variant, base, variant…), each rep in a
//   fresh browser, and compared on medians: background load on the machine
//   drifts during a run, and interleaving spreads it over both arms. An arm
//   is a `?perf=` flag (`src/use/perfVariants.ts`); `base` is no flag.
// - The port is checked by <title>: a stale server from another game answers
//   happily and the run measures the wrong app.

import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const ROOT = resolve(arg('dist', 'dist'))
const THROTTLE = Number(arg('throttle', '4'))
const SECONDS = Number(arg('seconds', '25'))
const ARMS = arg('arms', 'base').split(',').map(s => s.trim()).filter(Boolean)
const REPS = Number(arg('reps', '1'))
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const VIEW = (arg('view', '1280x720')).split('x').map(Number)
// --profile: also print where the CPU went (self time per function).
const PROFILE = argv.includes('--profile')
// --stealth: stay on the perch and only look around, so the garrison stays on
// patrol with its vision cones up. Without it the driver goes loud.
const STEALTH = argv.includes('--stealth')

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`no index.html in ${ROOT} — build first`)
  process.exit(2)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg'
}
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/') p = '/index.html'
  const file = join(ROOT, p.replace(/^\/+/, ''))
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
const PORT = 8800 + Math.floor(Math.random() * 400)
await new Promise(r => server.listen(PORT, '127.0.0.1', r))

/** One measured run of one arm, in its own browser (Playwright gives every
 *  launch a fresh temporary profile, so no one's open Chrome is touched). */
const runOnce = async (arm) => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  })
  const page = await (await browser.newContext({ viewport: { width: VIEW[0], height: VIEW[1] } })).newPage()
  // The mouse stays the owner's: even a headless Chrome takes the REAL pointer
  // lock when a page asks for it. The page gets a pretend one instead.
  await page.addInitScript(() => {
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
  })
  // A player who has been through the training ground: the first scene is the Bastion.
  await page.addInitScript(() => {
    if (!localStorage.getItem('cmachine_state')) localStorage.setItem('cmachine_state', JSON.stringify({ cm_v: 1, cm_seen: ['training'] }))
  })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    const q = arm === 'base' ? '?perfprobe=1' : `?perfprobe=1&perf=${arm}`
    await page.goto(`http://127.0.0.1:${PORT}/${q}`)
    const title = await page.title()
    if (!/Chaos Machine/i.test(title)) throw new Error(`wrong app on the port (title "${title}")`)

    // Boot and drop in, unthrottled: loading is not what this measures. Any
    // press skips the drop-in, once it has had a moment to register.
    await page.waitForSelector('.hud-layer', { timeout: 60000 })
    await sleep(900)
    await page.keyboard.press('Space')
    await sleep(5000)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

    // The in-page driver: leave the perch, walk into the yard, sweep the view
    // and hold the minigun in bursts, so the alarm goes, the garrison wakes,
    // shoots back and dies on camera. That is the heaviest the game gets.
    await page.evaluate((stealth) => {
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
      const surface = document.querySelector('.input-surface')
      const mouse = (target, type, extra) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...extra }))
      // The first press takes the (pretend) pointer lock; the second is a shot.
      if (surface) { mouse(surface, 'mousedown', {}); mouse(window, 'mouseup', {}) }
      if (!stealth) { key('keydown', 'Digit2'); key('keyup', 'Digit2') }
      let t = 0
      let fireHeld = false
      const id = setInterval(() => {
        t += 0.1
        if (stealth) {
          mouse(document, 'mousemove', { movementX: Math.sin(t * 0.9) * 14, movementY: 0 })
          return
        }
        key('keydown', 'KeyW')
        if (Math.sin(t * 0.7) > 0.6) key('keydown', 'KeyA'); else key('keyup', 'KeyA')
        if (Math.sin(t * 0.7) < -0.6) key('keydown', 'KeyD'); else key('keyup', 'KeyD')
        const wantFire = Math.sin(t * 1.1) > -0.3
        if (surface && wantFire !== fireHeld) { mouse(wantFire ? surface : window, wantFire ? 'mousedown' : 'mouseup', {}); fireHeld = wantFire }
        mouse(document, 'mousemove', { movementX: Math.sin(t * 0.9) * 14, movementY: 0 })
      }, 100)
      window.__perfDriver = () => clearInterval(id)
    }, STEALTH)
    await sleep(STEALTH ? 500 : 3000)
    await page.evaluate(() => window.__perfProbe?.reset())
    if (PROFILE) {
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
      await cdp.send('Profiler.start')
    }
    await sleep(SECONDS * 1000)
    if (PROFILE) {
      // Self time per function, heaviest first. Meaningful on an unminified
      // build: `npx vite build --outDir dist-prof --minify false`.
      const { profile } = await cdp.send('Profiler.stop')
      const self = new Map()
      const dt = profile.timeDeltas
      const byId = new Map(profile.nodes.map(n => [n.id, n]))
      let total = 0
      profile.samples.forEach((id, i) => {
        const n = byId.get(id)
        const f = n.callFrame
        const key = `${f.functionName || '(anonymous)'}  ${(f.url.split('/').pop() || '').split('?')[0]}:${f.lineNumber + 1}`
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0))
        total += dt[i] ?? 0
      })
      console.log(`  profile (${arm}): self time, share of ${(total / 1000).toFixed(0)} ms sampled`)
      for (const [k, v] of [...self].sort((x, y) => y[1] - x[1]).slice(0, 28)) console.log(`    ${(v / total * 100).toFixed(1).padStart(5)} %  ${k}`)
    }
    const s = await page.evaluate(() => window.__perfProbe?.summary())
    await page.evaluate(() => window.__perfDriver?.())
    if (!s) throw new Error('perf probe not installed')
    if (arm !== 'base' && !s.variants.includes(arm)) throw new Error(`arm "${arm}" did not take (variants ${JSON.stringify(s.variants)})`)
    if (errors.length) console.log(`  page errors (${arm}): ${errors.slice(0, 3).join(' | ')}`)
    return s
  } finally {
    await browser.close()
  }
}

const f = (v) => (typeof v === 'number' ? v.toFixed(1) : String(v))
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
const results = Object.fromEntries(ARMS.map(a => [a, []]))
try {
  console.log(`serving ${ROOT} · ${THROTTLE}x CPU · ${SECONDS}s per run · arms ${ARMS.join(' / ')} × ${REPS}`)
  for (let r = 0; r < REPS; r++) {
    for (const arm of ARMS) {
      const s = await runOnce(arm)
      results[arm].push(s)
      console.log(`  ${arm.padEnd(10)} rep ${r + 1}: frames ${s.frames}  work p50 ${f(s.workP50)} p95 ${f(s.workP95)}`
        + `  interval p50 ${f(s.intervalP50)} p95 ${f(s.intervalP95)}  step ${f(s.phases.step)} draw ${f(s.phases.draw)}  long ${s.longTasks}`)
    }
  }
  console.log('\nmedians')
  for (const arm of ARMS) {
    const rs = results[arm]
    const m = (k) => f(median(rs.map(s => s[k])))
    const mp = (k) => f(median(rs.map(s => s.phases[k])))
    console.log(`  ${arm.padEnd(10)} work p50 ${m('workP50')} p95 ${m('workP95')}  interval p50 ${m('intervalP50')} p95 ${m('intervalP95')}`
      + `  step ${mp('step')} draw ${mp('draw')}  long tasks ${m('longTasks')}`)
  }
} finally {
  server.close()
}
