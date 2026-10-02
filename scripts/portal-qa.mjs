#!/usr/bin/env node
// ─── Portal-signal proof, against the BUILT bundle ──────────────────────────
//
// Drives a HEADED Chrome on a private profile over CDP and asserts the three
// signals every portal grades — MUTE, PAUSE and the gameplay bracket — on the
// artefact QA actually runs. Companion to `perf-ab.mjs`, same shape.
//
//   pnpm build:gamepix        # or: npx vite build --mode gamepix --base=./
//   pnpm qa:portal
//
//   --platform <id>   gamepix | gamemonetize | none          (default gamepix)
//   --dist <dir>      built output to serve                 (default ./dist)
//   --chrome <path>   Chrome executable
//   --sdk-delay <ms>  how long the stubbed SDK takes to report ready
//                                                            (default 1200)
//   --keep            leave the browser open for inspection
//   --headless        run Chrome headless (WebGL via SwiftShader)
//
// Exits non-zero on the first failed check, so CI can gate on it.
//
// ── Why every part of this is the way it is ──
//
// THE BUILT BUNDLE, not the dev server. The dev server skips the obfuscator,
// the emitted platform-config files, and `vite-plugin-singlefile`. That last
// one is not academic: a literal control character in a source regex is
// harmless in every multi-file build and KILLS the single-file GamePix build
// outright, because HTML tokenisation rewrites U+0000 to U+FFFD inside the
// inlined <script> (see `tests/meta/noRawControlBytes.test.ts`). The dev server
// is green while the shipping artefact never boots.
//
// THE STUB IS INJECTED INTO THE HTML, not evaluated after load. Every check
// here is about what happens DURING boot — the portal reporting "muted" before
// the music element exists is the whole point — so an evaluate-after-load stub
// is too late, and an init-script would tie this to one driver.
//
// HEADED, PRIVATE PROFILE. The shared MCP Chrome profile is usually locked by
// another session; this never fights for it, and never leaves an invisible
// window playing audio with no way to close it.
//
// ── Four ways this check lies to you, all of which cost a run to find ──
//
// 1. INJECTING BEFORE `<meta charset>`. The browser sniffs the encoding from
//    the first 1024 bytes. A stub inserted ahead of the charset meta pushes it
//    out of that window, the whole bundle decodes as windows-1252, and the
//    first regex with a non-ASCII literal dies. That is the harness breaking
//    the app, and it looks exactly like a bug in the build. Inject AFTER it.
// 2. `document.querySelectorAll('audio')`. The music element is created with
//    `new Audio()` and never appended to the document, so that list is EMPTY
//    and `.every(a => a.paused)` over it is vacuously true — the check passes
//    with the audio blaring. Track the elements by wrapping the constructor.
// 3. THE TUTORIAL FREEZES THE ROAD. A first-run player's road does not move
//    until they steer, so "the simulation stopped when I hid the tab" passes
//    because it never started. Always assert a CONTROL case first — the run
//    advances while visible — and clear the tutorial with a real gesture.
// 4. HOSTNAME GATES. Platform builds refuse to render off their portal's
//    domain. Satisfy the gate with `--host-resolver-rules` rather than
//    weakening it: a build that skips its own gate is not the build QA runs.
// 5. AN SDK THAT IS READY INSTANTLY. This one shipped a QA rejection. A stub
//    that answers its handshake in 30 ms has no network in front of it, so it
//    wins every race against the game's own boot — and an ad placement that
//    SAMPLES readiness once, at boot, passes here and fires nothing on the
//    portal, where the SDK is a cross-origin script with an ad stack to load.
//    GameMonetize rejected survivalist for exactly that ("Ads should be shown
//    the first time after the game loads") while this harness was green.
//    `--sdk-delay` therefore defaults to a REALISTIC 1200 ms: slow enough that
//    a sampled-once placement loses, which is the whole point. Set it to 0 only
//    to demonstrate the difference.

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback
}
const flag = name => argv.includes(`--${name}`)

