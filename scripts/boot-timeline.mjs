#!/usr/bin/env node
// ─── Boot timeline: what the player sees while the game loads ───────────────
//
//   node scripts/boot-timeline.mjs [url] [--throttle 4] [--verbose]
//   node scripts/boot-timeline.mjs --dist <built dir> [--throttle 4]   (serves it)
//
// Loads the page headless (fresh profile), optionally with CPU throttling,
// and prints the boot's User Timing marks (`boot:*`, set in `src/game/boot.ts`
// and FLogoProgress), how the loader bar actually advanced (sampled every
// frame from the fill's transform), and every long task over 50 ms. The
// questions it answers are the ones a player asks: how soon did something
// move, did the bar ever freeze, and how long until I could play?
//
// Point it at the dev server or at a served build (`npx vite preview`); check
// the printed title, since a stale server from another game answers happily.

import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const argv = process.argv.slice(2)
const di = argv.indexOf('--dist')
let server = null
let url = argv.find(a => a.startsWith('http')) ?? 'http://localhost:2196/'
if (di >= 0) {
  const ROOT = resolve(argv[di + 1])
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp' }
  server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p === '/') p = '/index.html'
    const f = join(ROOT, p.replace(/^\/+/, ''))
    if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
    res.end(readFileSync(f))
  })
  const port = 9700 + Math.floor(Math.random() * 200)
  await new Promise(r => server.listen(port, '127.0.0.1', r))
  url = `http://127.0.0.1:${port}/`
}
const ti = argv.indexOf('--throttle')
const throttle = ti >= 0 ? Number(argv[ti + 1]) : 1
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] })
try {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage()
  const cdp = await page.context().newCDPSession(page)
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  await page.addInitScript(() => {
    const w = window
    w.__bar = []
    w.__long = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push([Math.round(e.startTime), Math.round(e.duration)]) })
      .observe({ type: 'longtask', buffered: true })
    const read = () => {
      const el = document.querySelector('.loader .fill') ?? document.querySelector('#static-splash .s-fill')
      if (el) {
        const m = /matrix\(([^,]+)/.exec(getComputedStyle(el).transform)
        const v = m ? Math.round(parseFloat(m[1]) * 100) : 0
        const last = w.__bar[w.__bar.length - 1]
        if (!last || last[1] !== v) w.__bar.push([Math.round(performance.now()), v])
      }
      if (!w.__done) requestAnimationFrame(read)
    }
    requestAnimationFrame(read)
  })
  const t0 = Date.now()
  await page.goto(url)
  console.log(`title "${await page.title()}"  (${throttle}x CPU)`)
  // Playable = the loader is gone and the scene has adopted the first mode.
  await page.waitForFunction(
    () => !document.querySelector('.loader') && performance.getEntriesByName('boot:adopted').length > 0,
    null, { timeout: 90000 }
  )
  // A first launch plays the intro while the tutorial builds behind it: wait
  // for that build, then report it against the beam (15 s into the intro),
  // where the tutorial takes over. Later is covered by the beam overlay.
  const intro = await page.evaluate(() => performance.getEntriesByName('boot:intro-start').length > 0)
  if (intro) {
    await page.waitForFunction(() => performance.getEntriesByName('boot:tutorial-built').length > 0, null, { timeout: 90000 })
    const [s, b] = await page.evaluate(() => ['boot:intro-start', 'boot:tutorial-built'].map(n => performance.getEntriesByName(n)[0].startTime))
    const d = (b - s) / 1000
    console.log(`intro  tutorial built ${d.toFixed(1)} s into the intro (the beam is at 15.0 s): ${d <= 15 ? 'in time' : 'OVERRUNS — the beam overlay holds'}`)
  }
  const r = await page.evaluate(() => {
    window.__done = true
    return {
      marks: performance.getEntriesByType('mark').filter(m => m.name.startsWith('boot:')).map(m => [m.name, Math.round(m.startTime)]),
      bar: window.__bar,
      long: window.__long.filter(l => l[1] > 50)
    }
  })
  console.log(`playable after ${Date.now() - t0} ms wall`)
  console.log('marks  ', r.marks.map(([n, t]) => `${n}@${t}`).join('  '))
  // Longest stretch the bar did not move, while it was on screen.
  let still = 0
  for (let i = 1; i < r.bar.length; i++) still = Math.max(still, r.bar[i][0] - r.bar[i - 1][0])
  console.log(`bar    ${r.bar.length} steps, longest standstill ${still} ms, first move @${r.bar.find(b => b[1] > 0)?.[0] ?? '-'}`)
  console.log(`long   ${r.long.length} tasks > 50 ms, longest ${Math.max(0, ...r.long.map(l => l[1]))} ms, total ${r.long.reduce((a, l) => a + l[1], 0)} ms`)
  if (argv.includes('--verbose')) console.log('       ' + r.long.map(([s, d]) => `${d}ms@${s}`).join('  '))
} finally {
  await browser.close()
  server?.close()
}
