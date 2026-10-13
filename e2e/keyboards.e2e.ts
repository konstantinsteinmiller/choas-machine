/* eslint-disable @typescript-eslint/no-explicit-any -- the specs read the dev handle loosely, as the harness does */
import { mkdirSync } from 'node:fs'
import type { CDPSession } from 'playwright-core'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { BASE_URL, closeBrowser, openGame, waitBooted, type Game } from './harness'

/**
 * Every keyboard, through the whole training ground: what the screen says to
 * press is what the player's keyboard has printed on the key, and pressing it
 * does the thing.
 *
 * A body's billboard once said E while the burn lesson taught X; both burnt
 * it, so nothing failed but the player's trust. Per room, every key cap on
 * screen (lesson cards, action buttons, weapon slots, the billboards at a
 * guard's back, at a body and at a salvage pile) is read and checked three ways:
 *  1. its letter is what THIS keyboard prints on that physical key;
 *  2. pressing the key that prints that letter raises the action it is for;
 *  3. it is the key of the action its button or billboard is for.
 * At the body, the billboard's key is pressed and the body must catch fire.
 *
 * A keyboard is emulated by the browser's language, a stand-in
 * `navigator.keyboard` layout map (absent = Firefox / Safari, where the game
 * guesses from the language and learns from typing), and real key events
 * with the layout's `code` and `key`.
 *
 *   pnpm test:e2e keyboards                      all ten
 *   E2E_KEYBOARDS=fr-FR,en-Dvorak pnpm test:e2e keyboards
 *   E2E_SHOTS=<dir>                              keep a screenshot per room
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const QWERTY: Record<string, string> = { ...Object.fromEntries(LETTERS.map(l => [`Key${l}`, l.toLowerCase()])), Semicolon: ';', Comma: ',', Period: '.' }
const QWERTZ = { ...QWERTY, KeyY: 'z', KeyZ: 'y', Semicolon: 'ö' }
const AZERTY = { ...QWERTY, KeyQ: 'a', KeyW: 'z', KeyA: 'q', KeyZ: 'w', KeyM: ',', Semicolon: 'm' }
const DVORAK: Record<string, string> = {
  KeyQ: "'", KeyW: ',', KeyE: '.', KeyR: 'p', KeyT: 'y', KeyY: 'f', KeyU: 'g', KeyI: 'c', KeyO: 'r', KeyP: 'l',
  KeyA: 'a', KeyS: 'o', KeyD: 'e', KeyF: 'u', KeyG: 'i', KeyH: 'd', KeyJ: 'h', KeyK: 't', KeyL: 'n', Semicolon: 's',
  KeyZ: ';', KeyX: 'q', KeyC: 'j', KeyV: 'k', KeyB: 'x', KeyN: 'b', KeyM: 'm', Comma: 'w', Period: 'v'
}

interface Keyboard { locale: string; map: Record<string, string>; layoutApi: boolean }
/** What each physical key prints, the browser's language, and whether it offers the layout map (Chromium yes, Firefox / Safari no). */
const KEYBOARDS: Record<string, Keyboard> = {
  'en-US': { locale: 'en-US', map: QWERTY, layoutApi: true },
  'es-ES': { locale: 'es-ES', map: { ...QWERTY, Semicolon: 'ñ' }, layoutApi: true },
  'pt-PT': { locale: 'pt-PT', map: { ...QWERTY, Semicolon: 'ç' }, layoutApi: true },
  'pt-BR': { locale: 'pt-BR', map: { ...QWERTY, Semicolon: 'ç' }, layoutApi: true },
  'de-DE': { locale: 'de-DE', map: QWERTZ, layoutApi: true },
  'fr-FR': { locale: 'fr-FR', map: AZERTY, layoutApi: true },
  'en-Dvorak': { locale: 'en-US', map: DVORAK, layoutApi: true },
  'es-ES-firefox': { locale: 'es-ES', map: { ...QWERTY, Semicolon: 'ñ' }, layoutApi: false },
  'fr-FR-firefox': { locale: 'fr-FR', map: AZERTY, layoutApi: false },
  'de-DE-firefox': { locale: 'de-DE', map: QWERTZ, layoutApi: false }
}
const PICKED = process.env.E2E_KEYBOARDS?.split(',').map(s => s.trim()).filter(Boolean)
const RUN = Object.keys(KEYBOARDS).filter(k => !PICKED || PICKED.includes(k))

