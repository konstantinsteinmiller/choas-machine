import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { FIRST_LEVEL_COST } from '../src/game/data/upgrades'
import {
  RETURNING_SAVE, aimAtHead, closeBrowser, firstUnit, layout, openGame, snapshot, teleport, waitBooted, waitPlaying,
  type Game
} from './harness'

/**
 * The game, end to end, in a real browser: what a player meets from the first
 * frame to a reload of their save.
 */

let game: Game | null = null
const open = async (...args: Parameters<typeof openGame>): Promise<Game> => {
  game = await openGame(...args)
  return game
}
afterEach(async () => {
  await game?.close()
  game = null
})
afterAll(closeBrowser)

const HUD = {
  alert: '.alert-meter',
  chip: '.top-right .f-hud-button, .actions .f-hud-button',
  armor: '.armor-bar',
  ammo: '.ammo-strip',
  stick: '.joy-home',
  hint: '.control-hints .card, .control-hints .spot'
}
/** A finger drawn on the stick, or on the look half, is meant to be there. */
const HUD_ALLOWED: Array<[string, string]> = [['hint', 'stick']]

describe('first launch', () => {
  it('opens straight in the fortress: no menu, a drop-in that any press skips, then control', async () => {
    const g = await open()
    await waitBooted(g)
    expect(await g.page.title()).toBe('Chaos Machine')
    let s = await snapshot(g)
    expect(s.screen).toBe('mission')
    expect(s.phase).toBe('intro')
    // No HUD during the drop-in; letterbox bars and the skip glyph instead.
    expect(await g.page.locator('.mission-hud').count()).toBe(0)
    expect(await g.page.locator('.cine-bars').count()).toBe(1)
    await g.page.waitForTimeout(700)
    await g.page.keyboard.press('Space')
    await g.page.waitForFunction(() => window.__game.hud.phase === 'play', null, { timeout: 30_000 })
    s = await snapshot(g)
    expect(s.level).toBe(1)
    expect(s.alert).toBe(0)
    expect(await g.page.locator('.mission-hud').count()).toBe(1)
    expect(g.errors).toEqual([])
  })

  it('teaches the two thumbs first, without a word, and nothing overlaps on a small phone', async () => {
    for (const device of ['phone-portrait', 'phone-landscape'] as const) {
      const g = await open({ device })
      await waitPlaying(g)
      const hints = await g.page.evaluate(() => window.__game.hud.hints.map((h: { id: string }) => h.id))
      expect(hints, device).toEqual(['move', 'look'])
      // The lessons are glyphs: no text node inside them.
      expect((await g.page.locator('.control-hints').innerText()).trim(), device).toBe('')
      const l = await layout(g, HUD, HUD_ALLOWED)
      expect(l.count, device).toBeGreaterThanOrEqual(8)
      expect(l.overlaps, device).toEqual([])
      expect(l.offscreen, device).toEqual([])
      expect(l.small, device).toEqual([])
      expect(g.errors, device).toEqual([])
      await g.close()
      game = null
    }
  })

  it('the stick moves the mech and a drag turns the camera (touch)', async () => {
    const g = await open({ device: 'phone-landscape' })
    await waitPlaying(g)
    const before = await g.page.evaluate(() => { const m = window.__game.app.mode; return { x: m.player.x, z: m.player.z, yaw: m.cam.yaw } })
    const cdp = await g.context.newCDPSession(g.page)
    const touch = (type: string, points: Array<[number, number, number]>) =>
      cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) })
    const { width, height } = g.viewport
    const jx = Math.round(width * 0.2)
    const jy = Math.round(height * 0.75)
    const rx = Math.round(width * 0.7)
    const ry = Math.round(height * 0.45)
    await touch('touchStart', [[jx, jy, 1]])
    await touch('touchMove', [[jx, jy - 55, 1]])
    await g.page.waitForTimeout(500)
    await touch('touchStart', [[jx, jy - 55, 1], [rx, ry, 2]])
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[jx, jy - 55, 1], [rx + i * 25, ry, 2]]); await g.page.waitForTimeout(60) }
    await touch('touchEnd', [])
    await g.page.waitForTimeout(300)
    const after = await g.page.evaluate(() => { const m = window.__game.app.mode; return { x: m.player.x, z: m.player.z, yaw: m.cam.yaw } })
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.8)
    expect(Math.abs(after.yaw - before.yaw)).toBeGreaterThan(0.1)
    expect(g.errors).toEqual([])
  })
})