const PLATFORM = arg('platform', 'gamepix')
const ROOT = resolve(arg('dist', 'dist'))
const CHROME = arg('chrome', process.env.CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const KEEP = flag('keep')
// Headless keeps the run off the desktop (a private profile either way).
const HEADLESS = flag('headless')
// How long the stubbed SDK waits before reporting ready. NOT a detail: see
// note 5 above — an instantly-ready stub hides every readiness race, which is
// the class of bug that got the GameMonetize build rejected. Keep it well past
// the moment the game's own route chunk mounts.
const SDK_DELAY_MS = Number(arg('sdk-delay', '1200'))
const PORT = 8300 + Math.floor(Math.random() * 500)
const CDP_PORT = 9500 + Math.floor(Math.random() * 400)
const PROFILE = mkdtempSync(join(tmpdir(), 'portal-qa-'))

// ─── The shared probe ───────────────────────────────────────────────────────
//
// Platform-independent. Installs the counters and the levers every check below
// pulls; the per-platform SDK stub is appended to it.
const PROBE = `
var qa = window.__qa = { playCalls: [], sdkCalls: [], console: [], media: [], muted: true, sdkDelayMs: ${SDK_DELAY_MS} };

// A harness-only shim, and the only one here. Serving on a mapped hostname over
// plain http means the page is NOT a secure context, so \`crypto.randomUUID\` is
// undefined and the player-id code throws during boot. Real portals serve the
// iframe over https, where it exists — so this removes an artefact of the test
// rig rather than papering over a shipping bug. Guarded, so a secure context
// keeps the real implementation.
if (window.crypto && typeof window.crypto.randomUUID !== 'function') {
  window.crypto.randomUUID = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  };
}

// The mouse stays the owner's. Even a headless Chrome takes the REAL pointer
// lock from the OS when a page asks for it, and this game asks on the first
// click on its scene. The lock is replaced by a stand-in that lives only in
// the page: the game's captured-mouse path still runs, the OS is never asked.
(function () {
  var locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: function () { return locked; } });
  Element.prototype.requestPointerLock = function () {
    locked = this;
    Promise.resolve().then(function () { document.dispatchEvent(new Event('pointerlockchange')); });
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = function () {
    if (!locked) return;
    locked = null;
    Promise.resolve().then(function () { document.dispatchEvent(new Event('pointerlockchange')); });
  };
})();

// Media elements, tracked by CONSTRUCTOR — see trap 2 in the header.
var RealAudio = window.Audio;
window.Audio = function () {
  var el = new RealAudio(arguments[0]);
  qa.media.push(el);
  return el;
};
window.Audio.prototype = RealAudio.prototype;

var realPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  qa.playCalls.push({ src: String(this.currentSrc || this.src || ''), loop: !!this.loop });
  if (qa.media.indexOf(this) < 0) qa.media.push(this);
  return realPlay.apply(this, arguments);
};

['info', 'warn', 'error'].forEach(function (level) {
  var orig = console[level];
  console[level] = function () {
    try { qa.console.push(level + ': ' + Array.prototype.slice.call(arguments).join(' ')); } catch (e) {}
    return orig.apply(console, arguments);
  };
});

// The tab switch. The app reads document.visibilityState AND listens for the
// event, so both have to move together.
var hidden = false;
Object.defineProperty(document, 'visibilityState', { get: function () { return hidden ? 'hidden' : 'visible'; } });
Object.defineProperty(document, 'hidden', { get: function () { return hidden; } });
qa.setHidden = function (v) {
  hidden = !!v;
  document.dispatchEvent(new Event('visibilitychange'));
  return hidden;
};

// "Is the loop actually running?" — the game runs ONE requestAnimationFrame
// and a suspended loop cancels it outright, so the callback count is the
// observable: it climbs ~60/s while the world runs and stands still when the
// pause gate holds.
var realRaf = window.requestAnimationFrame.bind(window);
qa.raf = 0;
window.requestAnimationFrame = function (cb) {
  return realRaf(function (t) { qa.raf++; cb(t); });
};
qa.progress = function () { return qa.raf; };

// The music and every SFX are SYNTHESIZED on one Web Audio context, so the
// contexts are tracked by constructor (the same trap-2 reasoning as media:
// nothing lists them for us). A running context is live sound.
qa.contexts = [];
var RealAC = window.AudioContext || window.webkitAudioContext;
if (RealAC) {
  var TrackedAC = function (o) { var c = new RealAC(o); qa.contexts.push(c); return c; };
  TrackedAC.prototype = RealAC.prototype;
  window.AudioContext = TrackedAC;
  if (window.webkitAudioContext) window.webkitAudioContext = TrackedAC;
}
qa.musicPlays = function () {
  return qa.contexts.filter(function (c) { return c.state === 'running'; }).length
    + qa.playCalls.filter(function (c) { return c.loop; }).length;
};
qa.audioState = function () {
  return {
    count: qa.media.length + qa.contexts.length,
    allPaused: qa.media.every(function (a) { return a.paused; })
      && qa.contexts.every(function (c) { return c.state !== 'running'; })
  };
};
`

// ─── Per-platform SDK stubs ─────────────────────────────────────────────────
//
// `host` must satisfy the build's own hostname gate (`resolveCapabilities`).
// `mute(on)` drives the portal's mute the way the portal chrome would.
// Adding a platform is one entry; only the arms with a stub can run the audio
// checks, and `none` deliberately has none.
const PLATFORMS = {
  gamepix: {
    host: 'local.gamepix.com',
    label: 'GamePix v3',
    // Proof that `dist/` really holds THIS platform's build. A string only that
    // build can contain — here the SDK URL the plugin injects.
    fingerprint: 'integration.gamepix.com',
    stub: `
var store = {};
var sdk = {
  // Read by the plugin's initial-audio-state probe. MUTED at boot, which is
  // the flow QA runs: mute the portal chrome, then reload.
  isMuted: function () { return qa.muted; },
  // Delayed like GameMonetize's handshake (--sdk-delay), so a placement that
  // samples readiness once at boot cannot pass here and fire nothing live.
  init: function () {
    log('init');
    return new Promise(function (r) { setTimeout(r, qa.sdkDelayMs); });
  },
  customLoading: function (v) { log('customLoading:' + v); },
  gameLoading: function (p) { log('gameLoading:' + p); },
  gameLoaded: function (cb) { log('gameLoaded'); if (cb) setTimeout(cb, 0); },
  updateScore: function (s) { log('updateScore:' + s); },
  updateLevel: function (l) { log('updateLevel:' + l); },
  happyMoment: function () { log('happyMoment'); },
  lang: function () { return 'en'; },
  localStorage: {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  // A no-fill: resolves instantly and opens nothing, so the first-load
  // interstitial runs its real code path without an overlay in the way. That
  // is also the path that used to leave the game silent for the whole opening.
  interstitialAd: function () { log('interstitialAd'); return Promise.resolve({ success: false }); },
  rewardAd: function () { log('rewardAd'); return Promise.resolve({ success: false }); }
};

// Locked, so the real CDN script cannot replace it if it ever loads. The
// plugin only assigns to sdk.pause / .resume / .soundOn / .soundOff / .on,
// which are properties OF this object, not the binding itself.
Object.defineProperty(window, 'GamePix', { value: sdk, writable: false, configurable: false });

qa.portalMute = function (on) {
  qa.muted = !!on;
  var fn = on ? (sdk.soundOff || (sdk.on && sdk.on.soundOff))
              : (sdk.soundOn || (sdk.on && sdk.on.soundOn));
  if (typeof fn === 'function') fn();
  return typeof fn === 'function';
};
`
  },
  gamemonetize: {
    host: 'local.gamemonetize.com',
    label: 'GameMonetize HTML5',
    // The SDK URL the plugin injects — present only in a GameMonetize build.
    fingerprint: 'api.gamemonetize.com',
    // GameMonetize has NO mute API (`qa.portalMute` is deliberately absent, so
    // the mute checks skip rather than pass vacuously). Its only portal signal
    // is the ad bracket: SDK_GAME_PAUSE when the ad layer opens,
    // SDK_GAME_START when it closes. That bracket IS what this stub drives.
    stub: `
// Keep the real SDK off the wire: the plugin skips its own injection when a
// script with this id is already in the document.
var placeholder = document.createElement('script');
placeholder.id = 'gamemonetize-sdk';
document.head.appendChild(placeholder);

// The plugin assigns window.SDK_OPTIONS (with its onEvent fan-out) and THEN
// waits for SDK_READY, so intercept the assignment and answer it.
var opts = null;
Object.defineProperty(window, 'SDK_OPTIONS', {
  configurable: false,
  get: function () { return opts; },
  set: function (v) {
    opts = v;
    log('SDK_OPTIONS');
    // Delayed on purpose (--sdk-delay). The real handshake is a cross-origin
    // script load plus ad-stack init; a stub that answers immediately makes
    // any placement that samples readiness at boot pass here and do nothing
    // on the portal.
    setTimeout(function () { qa.gmEmit('SDK_READY'); }, qa.sdkDelayMs);
  }
});
qa.gmEmit = function (name) {
  if (!opts || typeof opts.onEvent !== 'function') return false;
  opts.onEvent({ name: name });
  return true;
};

// How long a stubbed ad stays OPEN. Deliberately longer than the 6 s
// \"the ad never opened\" cap useAds applies to a request that reports no
// impression: an ad that is still playing at second 8 is exactly the case that
// used to hand the game back — music under the ad, reward denied, result screen
// revealed on top of a live interstitial.
qa.adMs = 12000;
qa.ads = [];
qa.adAudit = null;
// True for as long as the stubbed ad is on screen. The shared checks below
// wait this out — sampling the world DURING a 12 s ad reports a frozen run and
// silent audio for every condition, which is the \"no control case\" trap.
qa.adOpen = false;
var runAd = function (kind) {
  qa.ads.push(kind);
  setTimeout(function () {
    qa.adOpen = true;
    qa.adAudit = {
      kind: kind,
      // Had the run started when the ad opened? The HUD element exists from
      // mount, so its PRESENCE proves nothing — the rail's progress is the
      // observable, and the first-play interstitial must land before it moves.
      progressAtOpen: qa.progress(),
      progressAfter1s: null,
      musicAtOpen: qa.musicPlays(),
      // The count above is CUMULATIVE play() calls, which cannot tell "the
      // music started at boot and the ad hard-stopped it" from "the music is
      // audible under the ad". With a post-splash placement the first is
      // normal and the second is the graded failure, so sample the elements
      // themselves as well.
      audioAtOpen: qa.audioState(),
      musicPastCap: null,
      audioPastCap: null,
      railPastCap: null
    };
    qa.gmEmit('SDK_GAME_PAUSE');
    setTimeout(function () { qa.adAudit.progressAfter1s = qa.progress(); }, 1000);
    // Sample PAST the 6 s cap but before the ad closes.
    setTimeout(function () {
      qa.adAudit.musicPastCap = qa.musicPlays();
      qa.adAudit.audioPastCap = qa.audioState();
      qa.adAudit.railPastCap = qa.progress();
    }, 8000);
    setTimeout(function () {
      qa.adOpen = false;
      qa.gmEmit('ALL_ADS_COMPLETED');
      qa.gmEmit('SDK_GAME_START');
    }, qa.adMs);
  }, 400);
};

var sdk = {
  showAd: function (type) {
    log('showAd:' + (type || 'interstitial'));
    runAd(type || 'interstitial');
    return Promise.resolve();
  },
  showBanner: function () { log('showBanner'); runAd('interstitial'); },
  preloadAd: function (t) { log('preloadAd:' + t); return Promise.resolve(); }
};
Object.defineProperty(window, 'sdk', { value: sdk, writable: false, configurable: false });
`
  },
  none: {
    host: '127.0.0.1',
    label: 'no SDK (plain web build)',
    fingerprint: null,
    stub: '' // pause + menu checks only; there is no portal to mute.
  }
}

const plat = PLATFORMS[PLATFORM]
if (!plat) {
  console.error(`unknown platform "${PLATFORM}" — have: ${Object.keys(PLATFORMS).join(', ')}`)
  process.exit(2)
}

const STUB = `<script>\n(function(){\nvar log=function(n){window.__qa.sdkCalls.push(n)};\n${PROBE}\n${plat.stub}\n})();\n</script>`

// ─── Serve the built output ─────────────────────────────────────────────────
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.map': 'application/json',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
}

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`no index.html in ${ROOT} — build first (e.g. pnpm build:${PLATFORM})`)
  process.exit(2)
}
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')
// AFTER the charset meta. See trap 1 in the header — this one line is the
// difference between testing the app and testing a mojibake of it.
const CHARSET = /<meta[^>]+charset[^>]*>/i
if (!CHARSET.test(indexHtml)) {
  console.error('built index.html has no charset meta — refusing to inject blind')
  process.exit(2)
}
const patched = indexHtml.replace(CHARSET, m => m + STUB)

