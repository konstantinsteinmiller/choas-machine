#!/usr/bin/env node
// ─── A/B two BUILDS, and count the pixels ───────────────────────────────────
//
// `perf-mission.mjs` compares two variant FLAGS inside one build. This one
// compares two URLs, so the arms can be two standalone builds — "did this get
// slower since the release we were happy with" is a question about artefacts,
// not about flags, and a dev server's HMR and unminified modules are not the
// thing anybody ships.
//
// It also carries the instrument that found the fault in the 2026-09-14
// playtest report, which a flag A/B structurally could not: an OVERDRAW
// CENSUS. `workP95` is CPU time inside the RAF callback; on the device in that
// report `workP50` was 0.7 ms against a 33–50 ms frame, so 97 % of the frame
// was pixel work no CPU probe can see. The census wraps `fillRect` and
// `drawImage`, converts each destination rectangle through the live transform,
// and reports SCREENS OF FILL PER FRAME — a count, exact rather than
// statistical, and immune to a busy machine.
//
// ── Modes ──
//
//   --mode boot   throttle from navigation; time the load, count the bake
//   --mode play   unthrottled settle, then throttle; time the frames
//
// ── Usage ──
//
//   node scripts/perf-builds.mjs \
//     --a "http://127.0.0.1:4801/?tier=high" \
//     --b "http://127.0.0.1:4802/?tier=high" \
//     --w 1366 --h 768 --dpr 1.6 --mobile 0 --throttle 4 --reps 4
//
//   --gpu 0       SwiftShader, as a FILL-RATE proxy for a weak GPU. Read only
//                 as "which arm pushes fewer pixels"; never as an fps figure.
//   --census 0    drop the fill instrumentation when TIMING (the census's own
//                 `getTransform` per call is not free under software raster).
//   --quiet <pct> hold each rep until the machine is below this CPU load.
//
// Serve each build with any static server; check the served `<title>` before
// trusting a result, because a stale server from another project answers just
// as happily.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d }
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const A_BASE = arg('a', '')
const B_BASE = arg('b', '')
const QS = arg('qs', '')
const REPS = Number(arg('reps', 3))
const THROTTLE = Number(arg('throttle', 6))
const SECONDS = Number(arg('seconds', 22))
const STAGE = Number(arg('stage', 0))
const MODE = arg('mode', 'play')
const W = Number(arg('w', 412))
const H = Number(arg('h', 915))
const DPR = Number(arg('dpr', 2))
const MOBILE = arg('mobile', '1') === '1'
const ONCE = argv.includes('--once')
const BASE = arg('base', A_BASE)

// ─── Contention gate ────────────────────────────────────────────────────────
// This machine hosts other Claude Code sessions. One of them started `vitest
// run` (33 worker processes) mid-experiment and every rep after it collapsed —
// in BOTH arms, which reads as a result and is an artefact. So a rep does not
// start until the box is quiet, and each rep also carries an in-page
// calibration number so a rep that ran on a busy machine can be thrown out
// after the fact rather than believed.
const cpuLoad = () => {
  try {
    return Number(execFileSync('powershell', ['-NoProfile', '-Command',
      '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'],
      { encoding: 'utf8' }).trim())
  } catch { return 0 }
}
const waitQuiet = async (maxPct = Number(arg('quiet', 60)), maxWaitMs = 15 * 60 * 1000) => {
  const until = Date.now() + maxWaitMs
  let quiet = 0
  while (Date.now() < until) {
    const l = cpuLoad()
    if (l <= maxPct) { if (++quiet >= 3) return l } else { quiet = 0; console.log(`  … waiting for a quiet machine (cpu ${l}%)`) }
    await sleep(5000)
  }
  console.log('  ! gave up waiting for a quiet machine')
  return -1
}

