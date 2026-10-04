import { existsSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'

/**
 * ─── End-to-end harness ──────────────────────────────────────────────────────
 *
 * The specs drive the REAL game in a headless Chrome against the dev server
 * that `globalSetup.ts` starts. They use real input (keys, mouse, touch) and
 * read the game through the dev-only `window.__game` handle.
 *
 * Two rules every page obeys:
 *  - POINTER LOCK IS STUBBED. Even headless, Chrome takes the real pointer
 *    lock from the OS and captures the mouse of whoever is working on this
 *    machine. The stand-in lives only in the page; the game's captured-mouse
 *    path still runs.
 *  - One browser for the whole run, a fresh context per test: every test
 *    starts from an empty save unless it seeds one.
 */

const CHROME_CANDIDATES = [
  process.env.E2E_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter((p): p is string => !!p)

export const BASE_URL = (): string => {
  const url = process.env.E2E_URL
  if (!url) throw new Error('E2E_URL is not set: run the suite through vitest.e2e.config.ts')
  return url
}

/** The in-page stand-in for the Pointer Lock API (see the header). */
const NO_POINTER_LOCK = (): void => {
  let locked: Element | null = null
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked })
  Element.prototype.requestPointerLock = function (this: Element) {
    locked = this
    queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')))
    return Promise.resolve()
  } as typeof Element.prototype.requestPointerLock
  Document.prototype.exitPointerLock = function () {
    if (!locked) return
    locked = null
    queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')))
  }
}

let browser: Browser | null = null

export const openBrowser = async (): Promise<Browser> => {
  if (browser) return browser
  const executablePath = CHROME_CANDIDATES.find(p => existsSync(p))
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: true,
    // WebGL without a GPU, and no sound out of a test run.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio']
  })
  return browser
}

export const closeBrowser = async (): Promise<void> => {
  await browser?.close()
  browser = null
}

export type Device = 'desktop' | 'phone-portrait' | 'phone-landscape'
const VIEWPORTS: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  // The smallest portrait the game supports, and a small landscape phone.
  'phone-portrait': { width: 320, height: 658 },
  'phone-landscape': { width: 764, height: 385 }
}
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

export interface Game {
  page: Page
  context: BrowserContext
  /** Console errors and uncaught exceptions seen so far. */
  errors: string[]
  viewport: { width: number; height: number }
  close: () => Promise<void>
}

export interface OpenOptions {
  device?: Device
  /** The save to start from (the `cmachine_state` blob). Absent = a new player who has done the training ground. */
  save?: Record<string, unknown>
  /** A brand-new player: not even the training ground done (it is the first scene then). */
  brandNew?: boolean
  /** Query string, e.g. `?level=3`. */
  query?: string
}

/** Open the game in a fresh context. Does not wait for anything. */
export const openGame = async (opts: OpenOptions = {}): Promise<Game> => {
  const b = await openBrowser()
  const device = opts.device ?? 'desktop'
  const touch = device !== 'desktop'
  const viewport = VIEWPORTS[device]
  const context = await b.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
    locale: 'en-US',
    ...(touch ? { userAgent: PHONE_UA } : {})
  })
  const page = await context.newPage()
  await page.addInitScript(NO_POINTER_LOCK)
  // A new player who has been through the training ground lands in the Bastion.
  const save = opts.save ?? (opts.brandNew ? undefined : NEW_AFTER_TRAINING)
  if (save) {
    await page.addInitScript((save) => {
      // Only on the first load: a reload must find what the GAME wrote.
      if (!localStorage.getItem('cmachine_state')) localStorage.setItem('cmachine_state', JSON.stringify(save))
    }, save)
  }
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`uncaught: ${String(e).slice(0, 300)}`))
  await page.goto(BASE_URL() + (opts.query ?? ''), { waitUntil: 'load', timeout: 120_000 })
  return { page, context, errors, viewport, close: () => context.close() }
}

// ─── Reading the game ────────────────────────────────────────────────────────

/* The dev build's handle. Typed loosely: the specs read it, they do not own it. */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { __game: any }
}

/** Wait until the boot loader has left and the first scene is up. */
export const waitBooted = async (g: Game): Promise<void> => {
  await g.page.waitForFunction(() => window.__game?.flow && !window.__game.flow.curtain && window.__game.flow.screen !== 'boot', null, { timeout: 120_000 })
}

/** Wait until the player has control of the mech (skipping the drop-in). */
export const waitPlaying = async (g: Game, skipIntro = true): Promise<void> => {
  await waitBooted(g)
  if (skipIntro) {
    // Any press skips a scripted shot, once it has had a moment to register.
    await g.page.waitForTimeout(700)
    await g.page.keyboard.press('Space')
  }
  await g.page.waitForFunction(() => window.__game.hud.phase === 'play', null, { timeout: 60_000 })
  await g.page.waitForTimeout(300)
}

export interface Snapshot {
  screen: string
  phase: string
  modal: string
  level: number
  alert: number
  chaos: boolean
  weapon: string
  scrap: number
  cores: number
  missions: number
  upgrades: Record<string, number>
  blueprints: Record<string, number>
  tiers: Record<string, number>
  storageKeys: string[]
}