// Is `dist/` actually the build we were asked to test?
//
// Every build writes to the same `dist/`, so a stale one — or one another
// terminal produced a minute ago — answers happily and you spend the run
// diagnosing the wrong bundle. That is the same failure as testing against a
// stale dev server on a port you assumed was yours, and it has already happened
// once here: `dist/` held a Poki build while this was reporting on GamePix.
if (plat.fingerprint) {
  const inline = indexHtml.includes(plat.fingerprint)
  const inChunks = !inline && existsSync(join(ROOT, 'assets'))
    && readdirSync(join(ROOT, 'assets')).some(f =>
      f.endsWith('.js') && readFileSync(join(ROOT, 'assets', f), 'utf8').includes(plat.fingerprint))
  if (!inline && !inChunks) {
    console.error(
      `${ROOT} does not look like a ${PLATFORM} build `
      + `(no "${plat.fingerprint}" in it).\nRebuild: pnpm build:${PLATFORM}`
    )
    process.exit(2)
  }
}

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(patched)
    return
  }
  const file = join(ROOT, p.replace(/^\/+/, ''))
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(PORT, '0.0.0.0', r))

// ─── Chrome + CDP ───────────────────────────────────────────────────────────
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  // The tab must keep running at full speed while we PRETEND it is hidden, or
  // Chrome's own background throttling produces the result we are trying to
  // attribute to the game's pause gate.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--autoplay-policy=no-user-gesture-required',
  // Satisfy the build's hostname gate instead of switching it off.
  `--host-resolver-rules=MAP ${plat.host} 127.0.0.1`,
  '--window-size=520,900',
  ...(HEADLESS ? ['--headless=new', '--use-angle=d3d11', '--enable-unsafe-swiftshader'] : []),
  'about:blank'
], { stdio: 'ignore' })