const runOnce = async (base) => {
  const port = 9500 + Math.floor(Math.random() * 400)
  const profile = mkdtempSync(join(tmpdir(), 'perf-builds-'))
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    // Without these a window that another app covers is treated as occluded:
    // rAF stops, the game's own blur pause engages, and the arm records a
    // canvas that exists and a game that never ran. Cost a rep to find.
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion',
    // `--gpu 0`: software rasterisation, as a FILL-RATE proxy. A 4090 will
    // never show what an Adreno 618 does with 2.7 Mpx of gradients a frame;
    // SwiftShader over-weights fill relative to any real GPU, so it is only
    // ever read as "which arm pushes fewer pixels", never as an fps figure.
    ...(arg('gpu', '1') === '0' ? ['--disable-gpu', '--disable-software-rasterizer=false'] : []),
    `--window-size=${W + 40},${H + 120}`, '--window-position=0,0', 'about:blank'
  ], { stdio: 'ignore' })

  const json = async (p) => {
    for (let i = 0; i < 80; i++) {
      try { return await (await fetch(`http://127.0.0.1:${port}${p}`)).json() } catch { await sleep(300) }
    }
    throw new Error('no CDP endpoint')
  }
  const conn = new WebSocket((await json('/json/version')).webSocketDebuggerUrl)
  await new Promise(r => { conn.onopen = r })
  let id = 0
  const pending = new Map()
  conn.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}, s) => new Promise(res => {
    const mid = ++id; pending.set(mid, res)
    conn.send(JSON.stringify({ id: mid, method, params, ...(s ? { sessionId: s } : {}) }))
  })

  const { result: { targetInfos } } = await send('Target.getTargets')
  const page = targetInfos.find(t => t.type === 'page')
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
  const S = sessionId
  await send('Page.enable', {}, S)
  await send('Runtime.enable', {}, S)
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: MOBILE }, S)
  if (MOBILE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, S)
  // The game pauses itself on blur (`useGamePause`); emulate focus so it does
  // not, and raise the window so the compositor keeps painting it.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, S)
  await send('Page.bringToFront', {}, S)

  const evalIn = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, S)

  const seed = STAGE > 0 ? `try { localStorage.setItem('cmachine_state', JSON.stringify({
      ts_stage: ${STAGE}, ts_coins: 50000, ts_best_stage: ${STAGE - 1},
      ts_onboarded: true, ts_tutorial_seen: true, ts_results_seen: 6,
      ts_shop_spotlight_seen: true, ts_guard_hint_seen: true,
      ts_lever_hint_seen: true, ts_runs: 40,
      ts_upgrades: { squad: 10, power: 10, rate: 6, range: 4, scavenge: 5 }
    })) } catch (e) {}` : ''

  const bootScript = seed + `
    window.__t0 = performance.now()
    window.__cv = { n: 0, px: 0, peakPx: 0 }
    const oc = document.createElement.bind(document)
    document.createElement = function (tag) {
      const el = oc(tag)
      if (String(tag).toLowerCase() === 'canvas') {
        window.__cv.n++
        let w = 300, h = 150
        window.__cv.px += w * h
        Object.defineProperty(el, 'width', {
          get: function () { return w },
          set: function (v) { window.__cv.px += (v * h) - (w * h); w = v; el.setAttribute('width', v) },
          configurable: true
        })
        Object.defineProperty(el, 'height', {
          get: function () { return h },
          set: function (v) { window.__cv.px += (w * v) - (w * h); h = v; el.setAttribute('height', v) },
          configurable: true
        })
      }
      return el
    }
    if (typeof OffscreenCanvas === 'function') {
      const OC = OffscreenCanvas
      const Wrapped = function (w, h) { window.__cv.n++; window.__cv.px += w * h; return new OC(w, h) }
      Wrapped.prototype = OC.prototype
      window.OffscreenCanvas = Wrapped
    }
    window.__lt = []
    try {
      new PerformanceObserver(function (l) {
        for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)])
      }).observe({ entryTypes: ['longtask'] })
    } catch (e) {}
    window.__ms = {}
    const mark = function (k) { if (!window.__ms[k]) window.__ms[k] = Math.round(performance.now() - window.__t0) }
    const poll = function () {
      const cv = document.querySelector('canvas')
      if (cv && cv.width > 0) mark('canvas')
      if (window.__perfProbe) {
        mark('probe')
        try { const s = window.__perfProbe.summary(); if (s && s.frames > 0) mark('firstFrame') } catch (e) {}
      }
      requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  `
  await send('Page.addScriptToEvaluateOnNewDocument', { source: bootScript }, S)

  const url = new URL(base)
  url.searchParams.set('perfprobe', '1')
  url.searchParams.set('perfframes', '1000000')
  for (const pair of QS.split('&').filter(Boolean)) { const [k, v = ''] = pair.split('='); url.searchParams.set(k, v) }

  let out
  if (MODE === 'boot') {
    await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }, S)
    await send('Page.navigate', { url: url.toString() }, S)
    await sleep(SECONDS * 1000)
    const r = await evalIn(`JSON.stringify({
      ms: window.__ms, cv: window.__cv,
      lt: window.__lt.length, ltMs: window.__lt.reduce(function (a, b) { return a + b[1] }, 0),
      ltBoot: window.__lt.filter(function (e) { return e[0] < 15000 }).length,
      ltBootMs: window.__lt.filter(function (e) { return e[0] < 15000 }).reduce(function (a, b) { return a + b[1] }, 0),
      worst: window.__lt.slice().sort(function (a, b) { return b[1] - a[1] }).slice(0, 8),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0,
      cw: (document.querySelector('canvas') || {}).width,
      ch: (document.querySelector('canvas') || {}).height
    })`)
    out = JSON.parse(r.result.result.value)
  } else {
    await send('Page.navigate', { url: url.toString() }, S)
    await sleep(8000)
    const drive = await evalIn(`(function () {
      const cv = document.querySelector('canvas')
      if (!cv) return 'no canvas'
      window.__dc = 0; window.__dcFrames = 0; window.__by = {}
      const P = CanvasRenderingContext2D.prototype
      const methods = ['drawImage','fill','stroke','fillRect','strokeRect','fillText','strokeText','clip','getImageData','putImageData','createRadialGradient','createLinearGradient','createPattern','save']
      for (const m of methods) {
        const orig = P[m]
        P[m] = function () { window.__dc++; window.__by[m] = (window.__by[m] || 0) + 1; return orig.apply(this, arguments) }
      }
      // ── Overdraw census ──
      // Exact, not statistical: the destination area every fillRect / drawImage
      // covers, in DEVICE pixels, bucketed by how much of the screen one call
      // paints. A fill-rate-bound game is diagnosed here, not in workP95.
      window.__od = { total: 0, big: 0, bigN: 0, small: 0, smallN: 0, rects: {} }
      const main = document.querySelector('canvas')
      const screenPx = function () { return main.width * main.height }
      const areaOf = function (ctx, w, h) {
        const m = ctx.getTransform()
        return Math.abs(w * m.a) * Math.abs(h * m.d)
      }
      const bump = function (ctx, w, h) {
        if (ctx.canvas !== main) return
        const a = areaOf(ctx, w, h)
        window.__od.total += a
        if (a >= screenPx() * 0.4) {
          window.__od.big += a; window.__od.bigN++
          const m = ctx.getTransform()
          const key = Math.round(Math.abs(w * m.a)) + 'x' + Math.round(Math.abs(h * m.d))
          window.__od.rects[key] = (window.__od.rects[key] || 0) + 1
        }
        else { window.__od.small += a; window.__od.smallN++ }
      }
      const CENSUS = ${arg('census','1') === '1'}
      const fr = P.fillRect
      if (CENSUS) P.fillRect = function (x, y, w, h) { bump(this, w, h); return fr.apply(this, arguments) }
      const di = P.drawImage
      if (CENSUS) P.drawImage = function () {
        const a = arguments
        const w = a.length >= 9 ? a[7] : a.length >= 5 ? a[3] : (a[0].width || 0)
        const h = a.length >= 9 ? a[8] : a.length >= 5 ? a[4] : (a[0].height || 0)
        bump(this, w, h)
        return di.apply(this, arguments)
      }
      const count = function () { window.__dcFrames++; requestAnimationFrame(count) }
      requestAnimationFrame(count)
      cv.setPointerCapture = function () {}; cv.releasePointerCapture = function () {}
      const fire = function (type, x, extra) {
        return cv.dispatchEvent(new PointerEvent(type, Object.assign({
          pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true,
          cancelable: true, clientX: x, clientY: ${Math.round(H * 0.7)} }, extra)))
      }
      fire('pointerdown', ${Math.round(W / 2)}, { button: 0, buttons: 1 })
      const t0 = performance.now()
      const tick = function (t) {
        fire('pointermove', ${W / 2} + Math.sin((t - t0) / 5000 * Math.PI * 2) * ${W * 0.35}, { buttons: 1 })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      return 'driving'
    })()`)
    if (drive.result?.result?.value !== 'driving') throw new Error(`driver failed: ${JSON.stringify(drive.result?.result?.value)}`)
    await sleep(12000)
    // Calibration: a fixed unthrottled busy loop. Two arms whose calibration
    // numbers differ are two different machines, whatever the flags say.
    const cal = await evalIn(`(function () {
      const t = performance.now()
      let x = 0
      for (let i = 0; i < 8e6; i++) x += Math.sqrt(i % 1000)
      return Math.round(performance.now() - t) + (x > 0 ? 0 : 1)
    })()`)
    const calMs = cal.result?.result?.value ?? 0
    await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }, S)
    await sleep(3000)
    await evalIn(`window.__perfProbe.reset(); window.__dc = 0; window.__dcFrames = 0; window.__by = {}; window.__lt.length = 0
      window.__od = { total: 0, big: 0, bigN: 0, small: 0, smallN: 0, rects: {} }
      window.__cvT = []
      window.__cv0 = window.__cv.n
      window.__cvTimer = setInterval(function () {
        window.__cvT.push([Math.round(performance.now() - window.__t0), window.__cv.n - window.__cv0])
      }, 1000)`)
    await sleep(SECONDS * 1000)
    const r = await evalIn(`JSON.stringify(Object.assign(window.__perfProbe.summary(), {
      dcPerFrame: +(window.__dc / Math.max(1, window.__dcFrames)).toFixed(1),
      by: Object.fromEntries(Object.entries(window.__by).map(function (e) { return [e[0], +(e[1] / Math.max(1, window.__dcFrames)).toFixed(1)] })),
      cvN: window.__cv.n, cvMpx: +(window.__cv.px / 1048576).toFixed(1),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0,
      cw: (document.querySelector('canvas') || {}).width,
      ch: (document.querySelector('canvas') || {}).height,
      ms: window.__ms,
      ltList: window.__lt.slice().sort(function (a, b) { return b[1] - a[1] }).slice(0, 10),
      ltMs: window.__lt.reduce(function (a, b) { return a + b[1] }, 0),
      cvT: window.__cvT,
      rafFrames: window.__dcFrames,
      od: window.__od,
      screenPx: (document.querySelector('canvas') || {}).width * (document.querySelector('canvas') || {}).height
    }))`)
    out = JSON.parse(r.result.result.value)
    out.calMs = calMs
    // The probe drops 120 warm-up frames after a reset, so `frames` reads 0 on
    // an arm below ~6 fps — exactly the arm worth knowing about. rAF ticks over
    // the measured window are the unconditional number.
    out.rafFps = +(out.rafFrames / SECONDS).toFixed(1)
    // Screens of fill per frame — the number that matters on a fill-bound device.
    const f = Math.max(1, out.rafFrames)
    out.screensPerFrame = +(out.od.total / f / out.screenPx).toFixed(2)
    out.bigScreens = +(out.od.big / f / out.screenPx).toFixed(2)
    out.bigCalls = +(out.od.bigN / f).toFixed(1)
    out.smallScreens = +(out.od.small / f / out.screenPx).toFixed(2)
  }
  conn.close()
  // `chrome.kill()` kills only the launcher on Windows; the renderer and GPU
  // processes survive and the NEXT rep runs against a machine still hosting
  // them. Two reps in, both arms collapse together — which reads as a result
  // and is an artefact. Kill the tree, by PID, never by name.
  try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }) }
  catch { chrome.kill() }
  await sleep(2000)
  return out
}