/** Keys drawn as a sign, the same on every layout. */
const NAMED: Record<string, string> = { ShiftLeft: '⇧', ShiftRight: '⇧', Space: '␣', Tab: '⇥ Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
/** A letter a Latin key cap can show (a Cyrillic layout's keys are named by their Latin letter). */
const SHOWABLE = (ch: string): boolean => !/^\p{L}$/u.test(ch) || /^\p{Script=Latin}$/u.test(ch)

/** What the input flags must show after a key for each action. */
interface Raised {
  act: boolean; crouch: boolean; hide: boolean; grapple: boolean; jump: boolean; rope: boolean; burn: boolean; drag: boolean
  decoy: boolean; reload: boolean; weapon: number; cycle: boolean; moveX: number; moveY: number; sprint: boolean
}
const RAISES: Record<string, (r: Raised) => boolean> = {
  forward: r => r.moveY > 0, back: r => r.moveY < 0, left: r => r.moveX < 0, right: r => r.moveX > 0, sprint: r => r.sprint,
  crouch: r => r.crouch, hide: r => r.hide, act: r => r.act, grapple: r => r.grapple, jump: r => r.jump, rope: r => r.rope,
  burn: r => r.burn, drag: r => r.drag, decoy: r => r.decoy, reload: r => r.reload, cycle: r => r.cycle,
  weapon1: r => r.weapon === 1, weapon2: r => r.weapon === 2, weapon3: r => r.weapon === 3
}
/** Pressed twice: once to check, once to undo what would change the room (a body picked up by the drag key was carried into the next room). */
const TOGGLES = ['crouch', 'hide', 'drag']

interface Cap { code: string; action: string; text: string; owner: string; where: string }

const VK = (code: string): number => code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5)
  : ({ Space: 32, Tab: 9, ShiftLeft: 16, ShiftRight: 16, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 } as Record<string, number>)[code] ?? 0

/** In the page, before the game: this keyboard's layout map, or none. */
const FAKE_KEYBOARD = ({ map, api }: { map: Record<string, string>; api: boolean }): void => {
  const fake = api ? { getLayoutMap: async () => new Map(Object.entries(map)), lock: async () => {}, unlock: () => {} } : undefined
  Object.defineProperty(Navigator.prototype, 'keyboard', { configurable: true, get: () => fake })
}

let game: Game | null = null
afterEach(async () => {
  await game?.close()
  game = null
})
afterAll(closeBrowser)

