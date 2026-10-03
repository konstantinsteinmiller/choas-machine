/**
 * ─── Chaos Machine preview-video configuration ───────────────────────────────
 *
 *   pnpm preview:video                          # every format, both scenarios
 *   pnpm preview:video --formats 10s            # one deliverable
 *   pnpm preview:video --formats crazygames     # the portal cut
 *   pnpm preview:video --scenarios success      # one scenario, every format
 *   pnpm preview:video --no-clean               # with the whole HUD on
 *   pnpm preview:video --only-setup             # stop on the opening frame
 *   pnpm preview:video --help
 *
 * Output, one folder per quality — each a complete, uniformly named set:
 *
 *   preview-videos/lossless/<scenario>-<format>-<orientation>-<W>x<H>.mp4 (+ .png poster)
 *   preview-videos/high/…     the same clips as upload-ready H.264 4:2:0
 *
 * The clean feed: the recorder hides every DOM node but the game's canvas, so
 * the HUD, the lessons and the letterbox bars are gone at no cost to the game.
 * What the game paints INTO the scene (vision cones, searchlights, the "?" and
 * "!" marks, the beacon) stays: it is how the stealth reads without a HUD.
 * Those two marks are the only glyphs in a clip. A portal whose spec forbids
 * even them needs a flag in `sim/garrisonView.ts` that hides the marks; there
 * is none yet.
 */
export default {
  // The port-ownership check: many games on this machine answer on a dev port.
  title: 'Chaos Machine',

  // The DEV server, not a production build: `window.__preview` only exists
  // under `import.meta.env.DEV`.
  server: {
    mode: 'dev',
    // This pipeline's own port: 2196 is `pnpm dev`.
    port: 2197,
    command: 'pnpm',
    args: ['exec', 'vite', '--port', '{port}', '--strictPort'],
    env: {
      // A cache of its own, so this server never rewrites the one a running
      // `pnpm dev` is using.
      VITE_CACHE_DIR: 'node_modules/.vite-preview',
      // No board requests while recording: a recorded run ends missions.
      VITE_LEADERBOARD_URL: ''
    },
    // The recording page never hears hot reload: a file saved anywhere in the
    // repo must not navigate the page out from under a 900-frame capture.
    hotReload: false
  },

  // ── The deliverables ──
  //
  // Sizes are output PIXELS; the game sees width/dpr × height/dpr CSS px. The
  // renderer caps its pixel ratio at 2 (`engine/renderer.ts`), so every
  // orientation is dpr 2: 1080x1920 at dpr 2 is a 540x960 phone.
  formats: {
    '10s': {
      durationMs: 10_000,
      orientations: {
        portrait: { width: 720, height: 1280, dpr: 2, isMobile: true, hasTouch: true },
        landscape: { width: 1280, height: 720, dpr: 2, isMobile: false, hasTouch: false }
      }
    },
    // MP4 · H.264 · 30 s · 1920x1080 + 1080x1920. A different STORY, not a
    // longer one: the whole mission in miniature.
    '30s': {
      durationMs: 30_000,
      orientations: {
        portrait: { width: 1080, height: 1920, dpr: 2, isMobile: true, hasTouch: true },
        landscape: { width: 1920, height: 1080, dpr: 2, isMobile: false, hasTouch: false }
      },
      scenarios: { success: 'success-30s', fail: 'fail-30s' }
    },
    // CrazyGames: 15-20 s, 1080p landscape 16:9 AND portrait 2:3 (1080x1620,
    // not 9:16), 50 MB cap, no sound.
    crazygames: {
      durationMs: 16_000,
      quality: ['high', 'balanced'],
      orientations: {
        landscape: { width: 1920, height: 1080, dpr: 2, isMobile: false, hasTouch: false },
        portrait: { width: 1080, height: 1620, dpr: 2, isMobile: true, hasTouch: true }
      },
      scenarios: { success: 'success-30s', fail: 'fail-30s' }
    },
    // Poki's animated thumbnail: square, 4-6 s, 50 fps or higher, muted.
    poki: {
      durationMs: 5_000,
      fps: 60,
      quality: ['high', 'balanced'],
      orientations: {
        square: { width: 1080, height: 1080, dpr: 2, isMobile: true, hasTouch: true }
      }
    }
  },

  scenarios: ['success', 'fail'],

  fps: 30,
  // Two files from ONE capture: `lossless` is the archive, `high` the upload.
  quality: ['lossless', 'high'],
  outDir: 'preview-videos',
  capture: 'virtual',

  // The clock pins WHEN each frame is sampled; this pins WHAT is drawn in it
  // (every spark and every miss roll).
  seedRandom: 7,

  clean: {
    enabled: true,
    // The scene's canvas. Everything else in <body> is hidden.
    keep: ['.canvas-host canvas'],
    // The scene draws no canvas text (the "?" and "!" marks are meshes).
    suppressCanvasText: true,
    urlParams: {}
  },

  urlParams: {
    // The scripting handle (`window.__preview`), on EVERY recording URL.
    preview: '1',
    // The Bastion, though the recording profile is a new one (it would open
    // in the training ground).
    fort: 'bastion'
  },

  // A headless Chrome still takes the REAL pointer lock, which grabs the mouse
  // of whoever is working on this machine. The recording page gets a pretend
  // lock that lives inside the page. (The scenarios never click the canvas,
  // so nothing asks for one today; this keeps it that way.)
  async onPageReady(ctx) {
    await ctx.page.evaluate(() => {
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
  }
}