if (ONCE) { console.log(JSON.stringify(await runOnce(BASE))); process.exit(0) }

const self = fileURLToPath(import.meta.url)
const runArm = (base) => JSON.parse(execFileSync(process.execPath, [
  self, '--once', '--base', base, '--throttle', String(THROTTLE), '--seconds', String(SECONDS),
  '--stage', String(STAGE), '--chrome', CHROME, '--mode', MODE, '--qs', QS, '--gpu', arg('gpu', '1'), '--census', arg('census', '1'),
  '--w', String(W), '--h', String(H), '--dpr', String(DPR), '--mobile', MOBILE ? '1' : '0'
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim().split('\n').pop())

console.log(`mode       ${MODE}`)
console.log(`arms       A ${A_BASE}   B ${B_BASE}   qs "${QS}"`)
console.log(`profile    ${W}x${H} @ DPR ${DPR}, mobile=${MOBILE}, ${THROTTLE}x CPU, stage ${STAGE || 'fresh'}`)
console.log(`reps       ${REPS} interleaved, ${SECONDS}s each, fresh browser per run\n`)

const rows = { A: [], B: [] }
if (MODE !== 'boot') console.log('  (each rep waits for a quiet machine; calMs is the in-page calibration loop)\n')
for (let rep = 1; rep <= REPS; rep++) {
  const order = rep % 2 ? [['A', A_BASE], ['B', B_BASE]] : [['B', B_BASE], ['A', A_BASE]]
  for (const [name, base] of order) {
    const load = await waitQuiet()
    const s = runArm(base)
    s.cpuAtStart = load
    rows[name].push(s)
    if (MODE === 'boot') {
      console.log(`rep ${rep} ${name}  canvas=${s.ms.canvas} firstFrame=${s.ms.firstFrame} `
        + `longTasks=${s.lt} (${s.ltMs}ms) boot<15s=${s.ltBoot} (${s.ltBootMs}ms) `
        + `canvases=${s.cv.n} bakedMpx=${(s.cv.px / 1048576).toFixed(1)} heap=${s.heapMB}MB cw=${s.cw}x${s.ch}`)
      console.log(`         worst long tasks ${JSON.stringify(s.worst)}`)
    } else {
      console.log(`rep ${rep} ${name}  cal=${s.calMs}ms cpu=${s.cpuAtStart}% rafFps=${s.rafFps}  frames=${s.frames} workP50=${s.workP50} workP95=${s.workP95} `
        + `intP50=${s.intervalP50} intP95=${s.intervalP95} longTasks=${s.longTasks} `
        + `draws/frame=${s.dcPerFrame} canvases=${s.cvN} bakedMpx=${s.cvMpx} heap=${s.heapMB}MB cw=${s.cw}x${s.ch}`)
      console.log(`         fill: ${s.screensPerFrame} screens/frame (${s.bigScreens} from ${s.bigCalls} full-screen calls, ${s.smallScreens} from the rest)`)
      console.log(`         longTaskMs=${s.ltMs} worst=${JSON.stringify(s.ltList)}`)
      console.log(`         new canvases during measure=${JSON.stringify(s.cvT)}`)
    }
  }
}
const median = xs => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
const keys = MODE === 'boot'
  ? [['canvas', s => s.ms.canvas], ['firstFrame', s => s.ms.firstFrame], ['longTasks', s => s.lt],
     ['longTaskMs', s => s.ltMs], ['bootLT', s => s.ltBoot], ['bootLTms', s => s.ltBootMs],
     ['canvases', s => s.cv.n], ['bakedMpx', s => +(s.cv.px / 1048576).toFixed(1)], ['heapMB', s => s.heapMB]]
  : [['rafFps', s => s.rafFps], ['screens/fr', s => s.screensPerFrame], ['bigScreens', s => s.bigScreens], ['workP50', s => s.workP50], ['workP95', s => s.workP95], ['workP99', s => s.workP99],
     ['intervalP50', s => s.intervalP50], ['intervalP95', s => s.intervalP95], ['longTasks', s => s.longTasks],
     ['dcPerFrame', s => s.dcPerFrame], ['canvases', s => s.cvN], ['bakedMpx', s => s.cvMpx], ['heapMB', s => s.heapMB]]
console.log('\nmedian-of-rep:')
for (const [k, f] of keys) {
  const a = median(rows.A.map(f)), b = median(rows.B.map(f))
  const d = a === 0 ? 0 : ((b - a) / a) * 100
  console.log(`  ${k.padEnd(12)} A ${String(a).padStart(9)}  ->  B ${String(b).padStart(9)}   (${d >= 0 ? '+' : ''}${d.toFixed(1)}%)`)
}
if (MODE !== 'boot') {
  const wins = rows.A.filter((a, i) => rows.B[i] && rows.B[i].workP95 < a.workP95).length
  console.log(`\n  paired wins for B on workP95   ${wins}/${REPS}`)
  console.log(`  ranges   A [${Math.min(...rows.A.map(s => s.workP95))}, ${Math.max(...rows.A.map(s => s.workP95))}]`
    + `   B [${Math.min(...rows.B.map(s => s.workP95))}, ${Math.max(...rows.B.map(s => s.workP95))}]`)
  console.log('\n  draw-call breakdown (median rep, per frame):')
  for (const arm of ['A', 'B']) {
    const mid = rows[arm][Math.floor(rows[arm].length / 2)]
    console.log(`   ${arm}  ${Object.entries(mid.by || {}).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v}`).join('  ')}`)
  }
}
