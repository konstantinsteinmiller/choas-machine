#!/usr/bin/env node
// ─── Perf over REAL mission play, on the BUILT bundle ───────────────────────
//
//   npx vite build --outDir dist           # or any build mode
//   node scripts/perf-mission.mjs [--dist dist] [--throttle 4] [--seconds 25]
//   node scripts/perf-mission.mjs --arms base,noportal --reps 3     # A/B
//
// Serves the built output, opens it headless with the in-page probe on
// (`?perfprobe=1`, see `src/use/usePerfProbe.ts`), throttles the CPU over CDP
// and PLAYS: the first mission's corridor with an in-page driver that walks,
// turns and fires, so the numbers are the game and not an idle title card.
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
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    const q = arm === 'base' ? '?perfprobe=1' : `?perfprobe=1&perf=${arm}`
    await page.goto(`http://127.0.0.1:${PORT}/${q}`)
    const title = await page.title()
    if (!/Chaos Machine/i.test(title)) throw new Error(`wrong app on the port (title "${title}")`)

    // Boot and beam in, unthrottled: loading is not what this measures.
    // A fresh profile opens on the intro cutscene: skip it like a player.
    {
      const first = await page.waitForSelector('.cutscene-skip, .hud-layer', { timeout: 30000 })
      if (await first.evaluate(el => el.classList.contains('cutscene-skip'))) await first.click()
    }
    await page.waitForSelector('.hud-layer', { timeout: 30000 })
    await sleep(7000)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

    // The in-page driver: walk the corridor, sweep the view, fire in bursts
    // (charge and release), so enemies wake, shoot back and die on camera.
    await page.evaluate(() => {
      const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
      const surface = document.querySelector('.input-surface')
      let t = 0
      let fireHeld = false
      const id = setInterval(() => {
        t += 0.1
        key('keydown', 'KeyW')
        if (Math.sin(t * 0.7) > 0.6) key('keydown', 'KeyA'); else key('keyup', 'KeyA')
        if (Math.sin(t * 0.7) < -0.6) key('keydown', 'KeyD'); else key('keyup', 'KeyD')
        const wantFire = Math.sin(t * 2.3) > 0
        if (wantFire !== fireHeld) { key(wantFire ? 'keydown' : 'keyup', 'Space'); fireHeld = wantFire }
        if (surface) {
          const r = surface.getBoundingClientRect()
          const dx = Math.sin(t * 0.9) * 14
          surface.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 1, pointerType: 'mouse', clientX: r.width * 0.7 + dx, clientY: r.height * 0.5, movementX: dx, buttons: 0, bubbles: true
          }))
        }
      }, 100)
      window.__perfDriver = () => clearInterval(id)
    })
    await sleep(3000)
    await page.evaluate(() => window.__perfProbe?.reset())
    await sleep(SECONDS * 1000)
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