describe('the mission', () => {
  it('a scoped headshot from the perch is silent: one kill, no alert', async () => {
    const g = await open({ query: '?level=2' })
    await waitPlaying(g)
    await g.page.mouse.click(640, 360)
    // Crouched, the scope is steady.
    await g.page.keyboard.press('KeyC')
    await g.page.waitForTimeout(450)
    const sentry = await firstUnit(g, 'sentry')
    expect(sentry).toBeGreaterThanOrEqual(0)
    await g.page.mouse.down({ button: 'right' })
    await g.page.waitForTimeout(700)
    expect(await g.page.evaluate(() => window.__game.hud.scoped)).toBe(true)
    await aimAtHead(g, sentry)
    await g.page.waitForTimeout(80)
    await aimAtHead(g, sentry)
    await g.page.mouse.down({ button: 'left' })
    await g.page.waitForTimeout(60)
    await g.page.mouse.up({ button: 'left' })
    await g.page.mouse.up({ button: 'right' })
    // The first headshot of a mission gets the kill-cam: wait it out.
    await g.page.waitForFunction(() => window.__game.app.mode.stats.kills === 1 && !window.__game.hud.cine, null, { timeout: 20_000 })
    const stats = await g.page.evaluate(() => ({ ...window.__game.app.mode.stats }))
    expect(stats.headshots).toBe(1)
    expect(stats.spotted).toBe(0)
    const s = await snapshot(g)
    expect(s.alert).toBe(0)
    expect(s.chaos).toBe(false)
    expect(g.errors).toEqual([])
  })

  it('the blade takes a guard from behind; the minigun brings the whole base', async () => {
    const g = await open()
    await waitPlaying(g)
    await g.page.mouse.click(640, 360)
    // A lone patrol: one of a chatting pair has its partner looking at its back.
    const guard = await g.page.evaluate(() => window.__game.app.mode.garrison.units.find((x: any) => x.kind === 'guard' && x.state === 'patrol' && x.partner < 0).id)
    const at = await g.page.evaluate((id) => { const u = window.__game.app.mode.garrison.units[id]; return { x: u.x, z: u.z, yaw: u.yaw } }, guard)
    await teleport(g, at.x - Math.sin(at.yaw) * 1.6, at.z - Math.cos(at.yaw) * 1.6, at.yaw, -0.2)
    await g.page.waitForFunction(() => window.__game.hud.strike === 'backstab', null, { timeout: 5000 })
    await g.page.keyboard.press('KeyE')
    await g.page.waitForFunction(() => window.__game.app.mode.stats.bladeKills === 1, null, { timeout: 5000 })
    await g.page.waitForFunction(() => !window.__game.hud.cine, null, { timeout: 10_000 })
    // Loud.
    await g.page.keyboard.press('Digit2')
    await g.page.waitForTimeout(500)
    expect((await snapshot(g)).weapon).toBe('minigun')
    await g.page.mouse.down({ button: 'left' })
    await g.page.waitForFunction(() => window.__game.hud.chaos, null, { timeout: 8000 })
    await g.page.mouse.up({ button: 'left' })
    const s = await snapshot(g)
    expect(s.alert).toBe(5)
    expect(await g.page.evaluate(() => window.__game.app.mode.stats.shots)).toBeGreaterThan(0)
    expect(g.errors).toEqual([])
  })

  it('a mech that stands in the fire goes down, and the defeat screen puts it back on the perch', async () => {
    const g = await open({ query: '?level=2' })
    await waitPlaying(g)
    await teleport(g, 53, 76, Math.PI)
    await g.page.mouse.click(640, 360)
    await g.page.keyboard.press('Digit2')
    await g.page.waitForTimeout(500)
    await g.page.mouse.down({ button: 'left' })
    await g.page.waitForFunction(() => window.__game.hud.chaos, null, { timeout: 8000 })
    await g.page.mouse.up({ button: 'left' })
    await g.page.waitForFunction(() => window.__game.flow.modal === 'defeat', null, { timeout: 120_000 })
    const down = await snapshot(g)
    expect(down.phase).toBe('dead')
    // A defeat is not for nothing, and it does not count as a mission.
    expect(down.scrap).toBeGreaterThan(0)
    expect(down.missions).toBe(0)
    await g.page.click('[data-testid="btn-retry"]', { force: true })
    await g.page.waitForFunction(() => window.__game.flow.screen === 'mission' && window.__game.hud.phase === 'intro' && !window.__game.flow.loading, null, { timeout: 60_000 })
    const again = await snapshot(g)
    expect(again.modal).toBe('')
    expect(again.alert).toBe(0)
    expect(g.errors).toEqual([])
  })
})