const playTraining = async (name: string): Promise<{ problems: string[]; checked: number; pressed: number; burnt: boolean }> => {
  const kb = KEYBOARDS[name]!
  const g = game = await openGame({ brandNew: true, locale: kb.locale, init: { script: FAKE_KEYBOARD, arg: { map: kb.map, api: kb.layoutApi } } })
  const { page } = g
  const shots = process.env.E2E_SHOTS ? `${process.env.E2E_SHOTS}/${name}` : ''
  if (shots) mkdirSync(shots, { recursive: true })
  const cdp: CDPSession = await g.context.newCDPSession(page)
  const keyDown = (code: string, key: string): Promise<unknown> => cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', code, key, windowsVirtualKeyCode: VK(code), ...(key.length === 1 && key !== ' ' ? { text: key } : {})
  })
  const keyUp = (code: string, key: string): Promise<unknown> => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: VK(code) })
  const tap = async (code: string, key: string): Promise<void> => { await keyDown(code, key); await keyUp(code, key) }

  /** What the key with `code` must be labelled on this keyboard. */
  const expected = (code: string): string => {
    if (code.startsWith('Digit')) return code.slice(5)
    if (NAMED[code]) return NAMED[code]!
    const ch = kb.map[code]
    if (ch && SHOWABLE(ch)) return ch.toUpperCase()
    return code.startsWith('Key') ? code.slice(3) : code
  }
  /** The physical key a player presses to type the printed `label`. */
  const keyForLabel = (label: string): { code: string; key: string } | null => {
    for (const [code, sign] of Object.entries(NAMED)) {
      if (sign === label) return { code, key: code === 'Space' ? ' ' : code.startsWith('Shift') ? 'Shift' : code }
    }
    if (/^\d$/.test(label)) return { code: `Digit${label}`, key: label }
    const hit = Object.entries(kb.map).find(([, ch]) => ch.toUpperCase() === label)
    return hit ? { code: hit[0], key: hit[1] } : null
  }

  await waitBooted(g)
  await page.waitForTimeout(800)
  await tap('Space', ' ')
  await page.waitForFunction(() => window.__game.hud.phase === 'play', null, { timeout: 60_000 })
  await page.waitForTimeout(500)
  // A player walks off first: the one typed key a browser without the layout map learns from.
  await keyDown('KeyW', kb.map.KeyW!)
  await page.waitForTimeout(300)
  await keyUp('KeyW', kb.map.KeyW!)

  // After the game's own listener (registered at boot): what the last key raised.
  await page.evaluate(() => {
    const inp = window.__game.input
    window.__raised = null
    window.addEventListener('keydown', () => {
      window.__raised = {
        act: !!inp.actQueued, crouch: !!inp.crouchQueued, hide: !!inp.hideQueued, grapple: !!inp.grappleQueued, jump: !!inp.jumpQueued,
        rope: !!inp.ropeQueued, burn: !!inp.burnQueued, drag: !!inp.dragQueued, decoy: !!inp.decoyQueued || !!inp.decoyHeld,
        reload: !!inp.reloadQueued, weapon: inp.weaponQueued || 0, cycle: !!inp.cycleQueued, moveX: inp.moveX, moveY: inp.moveY, sprint: !!inp.sprintHeld
      }
    })
  })

  // The game's own tables: which action each billboard and each button is for, and the rooms.
  // Sent as text: vitest rewrites an `import()` inside a function it compiles, and the page has no such helper.
  const src = BASE_URL() + 'src/'
  const { table, rooms } = await page.evaluate<{
    table: { prompts: Record<string, string>; buttons: Record<string, string> }
    rooms: Array<{ lesson: string; x0: number; x1: number; z0: number; z1: number; door: { cz0: number; cz1: number } | null }>
  }>(`(async () => {
    const t = await import('${src}components/hud/touchLook.ts')
    const f = await import('${src}game/data/fortresses/training.ts')
    const prompts = {}
    for (const k of Object.keys(t.PROMPT_BUTTON)) prompts[k] = t.promptAction(k)
    return {
      table: { prompts, buttons: { ...t.BUTTON_ACTION } },
      rooms: f.TRAINING_ROOMS.map(r => ({ lesson: r.lesson, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, door: r.door ?? null }))
    }
  })()`)
  expect(rooms.length, 'the training ground has its rooms').toBeGreaterThan(10)

  /** Every key cap on screen now. */
  const caps = (): Promise<Cap[]> => page.evaluate(() => {
    const seen = (el: Element): boolean => {
      if (!el.getClientRects().length) return false
      for (let e: Element | null = el; e; e = e.parentElement) {
        const st = getComputedStyle(e)
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false
      }
      return true
    }
    return [...document.querySelectorAll('[data-code]')].filter(seen).map((e) => {
      const chip = e.closest('.world-prompt .chip')
      const btn = e.closest('[data-testid^="btn-"]')
      return {
        code: e.getAttribute('data-code') ?? '',
        action: e.getAttribute('data-action') ?? '',
        text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
        owner: chip ? 'prompt:' + ([...chip.classList].find(c => c.startsWith('k-')) ?? '').slice(2) : btn ? 'btn:' + btn.getAttribute('data-testid')!.slice(4) : '',
        where: e.closest('.world-prompt') ? 'billboard' : e.closest('.control-hints, .hint-glyph') ? 'card' : e.closest('.f-hud-button, .weapon-slot, .weapons') ? 'button' : 'other'
      }
    })
  })

  const problems: string[] = []
  let checked = 0
  let pressed = 0
  const check = async (label: string, press = true): Promise<void> => {
    const list = await caps()
    if (shots) await page.screenshot({ path: `${shots}/${label}.png` })
    const uniq = new Map(list.map(c => [`${c.code}|${c.action}|${c.text}|${c.where}|${c.owner}`, c]))
    for (const c of uniq.values()) {
      checked++
      // A cap with the wheel's picture reads "/ ⇥ Tab"; the weapon button calls Tab by its word alone.
      let text = c.text.replace(/^\/\s*/, '')
      if (c.code === 'Tab' && text === 'Tab') text = '⇥ Tab'
      const want = expected(c.code)
      if (text !== want) problems.push(`${label}: the ${c.where} cap for ${c.action || c.code} reads "${text}", this keyboard prints "${want}" on ${c.code}`)
      const [kind, id] = (c.owner || ':').split(':') as [string, string]
      const own = kind === 'prompt' ? table.prompts[id] : kind === 'btn' ? table.buttons[id] : undefined
      if (own && c.action !== own) problems.push(`${label}: ${c.owner} shows the ${c.action} key "${text}", but it is for ${own}`)
      if (!press || !c.action || !RAISES[c.action]) continue
      // Press what the player reads.
      const k = keyForLabel(text)
      if (!k) {
        problems.push(`${label}: no key on this keyboard prints "${text}" (${c.action})`)
        continue
      }
      await page.evaluate(() => { window.__raised = null })
      await keyDown(k.code, k.key)
      const r = await page.evaluate(() => window.__raised as Raised | null)
      await keyUp(k.code, k.key)
      pressed++
      if (!r || !RAISES[c.action]!(r)) problems.push(`${label}: pressing "${text}" (${k.code}) did not ${c.action}: raised ${JSON.stringify(r)}`)
      if (TOGGLES.includes(c.action)) await tap(k.code, k.key)
      await page.waitForTimeout(120)
    }
  }

  /** Put the mech on the ground, facing along `yaw` (+x by default). */
  const teleport = (x: number, z: number, yaw = Math.PI / 2): Promise<void> => page.evaluate(([px, pz, y]) => {
    const m = window.__game.app.mode
    const pl = m.player
    const grid = m.fortress.grid
    pl.x = pl.px = px; pl.z = pl.pz = pz; pl.y = pl.py = grid.h[Math.floor(pz! / 2) * grid.w + Math.floor(px! / 2)]
    pl.mode = 'ground'; pl.vy = 0
    pl.yaw = pl.pyaw = y; m.cam.yaw = y; m.cam.pitch = -0.15
  }, [x, z, yaw])

  /**
   * A room's lesson clip holds the mech until a key is pressed (#158): skip
   * it, as a player would, before reading the room. Waiting on it left the
   * mech frozen at the body with nothing on offer.
   */
  const skipLesson = async (): Promise<void> => {
    for (let k = 0; k < 6; k++) {
      if (!(await page.evaluate(() => window.__game.app.mode.cine?.kind === 'lesson'))) return
      await tap('Space', ' ')
      await page.waitForTimeout(400)
    }
  }

  let burnt = false
  await check('00-start')
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]!
    const prev = rooms[i - 1]
    const tag = `${String(i + 1).padStart(2, '0')}-${r.lesson}`
    if (prev) await teleport((r.x0 + 0.6) * 2, (prev.door ? (prev.door.cz0 + prev.door.cz1) / 2 + 0.5 : (r.z0 + r.z1) / 2 + 0.5) * 2)
    // The room's lesson card slides in a moment after the mech walks in.
    await page.waitForTimeout(3800)
    await skipLesson()
    await check(tag)

    if (['blade', 'burn', 'decoy'].includes(r.lesson)) {
      // Inside this room, both ways: rooms sit side by side, and a body in the next one is no use here.
      const u = await page.evaluate(([x0, x1, z0, z1]) => window.__game.app.mode.garrison.units
        .filter((u: any) => Math.floor(u.x / 2) >= x0! && Math.floor(u.x / 2) <= x1! && Math.floor(u.z / 2) >= z0! && Math.floor(u.z / 2) <= z1!)
        .map((u: any) => ({ x: u.x as number, z: u.z as number, yaw: (u.yaw ?? 0) as number, dead: u.state === 'dead' })), [r.x0, r.x1, r.z0, r.z1])
      expect(u.length, `a guard (or a body) in the ${r.lesson} room`).toBeGreaterThan(0)
      // The burn room's lesson is the body; the others' a living guard.
      const t = (r.lesson === 'burn' ? u.find(x => x.dead) : u.find(x => !x.dead)) ?? u[0]!
      if (r.lesson !== 'burn') {
        // Right behind it, facing its back: the takedown billboard.
        const bx = t.x - Math.sin(t.yaw) * 1.6
        const bz = t.z - Math.cos(t.yaw) * 1.6
        await teleport(bx, bz, Math.atan2(t.x - bx, t.z - bz))
        await page.waitForTimeout(900)
        await skipLesson()
        await check(`${tag}-behind-guard`)
      } else {
        // At the body: the billboard is read but not pressed by the sweep (E would burn it too)...
        await teleport(t.x - 1.4, t.z)
        await skipLesson()
        // The billboard fades in; a software renderer can take a few seconds.
        // (Faded in, as the cap reader sees it: Playwright calls a chip at opacity 0 visible.)
        for (let k = 0; k < 40 && !(await caps()).some(c => c.owner === 'prompt:burn'); k++) await page.waitForTimeout(250)
        await page.waitForTimeout(400)
        await check(`${tag}-at-body`, false)
        // ...then the key it shows must set the body alight (a wrong letter is already a problem above).
        const cap = (await caps()).find(c => c.owner === 'prompt:burn')
        const k = cap && keyForLabel(cap.text.replace(/^\/\s*/, ''))
        if (!cap || !k) {
          // What kept the offer away, for the report.
          const why = await page.evaluate(() => {
            const m = window.__game.app.mode
            const dead = m.garrison.units.filter((u: any) => u.state === 'dead').map((u: any) => ({ id: u.id, x: +u.x.toFixed(1), z: +u.z.toFixed(1), hidden: u.hidden, y: +u.y.toFixed(2), deadT: +u.deadT.toFixed(1), hold: u.hold, after: m.afterburns.some((f: any) => f.id === u.id), kind: u.kind }))
            return JSON.stringify({ cine: m.cine?.kind ?? null, cineT: m.cine?.t, phase: window.__game.hud.phase, looting: !!m.looting, sabotaging: !!m.sabotaging, grapple: !!m.grapple, drag: m.dragId, fuel: m.fuelLeft, strike: !!m.strike, mode: m.player.mode, offer: m.burnOffer, burning: !!m.burning, me: [+m.player.x.toFixed(1), +m.player.y.toFixed(2), +m.player.z.toFixed(1)], dead })
          })
          problems.push(`${tag}-at-body: ${cap ? `no key prints "${cap.text}"` : 'no burn billboard at the body'} ${why}`)
        }
        else {
          await keyDown(k.code, k.key)
          await page.waitForTimeout(400)
          burnt = await page.evaluate(() => !!window.__game.app.mode.burning)
          await page.waitForTimeout(1200)
          await keyUp(k.code, k.key)
          await page.waitForTimeout(1500)
        }
      }
    }
    if (r.lesson === 'salvage') {
      const p = await page.evaluate((x0) => {
        const pile = window.__game.app.mode.piles.find((p: any) => Math.floor(p.x / 2) >= x0 && Math.floor(p.x / 2) <= x0 + 14)
        return pile ? { x: pile.x as number, z: pile.z as number } : null
      }, r.x0)
      expect(p, 'a salvage pile in its room').toBeTruthy()
      await teleport(p!.x - 1.3, p!.z)
      await page.waitForTimeout(900)
      await skipLesson()
      await check(`${tag}-at-pile`)
    }
  }
  expect(g.errors).toEqual([])
  return { problems, checked, pressed, burnt }
}

describe('every keyboard: the keys on screen are the keys that work', () => {
  for (const name of RUN) {
    it(name, async () => {
      const res = await playTraining(name)
      expect(res.problems).toEqual([])
      // Each room's cards, the buttons and the billboards: a sweep that read nothing proves nothing.
      expect(res.checked).toBeGreaterThan(150)
      expect(res.pressed).toBeGreaterThan(100)
      expect(res.burnt, "the burn billboard's key sets the body alight").toBe(true)
    }, 600_000)
  }
})

declare global {
  interface Window { __raised: unknown }
}
