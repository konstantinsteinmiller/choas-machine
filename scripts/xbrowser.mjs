#!/usr/bin/env node
// ─── Cross-engine smoke test, on the BUILT bundle ───────────────────────────
//
//   npx vite build --outDir dist
//   node scripts/xbrowser.mjs [--dist dist] [--only chrome|edge|firefox|webkit]
//
// Plays the first mission to its result screen in Chrome, Edge, Firefox and
// WebKit, and asserts STATE, not vibes: WebGL came up, the mission HUD
// mounted, the objective completed (dev cheat, `localStorage.cheat`), Beam-out
// appeared and B beamed out, the results screen entered the DOM, Continue
// reached the hub, and the page logged ZERO errors. `locked` reports whether
// the engine granted the mouse capture on the first click.
//
// Run it before every release, not after a bug report. Engine- and
// device-dependent failures are invisible on desktop Chrome, which is the one
// browser that gets tested by default. Edge ships Tracking Prevention on by
// default (it blocks ad hosts mid-flight), and WebKit is Safari's engine: there
// is no Safari for Windows, so also finish on a real iOS device.
//
// Firefox and WebKit are Playwright's own builds, found under
// %LOCALAPPDATA%/ms-playwright (`npx playwright install firefox webkit`).
// Each engine gets a fresh temporary profile, so no one's open browser is
// touched.
//
// The Beam-out button bobs forever (a CSS animation), so it is never "stable"
// by Playwright's rules and would time out a normal click; it is clicked with
// { force: true }. A person taps it without trouble.

import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)
const pw = require('playwright-core')

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const ROOT = resolve(arg('dist', 'dist'))
const ONLY = arg('only', '')
if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`no index.html in ${ROOT} — build first`)
  process.exit(2)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg'
}
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/') p = '/index.html'
  const f = join(ROOT, p.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
const PORT = 9300 + Math.floor(Math.random() * 300)
await new Promise(r => server.listen(PORT, '127.0.0.1', r))

/** Newest installed Playwright build of an engine, e.g. firefox-1543. */
const PW_DIR = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
const newest = (prefix, exe) => {
  if (!existsSync(PW_DIR)) return null
  const dirs = readdirSync(PW_DIR)
    .filter(d => d.startsWith(`${prefix}-`))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of dirs) { const p = join(PW_DIR, d, exe); if (existsSync(p)) return p }
  return null
}

const ENGINES = [
  ['chrome', pw.chromium, 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--use-angle=d3d11', '--enable-unsafe-swiftshader']],
  ['edge', pw.chromium, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--use-angle=d3d11']],
  ['firefox', pw.firefox, newest('firefox', join('firefox', 'firefox.exe')), []],
  ['webkit', pw.webkit, newest('webkit', 'Playwright.exe'), []]
]

let failed = 0
try {
  for (const [name, type, exe, args] of ENGINES) {
    if (ONLY && ONLY !== name) continue
    if (!exe || !existsSync(exe)) { console.log(`SKIP ${name}: not installed`); continue }
    const t0 = Date.now()
    const out = { engine: name }
    let browser
    try {
      browser = await type.launch({ headless: true, executablePath: exe, args })
      const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage()
      // The build carries the LIVE leaderboard Worker, and this run ends a
      // mission, so it would post a real score from every engine. Answer the
      // Worker here instead: 200s, so the client takes its normal path and no
      // "failed to load" console error fails the run.
      await page.route(/\.workers\.dev\//, (route) => {
        const req = route.request()
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
        const board = { updatedAt: Date.now(), total: 1, entries: [], dist: [] }
        let score = 0
        try { score = Number(JSON.parse(req.postData() || '{}').score) || 0 } catch { /* not a post */ }
        const body = req.method() === 'POST' ? { rank: 1, best: score, total: 1, board } : board
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) })
      })
      const errors = []
      page.on('pageerror', e => errors.push('pageerror: ' + e.message))
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
      await page.addInitScript(() => localStorage.setItem('cheat', 'true'))
      // Pointer lock is emulated in the page: a real capture from a headless
      // browser on Windows grabs the HOST's cursor (a playtest run took the
      // owner's mouse). The page still sees the whole contract, so `out.locked`
      // below still proves the game asked for the capture.
      await page.addInitScript(() => {
        let lockEl = null
        const fire = () => queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')))
        Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get () { return lockEl } })
        Element.prototype.requestPointerLock = function () {
          if (lockEl !== this) { lockEl = this; fire() }
          return Promise.resolve()
        }
        Document.prototype.exitPointerLock = function () {
          if (lockEl) { lockEl = null; fire() }
        }
      })
      await page.goto(`http://127.0.0.1:${PORT}/`)
      out.title = await page.title()
      if (!/Chaos Machine/i.test(out.title)) throw new Error(`wrong app on the port (title "${out.title}")`)
// A fresh profile opens on the intro cutscene: skip it the way a player
      // does (the skip glyph), so the skip itself is exercised.
      {
        const first = await page.waitForSelector('.cutscene-skip, .hud-layer', { timeout: 40000 })
        if (await first.evaluate(el => el.classList.contains('cutscene-skip'))) await first.click()
      }
      await page.waitForSelector('.hud-layer', { timeout: 40000 })
      out.webgl = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return !!(c && (c.getContext('webgl2') || c.getContext('webgl')))
      })
      await page.waitForTimeout(8000) // splash + beam-in
      // The first click captures the mouse (pointer lock) where the engine
      // grants it; a captured mouse has no cursor for HUD buttons, so the
      // run beams out with the B key, like a desktop player.
      await page.mouse.click(700, 300)
      out.locked = await page.evaluate(() => !!document.pointerLockElement)
      await page.keyboard.press('Control+Shift+Alt+KeyO') // cheat: objective done
      await page.waitForSelector('.ctx-btn.beam', { timeout: 10000 })
      await page.keyboard.press('KeyB')
      await page.waitForSelector('.results', { timeout: 20000 })
      out.results = true
      await page.locator('button', { hasText: /continue/i }).last().click({ force: true, timeout: 10000 })
      await page.waitForSelector('.hub', { timeout: 15000 })
      out.hub = true
      out.errors = errors.slice(0, 5)
      if (errors.length || !out.webgl) failed++
    } catch (e) {
      out.fail = String(e?.message ?? e).split('\n')[0]
      failed++
    } finally {
      out.secs = Math.round((Date.now() - t0) / 1000)
      console.log(`${out.fail || out.errors?.length ? 'FAIL' : 'PASS'} ${JSON.stringify(out)}`)
      await browser?.close().catch(() => {})
    }
  }
} finally {
  server.close()
}
process.exit(failed ? 1 : 0)