const api = `http://127.0.0.1:${CDP_PORT}/json`
const waitForChrome = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(`${api}/version`); if (r.ok) return r.json() } catch { /* not up */ }
    await sleep(250)
  }
  throw new Error('Chrome did not expose a debugging port')
}

let msgId = 0
const connect = wsUrl => {
  const ws = new WebSocket(wsUrl)
  const pending = new Map()
  const ready = new Promise((res, rej) => {
    ws.onopen = () => res()
    ws.onerror = e => rej(new Error(`ws error ${e?.message ?? ''}`))
  })
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    const p = m.id && pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result)
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, ready, send }
}

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const version = await waitForChrome()
const target = await (await fetch(`${api}/new?about:blank`, { method: 'PUT' })).json()
const { ws, ready, send } = connect(target.webSocketDebuggerUrl)
await ready

const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${expr}`)
  return r.result.value
}

/** Drag across the scene the way a player looks about, with real input
 *  events: the first gesture is what unlocks the audio context and (on Poki)
 *  the first gameplayStart. See trap 3. */
const steer = async () => {
  const box = JSON.parse(await ev(`(() => {
    const c = document.querySelector('canvas'); if (!c) return 'null';
    const r = c.getBoundingClientRect();
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height * 0.75, w: r.width });
  })()`))
  const at = (type, x, y) => send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1
  })
  for (let pass = 0; pass < 3; pass++) {
    const dir = pass % 2 === 0 ? 1 : -1
    await at('mousePressed', box.x, box.y)
    for (let i = 1; i <= 10; i++) {
      await at('mouseMoved', box.x + dir * box.w * 0.03 * i, box.y)
      await sleep(30)
    }
    await at('mouseReleased', box.x + dir * box.w * 0.3, box.y)
    await sleep(150)
  }
}

try {
  console.log(`browser   ${version.Browser}`)
  console.log(`platform  ${PLATFORM} (${plat.label})`)
  console.log(`serving   ${ROOT} on http://${plat.host}:${PORT}\n`)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: `http://${plat.host}:${PORT}/` })

  // The port is ours, not a stale server from another game answering happily.
  for (let i = 0; i < 60 && !(await ev('document.title')); i++) await sleep(250)
  const title = await ev('document.title')
  check('serving THIS game (title check)', !!title, `title="${title}"`)

  let booted = false
  for (let i = 0; i < 160; i++) {
    if (await ev('!!document.querySelector(".hud-layer")')) { booted = true; break }
    await sleep(250)
  }
  check('game booted into the mission or the Command Base', booted)
  if (!booted) {
    console.log('  body    : ' + await ev('document.body.innerText.slice(0,300)'))
    console.log('  console : ' + await ev('JSON.stringify(window.__qa.console.slice(-15))'))
    throw new Error('never reached gameplay')
  }
  // ── Wait for the game to actually be PLAYABLE ───────────────────────────
  //
  // The HUD is in the DOM from mount, so the check above fires while the splash
  // is still up and, on the networks that require one, before the first-play
  // interstitial has even been requested. Everything below reads a world that
  // both of those deliberately freeze and silence — which passes every pause
  // check without testing anything, and fails the control case that exists to
  // catch precisely that (a first GameMonetize run reported `0% -> 0%` on every
  // line while the ad it was measuring through still had four seconds to run).
  //
  // `#static-splash` ships inside index.html, so it is present from the first
  // byte and its REMOVAL is a real edge — no "waiting on an absence" race.
  const splashUp = () => ev('!!document.getElementById("static-splash")')
  for (let i = 0; i < 240 && await splashUp(); i++) await sleep(250)
  check('splash cleared — the loader finished', !(await splashUp()))
  // The first-play ad is dispatched right after the splash goes; give it a
  // moment to be requested, then wait out however long it plays.
  await sleep(2000)
  for (let i = 0; i < 160 && await ev('!!window.__qa.adOpen'); i++) await sleep(500)

  console.log(`  sdk calls: ${await ev('JSON.stringify(window.__qa.sdkCalls)')}`)
  console.log(`  audio log: ${await ev('JSON.stringify(window.__qa.console.filter(l => /audio|sound|mute|pause/i.test(l)))')}\n`)

  // ── GameMonetize: the ad bracket, which is its only portal signal ───────
  //
  // The first-play interstitial is moderation-mandated on this network, so it
  // is a release gate in its own right — and it is the placement that proves
  // the ad-open (impression) plumbing, because the stubbed ad outlives the 6 s
  // cap `useAds` applies to an ad nobody reported opening.
  if (PLATFORM === 'gamemonetize') {
    const audit = JSON.parse(await ev('JSON.stringify(window.__qa.adAudit)'))
    check('SDK init handshake (SDK_OPTIONS → SDK_READY)',
      (await ev('JSON.stringify(window.__qa.sdkCalls)')).includes('SDK_OPTIONS'))
    check('first-play interstitial was requested', !!audit,
      `ads=${await ev('JSON.stringify(window.__qa.ads)')}`)
    if (audit) {
      // The mission is already beaming in behind the splash when the
      // first-load ad opens, so the proof is that the world FREEZES under it.
      check('the world is frozen while the ad is open',
        audit.progressAfter1s !== null && audit.progressAfter1s - audit.progressAtOpen <= 2,
        `rAF at open = ${audit.progressAtOpen}, 1 s later = ${audit.progressAfter1s}`)
      // SILENT, not never-started. GameMonetize's ad is the post-splash
      // first-load placement (`useFirstLoadInterstitial`), so stage 1 and its
      // music are already running behind the splash when the ad opens — the
      // guarantee is that `showMidgameAd` hard-stops them BEFORE the request,
      // not that the track never played. A cumulative play() count cannot tell
      // those apart; the elements themselves can. `count > 0` guards the
      // empty-set trap (note 2 in the header).
      check('no music underneath the ad',
        audit.audioAtOpen.count > 0 && audit.audioAtOpen.allPaused,
        `audio at open = ${JSON.stringify(audit.audioAtOpen)}`)
      // The one that regressed: with no impression reported, the wait was
      // released at 6 s, the ad gate dropped, and the game started playing
      // music under an ad that had four seconds left to run.
      check('still silent PAST the 6 s cap (ad ran 12 s)',
        audit.audioPastCap.count > 0 && audit.audioPastCap.allPaused,
        `audio at 8 s = ${JSON.stringify(audit.audioPastCap)}`)
    }
    // Polled, not sampled. The ad's resume event does not start the music —
    // it releases `boot()`, which then starts the stage, waits a tick, sizes
    // the canvas and only then plays the track. That is about half a second,
    // and reading the counter the instant the ad closes catches it maybe half
    // the time: two runs of this check failed with `music play()=0` on a build
    // whose music was demonstrably fine a second later.
    let musicAfter = 0
    for (let i = 0; i < 20 && musicAfter === 0; i++) {
      musicAfter = await ev('window.__qa.musicPlays()')
      if (musicAfter === 0) await sleep(250)
    }
    check('music starts once the ad closes', musicAfter > 0, `music play()=${musicAfter}`)
  }

  // ── Mute, on the flow QA runs: already muted at boot, then reload ────────
  //
  // Only for portals that HAVE a mute API. GameMonetize has none, so the arm
  // ships no `portalMute` and these are skipped out loud rather than passing
  // against a lever that does not exist.
  const canMute = await ev("typeof window.__qa.portalMute === 'function'")
  if (!canMute) console.log(`  (skipped: ${plat.label} exposes no mute signal)\n`)
  if (canMute) {
    await sleep(2500) // give the music every chance to start
    const muted = await ev('window.__qa.musicPlays()')
    check('portal muted at boot → ZERO music starts', muted === 0,
      `music play()=${muted}, all media play()=${await ev('window.__qa.playCalls.length')}`)

    // The second leg is not optional: without it, a game that simply never
    // plays music passes the check above.
    check('soundOn callback registered on the SDK', await ev('window.__qa.portalMute(false)') === true)
    await sleep(1500)
    const after = await ev('window.__qa.musicPlays()')
    check('portal unmute → music DOES start', after > 0, `music play()=${after}`)
  }

  // ── Pause: the control case FIRST, or the rest means nothing ─────────────
  await steer()
  await sleep(800)
  const before = await ev('window.__qa.progress()')
  await sleep(1200)
  const moving = await ev('window.__qa.progress()')
  // "Running" is any real frame flow — a software-GL headless run draws ~12
  // fps, a desktop 60 — while a held gate reads exactly 0 (see the checks below).
  check('control: the world runs while visible', moving - before > 5, `rAF ${before} → ${moving}`)

  await ev('window.__qa.setHidden(true)')
  await sleep(300)
  const hiddenStart = await ev('window.__qa.progress()')
  await sleep(1800)
  const hiddenEnd = await ev('window.__qa.progress()')
  check('tab away → simulation FROZEN', hiddenEnd - hiddenStart <= 2, `rAF ${hiddenStart} → ${hiddenEnd}`)

  const hiddenAudio = JSON.parse(await ev('JSON.stringify(window.__qa.audioState())'))
  check('tab away → all audio suspended', hiddenAudio.count > 0 && hiddenAudio.allPaused,
    JSON.stringify(hiddenAudio))

  await ev('window.__qa.setHidden(false)')
  await sleep(1500)
  const back = await ev('window.__qa.progress()')
  check('return to tab → simulation RESUMES', back - hiddenEnd > 5, `rAF ${hiddenEnd} → ${back}`)

  // ── Menu entry ───────────────────────────────────────────────────────────
  // A fresh profile is in the fortress, past its drop-in by now: the pause
  // chip. A returning one is in the base: the settings cog. Found by test id
  // first (the labels are translated), by label as the fallback.
  const menuButton = `!!document.querySelector('[data-testid="btn-pause"], .system-corner button')`
  for (let i = 0; i < 40 && !(await ev(menuButton)); i++) await sleep(250)
  const opened = await ev(`(() => {
    const byId = document.querySelector('[data-testid="btn-pause"]');
    const btns = Array.from(document.querySelectorAll('button'));
    const b = byId || btns.find(x => /option|setting|pause/i.test(x.getAttribute('aria-label') || ''));
    if (!b) return 'no-button';
    b.click(); return 'clicked';
  })()`)
  await sleep(700)
  const menuStart = await ev('window.__qa.progress()')
  await sleep(1600)
  const menuEnd = await ev('window.__qa.progress()')
  check('menu open → simulation FROZEN', opened === 'clicked' && menuEnd - menuStart <= 2,
    `${opened}; rAF ${menuStart} → ${menuEnd}`)

  // By design a menu freezes the world but NOT the sound (the Options
  // sliders must be heard; see isAudioPaused) — only ads, a hidden tab and a
  // platform pause silence it. So the contract here is the opposite of the
  // tab-away one: the audio stays live.
  const menuAudio = JSON.parse(await ev('JSON.stringify(window.__qa.audioState())'))
  check('menu open → audio stays live (modals freeze the game, not the sound)',
    menuAudio.count > 0 && !menuAudio.allPaused, JSON.stringify(menuAudio))
} finally {
  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) console.log('FAILED: ' + failed.map(f => f.name).join('; '))
  if (!KEEP) {
    ws.close()
    await fetch(`${api}/close/${target.id}`).catch(() => {})
    chrome.kill()
    server.close()
    process.exit(failed.length ? 1 : 0)
  } else {
    console.log(`\n--keep: browser left open on http://${plat.host}:${PORT} (ctrl-c to stop)`)
  }
}