export const snapshot = (g: Game): Promise<Snapshot> => g.page.evaluate(() => {
  const { flow, hud, profile } = window.__game
  return {
    screen: flow.screen, phase: hud.phase, modal: flow.modal, level: flow.level,
    alert: hud.alert, chaos: hud.chaos, weapon: hud.weapon,
    scrap: profile.scrap, cores: profile.cores, missions: profile.missions,
    upgrades: { ...profile.arsenal.upgrades }, blueprints: { ...profile.arsenal.blueprints }, tiers: { ...profile.arsenal.tiers },
    storageKeys: Object.keys(localStorage).sort()
  }
})

/** Put the mech on the ground at a world position, looking along `yaw`. */
export const teleport = (g: Game, x: number, z: number, yaw = 0, pitch = -0.1): Promise<void> =>
  g.page.evaluate(([px, pz, y, p]) => {
    const m = window.__game.app.mode
    const pl = m.player
    const grid = m.fortress.grid
    const h = grid.h[Math.floor(pz! / 2) * grid.w + Math.floor(px! / 2)]
    pl.x = pl.px = px; pl.z = pl.pz = pz; pl.y = pl.py = h; pl.mode = 'ground'
    pl.yaw = pl.pyaw = y; m.cam.yaw = y; m.cam.pitch = p
  }, [x, z, yaw, pitch])

/** Point the camera at a defender's head from where the mech stands. */
export const aimAtHead = (g: Game, id: number): Promise<number> =>
  g.page.evaluate((unit) => {
    const m = window.__game.app.mode
    const u = m.garrison.units[unit]
    const p = m.player
    const eye = p.y + 2.25 + (1.4 - 2.25) * p.crouch
    const dx = u.x - p.x
    const dz = u.z - p.z
    m.cam.yaw = Math.atan2(dx, dz)
    m.cam.pitch = Math.atan2(u.y + 1.54 - eye, Math.hypot(dx, dz))
    return Math.hypot(dx, dz)
  }, id)

/** The id of the first living defender of a kind, or −1. */
export const firstUnit = (g: Game, kind: string, state?: string): Promise<number> =>
  g.page.evaluate(([k, s]) => {
    const u = window.__game.app.mode.garrison.units.find((x: any) => x.kind === k && x.state !== 'dead' && x.state !== 'reserve' && (!s || x.state === s))
    return u ? u.id : -1
  }, [kind, state ?? ''] as const)

/** Boxes of the given controls, and every pair that overlaps. */
export const layout = (g: Game, selectors: Record<string, string>, allowed: Array<[string, string]> = []): Promise<{ count: number; overlaps: string[]; offscreen: string[]; small: string[] }> =>
  g.page.evaluate(([sels, ok]) => {
    const items: Array<{ name: string; l: number; t: number; r: number; b: number }> = []
    for (const [name, sel] of Object.entries(sels)) {
      [...document.querySelectorAll(sel)].forEach((e, i) => {
        const r = e.getBoundingClientRect()
        const st = getComputedStyle(e)
        if (r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none') {
          items.push({ name: name + (i || ''), l: r.left, t: r.top, r: r.right, b: r.bottom })
        }
      })
    }
    const base = (n: string): string => n.replace(/\d+$/, '')
    const overlaps: string[] = []
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!
        const b = items[j]!
        if (ok.some(([x, y]) => (base(a.name) === x && base(b.name) === y) || (base(a.name) === y && base(b.name) === x))) continue
        if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) overlaps.push(`${a.name} × ${b.name}`)
      }
    }
    const offscreen = items.filter(a => a.l < -0.5 || a.t < -0.5 || a.r > innerWidth + 0.5 || a.b > innerHeight + 0.5).map(a => a.name)
    const small = items.filter(a => /^(chip|button|level)/.test(a.name) && (a.r - a.l < 39.5 || a.b - a.t < 39.5)).map(a => a.name)
    return { count: items.length, overlaps, offscreen, small }
  }, [selectors, allowed] as const)

/** A returning player's save: two levels cleared, things to spend, a build in the Forge. */
/** A new player who has only been through the training ground. */
export const NEW_AFTER_TRAINING: Record<string, unknown> = { cm_v: 1, cm_seen: ['training'] }

export const RETURNING_SAVE = (language = 'en'): Record<string, unknown> => ({
  cm_v: 1, cm_cleared: 2, cm_medals: 4, cm_missions: 7, cm_scrap: 1234, cm_cores: 6,
  cm_arsenal: {
    blueprints: { sniper: 3, minigun: 2, rocket: 0 }, tiers: { sniper: 2, minigun: 1, rocket: 1 },
    upgrades: { sniperZoom: 2, armor: 5, decoy: 1 }, unlocks: []
  },
  cm_fortresses: {
    'bastion-1': { clears: 4, medals: { ghost: true, marksman: true, swift: true }, bestScore: 6120, bestTime: 141 },
    'bastion-2': { clears: 1, medals: { ghost: false, marksman: true, swift: false }, bestScore: 3980, bestTime: 233 }
  },
  cm_forge: null,
  cm_lessons: { touch: {}, desk: {} },
  cm_seen: ['intro'],
  cm_stats: { kills: 40, headshots: 22, stealthKills: 30, bladeKills: 6, alerts: 2, deaths: 1, playSeconds: 1500 },
  cm_user_language: language,
  cm_user_language_chosen: true
})