describe('the loop, and the save', () => {
  it('win → tally → base → upgrade → smithy → reload: everything comes back from one key', async () => {
    const g = await open()
    await waitPlaying(g)
    // The Commander (for the bonus), then the salvage the raid needs, pile by
    // pile with the real key, then the pad.
    await g.page.evaluate(() => { const m = window.__game.app.mode; m.kill(m.garrison.units.find((u: any) => u.kind === 'commander').id) })
    await g.page.waitForFunction(() => !window.__game.hud.cine, null, { timeout: 20_000 })
    const need = await g.page.evaluate(() => window.__game.hud.salvageNeed)
    expect(need).toBe(3)
    for (let k = 0; k < need; k++) {
      const pile = await g.page.evaluate(() => {
        const m = window.__game.app.mode
        const p = m.piles.filter((q: any) => !q.taken).sort((a: any, b: any) => a.y - b.y)[0]
        return { x: p.x, y: p.y, z: p.z }
      })
      await teleport(g, pile.x + 0.6, pile.z)
      await g.page.waitForFunction(() => window.__game.hud.loot, null, { timeout: 5_000 })
      await g.page.keyboard.press('KeyE')
      await g.page.waitForFunction((n: number) => window.__game.hud.salvageGot === n, k + 1, { timeout: 5_000 })
    }
    await g.page.waitForFunction(() => window.__game.hud.objective === 'extract', null, { timeout: 5_000 })
    const pad = await g.page.evaluate(() => { const e = window.__game.app.mode.fortress.extract; return { x: e.x, z: e.z } })
    await teleport(g, pad.x + 0.4, pad.z + 0.4)
    await g.page.waitForFunction(() => window.__game.flow.modal === 'rewards', null, { timeout: 30_000 })
    const won = await snapshot(g)
    expect(won.phase).toBe('done')
    expect(won.missions).toBe(1)
    expect(won.scrap).toBeGreaterThan(0)
    // The rewards screen: three medals, a rank, and the way on.
    expect(await g.page.locator('[data-testid="rewards"] .medal').count()).toBe(3)
    await g.page.waitForSelector('[data-testid="rewards"] .rank-badge', { timeout: 15_000 })

    await g.page.click('[data-testid="btn-to-base"]', { force: true })
    await g.page.waitForFunction(() => window.__game.flow.screen === 'base' && !window.__game.flow.loading && !window.__game.flow.curtain, null, { timeout: 60_000 })
    await g.page.waitForTimeout(600)
    expect(await g.page.locator('[data-testid="wallet-scrap"]').innerText()).toMatch(/\d/)

    // Buy the first sniper upgrade.
    await g.page.click('[data-testid="btn-armory"]', { force: true })
    await g.page.waitForSelector('[data-testid="buy-sniperZoom"]')
    await g.page.waitForTimeout(400)
    await g.page.click('[data-testid="buy-sniperZoom"]', { force: true })
    await g.page.waitForFunction(() => window.__game.profile.forge?.track === 'sniperZoom')
    const bought = await snapshot(g)
    expect(bought.scrap).toBe(won.scrap - FIRST_LEVEL_COST)
    expect(bought.upgrades.sniperZoom ?? 0).toBe(0)

    // It is made in the smithy: the furnace, the anvil, the quench, with the
    // real keys. The waits between are cut short with Data Cores.
    await g.page.evaluate(() => { window.__game.profile.cores += 2 })
    const station = async (name: string): Promise<void> => {
      await g.page.waitForSelector('[data-testid="smith-start"]', { timeout: 20_000 })
      await g.page.click('[data-testid="smith-start"]', { force: true })
      await g.page.waitForSelector(`[data-testid="smith-${name}"]`)
    }
    const skipWait = async (): Promise<void> => {
      await g.page.waitForSelector('[data-testid="forge-skip"]', { timeout: 20_000 })
      await g.page.click('[data-testid="forge-skip"]', { force: true })
    }
    await station('furnace')
    for (let i = 0; i < 16 && await g.page.locator('[data-testid="smith-furnace"]').count(); i++) {
      await g.page.keyboard.down('Space'); await g.page.waitForTimeout(260); await g.page.keyboard.up('Space'); await g.page.waitForTimeout(320)
    }
    await skipWait()
    await station('anvil')
    for (let i = 0; i < 4; i++) { await g.page.waitForTimeout(i === 0 ? 1050 : 950); await g.page.keyboard.press('Space') }
    await skipWait()
    await station('quench')
    await g.page.waitForTimeout(1200)
    await g.page.keyboard.press('Space')
    await g.page.waitForSelector('[data-testid="smith-result"]', { timeout: 10_000 })
    await g.page.click('[data-testid="smith-collect"]', { force: true })
    const made = await snapshot(g)
    expect(made.upgrades.sniperZoom).toBe(1)
    expect(made.forge).toBeNull()
    expect(made.scrap).toBeGreaterThanOrEqual(bought.scrap)

    // Give the smithy what a weapon tier needs (a later save would have it), and start one.
    await g.page.evaluate(() => { const p = window.__game.profile; p.scrap += 500; p.arsenal.blueprints.sniper = 3 })
    await g.page.waitForSelector('[data-testid="forge-build-sniper"]')
    await g.page.click('[data-testid="forge-build-sniper"]', { force: true })
    await g.page.waitForFunction(() => window.__game.profile.forge?.weapon === 'sniper')
    const before = await snapshot(g)
    expect(before.forge).toMatchObject({ weapon: 'sniper', tier: 2, step: 'furnace' })
    expect(before.storageKeys.filter(k => k.startsWith('cm'))).toEqual(['cmachine_state'])

    // The save is written with a short debounce: give it that, then reload.
    await g.page.waitForTimeout(1200)
    await g.page.reload({ waitUntil: 'load' })
    await waitBooted(g)
    const after = await snapshot(g)
    // A returning player opens in the base, with everything they had.
    expect(after.screen).toBe('base')
    expect(after.missions).toBe(1)
    expect(after.scrap).toBe(before.scrap)
    expect(after.cores).toBe(before.cores)
    expect(after.upgrades).toEqual(before.upgrades)
    expect(after.blueprints).toEqual(before.blueprints)
    expect(after.forge).toMatchObject({ weapon: 'sniper', tier: 2, step: 'furnace' })
    expect(after.level).toBe(2)
    expect(g.errors).toEqual([])

    // And the next mission plays at the new level, with the upgrade fitted.
    await g.page.click('[data-testid="btn-deploy"]', { force: true })
    await g.page.waitForFunction(() => window.__game.flow.screen === 'mission' && !window.__game.flow.loading, null, { timeout: 60_000 })
    const fitted = await g.page.evaluate(() => { const m = window.__game.app.mode; return { level: m.level, fov: m.loadout.scopeFov } })
    expect(fitted.level).toBe(2)
    expect(fitted.fov).toBeLessThan(17)
    expect(g.errors).toEqual([])
  })

  it('a returning player\'s base lays out without overlaps on every screen, in a long language', async () => {
    for (const device of ['phone-portrait', 'phone-landscape', 'desktop'] as const) {
      const g = await open({ device, save: RETURNING_SAVE('de') })
      await waitBooted(g)
      await g.page.waitForTimeout(600)
      expect((await snapshot(g)).screen, device).toBe('base')
      expect(await g.page.evaluate(() => document.documentElement.lang), device).toBe('de')
      const l = await layout(g, {
        logo: '.base-hud .logo',
        pill: '.base-hud > .purse .pill',
        button: '.stations .f-button, .go',
        level: '.level',
        chip: '.system-corner .f-hud-button',
        badge: '.base-hud .rank-badge'
      })
      expect(l.count, device).toBeGreaterThanOrEqual(13)
      expect(l.overlaps, device).toEqual([])
      expect(l.offscreen, device).toEqual([])
      expect(l.small, device).toEqual([])
      // Levels: two cleared, the third open, the rest locked.
      expect(await g.page.locator('.level.locked').count(), device).toBe(2)
      // The workshop's header never covers its content.
      await g.page.click('[data-testid="btn-chassis"]', { force: true })
      await g.page.waitForSelector('[data-testid="workshop"] .row')
      // Measured at rest, not half-way through the dialog's entrance.
      await g.page.waitForTimeout(500)
      const header = await g.page.locator('[data-testid="workshop"] .f-modal__header').boundingBox()
      const content = await g.page.locator('[data-testid="workshop"] .f-modal__content').boundingBox()
      expect(content!.y, device).toBeGreaterThanOrEqual(header!.y + header!.height - 1)
      expect(await g.page.locator('[data-testid="workshop"] .max').count(), device).toBe(1)
      expect(g.errors, device).toEqual([])
      await g.close()
      game = null
    }
  })
})
