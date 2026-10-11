// @vitest-environment jsdom
// The mech's paint schemes (#M3–#M6): CM-07's lilac is everyone's and draws
// the mech exactly as before; the rest unlock for good with a rewarded video
// (where one can play) or scrap, or a video lends one for the next mission;
// five paint videos in a rolling day; the player's own mech wears it
// everywhere it is theirs, the story keeps CM-07's colours.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Color, type BufferGeometry, type Mesh, type Object3D } from 'three'

const video = vi.hoisted(() => ({ canPlay: true, finishes: true, build: true }))
vi.mock('@/use/useAdGate', () => ({
  canOfferVideo: () => video.canPlay,
  get hasVideoOffers () { return video.build },
  claimReward: async (grant: () => void) => { if (video.finishes) grant(); return video.finishes }
}))

const load = async () => {
  vi.resetModules()
  const offers = await import('@/use/useRewardedOffers')
  const paint = await import('@/game/state/paint')
  const ids = await import('@/game/models/paintIds')
  const { profile, defaultProfile } = await import('@/game/state/profile')
  Object.assign(profile, defaultProfile())
  offers.__resetOffers()
  paint.__resetPaintTrial()
  return { ...offers, ...paint, ...ids, profile }
}

beforeEach(() => { video.canPlay = true; video.finishes = true; video.build = true })

/** Every number in the rig's geometry, hashed: two rigs drawn the same give the same print. */
const print = (root: Object3D, only?: string): string => {
  let h = 0
  let n = 0
  root.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined
    if (!g) return
    for (const name of Object.keys(g.attributes).sort()) {
      if (only && name !== only) continue
      const a = g.attributes[name]!.array as ArrayLike<number>
      for (let i = 0; i < a.length; i++) { h = (Math.imul(h, 31) + Math.round(a[i]! * 1e4)) | 0; n++ }
    }
  })
  return `${h} ${n}`
}

describe('the schemes and the model (#M3)', () => {
  it('6 to 8 schemes, CM-07\'s lilac the free one, a scrap price', async () => {
    const { PAINT_IDS, FREE_PAINT, PAINT_SCRAP } = await import('@/game/models/paintIds')
    expect(PAINT_IDS.length).toBeGreaterThanOrEqual(6)
    expect(PAINT_IDS.length).toBeLessThanOrEqual(8)
    expect(FREE_PAINT).toBe('lilac')
    expect(PAINT_SCRAP).toBeGreaterThan(0)
  })

  it('the default draws today\'s mech exactly: every vertex, every colour, as before the schemes', async () => {
    const { buildMech } = await import('@/game/models/mech')
    // Taken from `buildMech()` before it had a scheme to take.
    const BEFORE = '1829776307 239292'
    expect(print(buildMech().root)).toBe(BEFORE)
    expect(print(buildMech('lilac').root)).toBe(BEFORE)
  })

  it('every scheme is the same mech, only painted: the shape the same, its colours its own, the outline on', async () => {
    const { buildMech } = await import('@/game/models/mech')
    const { PAINT_IDS, PAINTS } = await import('@/game/models/paintIds')
    const shape = print(buildMech().root, 'position')
    const lilac = print(buildMech().root, 'color')
    const colours = new Set<string>()
    for (const id of PAINT_IDS) {
      const rig = buildMech(id)
      expect(print(rig.root, 'position'), id).toBe(shape)
      if (id !== 'lilac') expect(print(rig.root, 'color'), id).not.toBe(lilac)
      // The armour is the scheme's body colour.
      const c = rig.mesh.geometry.attributes.color!
      const hexes = new Set<number>()
      for (let i = 0; i < c.count; i++) hexes.add(new Color(c.getX(i), c.getY(i), c.getZ(i)).getHex())
      expect(hexes.has(new Color(PAINTS[id].body).getHex()), id).toBe(true)
      expect(rig.outline, id).not.toBeNull()
      colours.add(PAINTS[id].body)
    }
    // No two schemes share a body colour: each reads as its own.
    expect(colours.size).toBe(PAINT_IDS.length)
  })

  it('every scheme reads at dusk: the armour light enough to tell from the outline, the suit darker than the armour', async () => {
    const { PAINT_IDS, PAINTS } = await import('@/game/models/paintIds')
    const lum = (hex: string): number => { const c = new Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b }
    for (const id of PAINT_IDS) {
      const p = PAINTS[id]
      expect(lum(p.body), id).toBeGreaterThan(0.08)
      expect(lum(p.trim), id).toBeLessThan(lum(p.body))
      expect(lum(p.bodyHi), id).toBeGreaterThanOrEqual(lum(p.body))
      expect(lum(p.bodyDeep), id).toBeLessThan(lum(p.body))
    }
  })

  // Every place a mech is built, pinned: the player's own wear the player's
  // paint, the story's CM-07 his own. A new call has to be added here, so no
  // instance is missed.
  it('every buildMech in the game: the player\'s mech in the player\'s paint, the story in CM-07\'s', () => {
    const calls: string[] = []
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|vue)$/.test(f)) {
          const src = readFileSync(p, 'utf8')
          for (const m of src.matchAll(/buildMech\(((?:[^()]|\(\))*)\)/g)) {
            if (src.slice(Math.max(0, m.index! - 13), m.index!).includes('export const')) continue
            calls.push(`${p.replace(/\\/g, '/').replace(/^.*?src\//, '')}: ${m[1]}`)
          }
        }
      }
    }
    walk(join(__dirname, '../../src'))
    expect(calls.sort()).toEqual([
      'game/art/mechPortrait.ts: scheme',
      'game/art/paintThumbs.ts: scheme',
      'game/fx/combatFx.ts: this.paint',
      'game/scenes/commandBase.ts: b.shownPaint',
      'game/scenes/commandBase.ts: id',
      'game/scenes/modelBench.ts: paint',
      'game/scenes/modelBench.ts: paint',
      'game/sim/mission.ts: missionPaint()',
      'game/sim/mission.ts: missionPaint()',
      'game/sim/trainingDirector.ts: missionPaint()',
      'game/sim/trainingDirector.ts: missionPaint()',
      'game/story/cinema.ts: FREE_PAINT'
    ])
    // The mission's combat effects (the decoy's hologram) in the player's paint, the story's in CM-07's.
    expect(readFileSync(join(__dirname, '../../src/game/sim/mission.ts'), 'utf8')).toContain('new CombatFx(missionPaint())')
    expect(readFileSync(join(__dirname, '../../src/game/story/cinema.ts'), 'utf8')).toContain('new CombatFx(FREE_PAINT)')
  })
})

describe('owning, wearing, lending (#M4, #M6)', () => {
  it('a new mech wears CM-07\'s lilac and owns only that', async () => {
    const m = await load()
    expect(m.profile.paint).toEqual({ owned: ['lilac'], equipped: 'lilac', videos: [], trial: null })
    expect(m.missionPaint()).toBe('lilac')
  })

  it('scrap unlocks one for good and puts it on; not twice, not without the scrap', async () => {
    const m = await load()
    expect(m.unlockPaint('crimson')).toBe(false)
    m.profile.scrap = m.PAINT_SCRAP + 7
    expect(m.unlockPaint('crimson')).toBe(true)
    expect(m.profile.scrap).toBe(7)
    expect(m.profile.paint.equipped).toBe('crimson')
    expect(m.unlockPaint('crimson')).toBe(false)
    expect(m.missionPaint()).toBe('crimson')
  })

  it('one tap puts an owned scheme on; a locked one cannot be', async () => {
    const m = await load()
    expect(m.equipPaint('arctic')).toBe(false)
    m.unlockPaint('arctic', true)
    expect(m.equipPaint('lilac')).toBe(true)
    expect(m.equipPaint('arctic')).toBe(true)
    expect(m.profile.paint.equipped).toBe('arctic')
  })

  it('a finished video unlocks one for good, without scrap; a skipped or failed one grants nothing and counts nothing', async () => {
    const m = await load()
    video.finishes = false
    expect(await m.watchFor('paint', () => { m.unlockPaint('gilded', true) })).toBe(false)
    expect(m.ownsPaint('gilded')).toBe(false)
    expect(m.paintVideosLeft()).toBe(m.PAINT_VIDEOS_PER_DAY)
    video.finishes = true
    expect(await m.watchFor('paint', () => { m.unlockPaint('gilded', true) })).toBe(true)
    expect(m.ownsPaint('gilded')).toBe(true)
    expect(m.profile.scrap).toBe(0)
    expect(m.paintVideosLeft()).toBe(m.PAINT_VIDEOS_PER_DAY - 1)
  })

  it('no video can play (not ready, or a portal without videos): no offer at all, scrap only, never a free grant', async () => {
    const m = await load()
    video.canPlay = false
    expect(m.canOffer('paint')).toBe(false)
    expect(m.offerSpent('paint')).toBe(false)
    expect(await m.watchFor('paint', () => { m.unlockPaint('jungle', true) })).toBe(false)
    expect(m.ownsPaint('jungle')).toBe(false)
    m.profile.scrap = m.PAINT_SCRAP
    expect(m.unlockPaint('jungle')).toBe(true)
  })

  it('five paint videos in any 24 hours, unlocks and trials together; spent, a time it comes back; then it does', async () => {
    const m = await load()
    expect(m.PAINT_VIDEOS_PER_DAY).toBe(5)
    const t0 = Date.now()
    const ids = ['crimson', 'arctic', 'jungle', 'gilded'] as const
    for (const id of ids) expect(await m.watchFor('paint', () => { m.unlockPaint(id, true) })).toBe(true)
    expect(await m.watchFor('paint', () => { m.lendPaint('midnight') })).toBe(true)
    expect(m.canOffer('paint')).toBe(false)
    expect(m.offerSpent('paint')).toBe(true)
    expect(await m.watchFor('paint', () => { m.unlockPaint('tangerine', true) })).toBe(false)
    expect(m.ownsPaint('tangerine')).toBe(false)
    const back = m.paintVideoBackAt()
    expect(back).toBeGreaterThanOrEqual(t0 + m.PAINT_VIDEO_WINDOW_MS)
    expect(back).toBeLessThan(t0 + m.PAINT_VIDEO_WINDOW_MS + 5000)
    // Watched a minute apart: a day after the first, that one is back, and the next a minute later.
    m.profile.paint.videos = [0, 1, 2, 3, 4].map(k => t0 + k * 60_000)
    const first = m.paintVideoBackAt(t0 + 5 * 60_000)
    expect(first).toBe(t0 + m.PAINT_VIDEO_WINDOW_MS)
    expect(m.paintVideosLeft(first + 1)).toBe(1)
    expect(m.paintVideoBackAt(first + 1)).toBe(0)
    expect(m.paintVideosLeft(first + 60_001)).toBe(2)
  })

  it('a video lends a locked scheme for the next mission only: worn on it (retries too), gone after; one view, one lend', async () => {
    const m = await load()
    expect(await m.watchFor('paint', () => { m.lendPaint('midnight') })).toBe(true)
    expect(m.profile.paint.trial).toBe('midnight')
    // In the base it is not on yet.
    expect(m.missionPaint()).toBe('lilac')
    m.startPaintTrial()
    expect(m.profile.paint.trial).toBeNull()
    expect(m.missionPaint()).toBe('midnight')
    // A retry of the same mission starts again: still lent (and not taken twice).
    m.startPaintTrial()
    expect(m.missionPaint()).toBe('midnight')
    // The mission is banked: the next one is back in the player's own.
    m.profile.missions++
    expect(m.missionPaint()).toBe('lilac')
    m.startPaintTrial()
    expect(m.missionPaint()).toBe('lilac')
  })

  it('back in the base, the lend is over even without a banked mission (a retreat)', async () => {
    const m = await load()
    m.lendPaint('tangerine')
    m.startPaintTrial()
    expect(m.missionPaint()).toBe('tangerine')
    m.endPaintTrial()
    expect(m.missionPaint()).toBe('lilac')
  })

  it('an owned scheme cannot be lent', async () => {
    const m = await load()
    expect(m.lendPaint('lilac')).toBe(false)
    expect(m.profile.paint.trial).toBeNull()
  })

  it('the placement is on the list', async () => {
    const m = await load()
    expect(m.REWARDED_PLACEMENTS).toContain('paint')
  })
})

describe('the save field (#M4)', () => {
  type ProfileModule = typeof import('@/game/state/profile')
  const fresh = async (): Promise<{ P: ProfileModule; S: typeof import('@/use/useGameState') }> => {
    const { drainAndResetModules, holdGameState } = await import('../stubs/drainPersist')
    drainAndResetModules()
    const S = await holdGameState()
    const P = await import('@/game/state/profile')
    return { P, S }
  }

  it('a save from before the schemes (v1) loads wearing CM-07\'s, owning only that', async () => {
    localStorage.setItem('cmachine_state', JSON.stringify({ cm_v: 1, cm_scrap: 50, cm_missions: 3 }))
    const { P, S } = await fresh()
    S.reloadGameState()
    P.loadProfile()
    expect(P.profile.paint).toEqual({ owned: ['lilac'], equipped: 'lilac', videos: [], trial: null })
    P.saveProfile()
    S.flushPersist()
    const blob = JSON.parse(localStorage.getItem('cmachine_state')!)
    expect(blob.cm_v).toBe(2)
    expect(blob.cm_paint.equipped).toBe('lilac')
  })

  it('a broken field loads into a sound one: unknown schemes dropped, the free one kept, an unowned one not worn', async () => {
    localStorage.setItem('cmachine_state', JSON.stringify({
      cm_v: 2, cm_paint: { owned: ['arctic', 'neon', 7], equipped: 'gilded', videos: [1, 'x', null], trial: 'arctic' }
    }))
    const { P, S } = await fresh()
    S.reloadGameState()
    P.loadProfile()
    expect(P.profile.paint.owned).toEqual(['lilac', 'arctic'])
    expect(P.profile.paint.equipped).toBe('lilac')
    expect(P.profile.paint.videos).toEqual([1])
    // A lend of a scheme already owned is no lend.
    expect(P.profile.paint.trial).toBeNull()
  })
})

describe('the paint panel (#M5)', () => {
  const mountPanel = async () => {
    const { mount } = await import('@vue/test-utils')
    const { createI18n } = await import('vue-i18n')
    const en = (await import('@/i18n/locales/en')).default
    const m = await load()
    const PaintPanel = (await import('@/components/base/PaintPanel.vue')).default
    const w = mount(PaintPanel, { global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
    return { w, m }
  }

  it('a tile per scheme; the locked ones carry the film mark and the scrap price', async () => {
    const { w, m } = await mountPanel()
    for (const id of m.PAINT_IDS) expect(w.find(`[data-testid="paint-${id}"]`).exists(), id).toBe(true)
    const locked = w.find('[data-testid="paint-crimson"]')
    expect(locked.find('.film').exists()).toBe(true)
    expect(locked.text()).toContain(String(m.PAINT_SCRAP))
    expect(w.find('[data-testid="paint-lilac"]').text()).not.toContain(String(m.PAINT_SCRAP))
    w.unmount()
  })

  it('one tap on an owned scheme puts it on; a tap on a locked one shows its prices, a video and scrap, and the lend', async () => {
    const { w, m } = await mountPanel()
    m.unlockPaint('arctic', true)
    m.equipPaint('lilac')
    await w.find('[data-testid="paint-arctic"]').trigger('click')
    expect(m.profile.paint.equipped).toBe('arctic')
    await w.find('[data-testid="paint-gilded"]').trigger('click')
    expect(m.profile.paint.equipped).toBe('arctic')
    expect(w.find('[data-testid="paint-video"]').exists()).toBe(true)
    expect(w.find('[data-testid="paint-buy"]').exists()).toBe(true)
    expect(w.find('[data-testid="paint-try"]').exists()).toBe(true)
    // Not enough scrap: the scrap button is there, disabled.
    expect(w.find('[data-testid="paint-buy"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('no video ready: the film button is there, disabled, and says so', async () => {
    video.canPlay = false
    const { w } = await mountPanel()
    await w.find('[data-testid="paint-gilded"]').trigger('click')
    expect(w.find('[data-testid="paint-video"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="paint-try"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="paint-wait"]').text()).toBe('No video right now')
    w.unmount()
  })

  it('the day\'s videos spent: disabled, with the time they come back', async () => {
    const { w, m } = await mountPanel()
    m.profile.paint.videos = [1, 2, 3, 4, 5].map(k => Date.now() - k * 1000)
    m.__resetOffers()
    await w.find('[data-testid="paint-gilded"]').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('[data-testid="paint-video"]').attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="paint-wait"]').text()).toMatch(/^Back in 23:59:\d\d$/)
    w.unmount()
  })

  it('a portal without rewarded videos: scrap only, no film mark anywhere', async () => {
    video.build = false
    video.canPlay = false
    const { w } = await mountPanel()
    await w.find('[data-testid="paint-gilded"]').trigger('click')
    expect(w.find('[data-testid="paint-video"]').exists()).toBe(false)
    expect(w.find('[data-testid="paint-try"]').exists()).toBe(false)
    expect(w.find('[data-testid="paint-buy"]').exists()).toBe(true)
    expect(w.find('.film').exists()).toBe(false)
    w.unmount()
  })
})

describe('the disguises wear the paint too', () => {
  it('every disguise, in every scheme, is coloured only in that scheme\'s colours', async () => {
    const { DISGUISE_IDS, buildDisguise, disposeDisguise } = await import('@/game/models/disguises')
    const { PAINT_IDS, PAINTS } = await import('@/game/models/paintIds')
    for (const scheme of PAINT_IDS) {
      const own = new Set(Object.values(PAINTS[scheme]).map(h => new Color(h).getHex()))
      for (const id of DISGUISE_IDS) {
        const g = buildDisguise(id, scheme)
        for (const p of g.children as Mesh[]) {
          const c = p.geometry.attributes.color!
          expect(own.has(new Color(c.getX(0), c.getY(0), c.getZ(0)).getHex()), `${id} in ${scheme}`).toBe(true)
        }
        disposeDisguise(g)
      }
    }
  })

  it('a crimson toaster is not a lilac one; the default is CM-07\'s, as before', async () => {
    const { buildDisguise, disposeDisguise } = await import('@/game/models/disguises')
    const a = buildDisguise('toaster')
    const b = buildDisguise('toaster', 'lilac')
    const c = buildDisguise('toaster', 'crimson')
    expect(print(a, 'color')).toBe(print(b, 'color'))
    expect(print(c, 'color')).not.toBe(print(a, 'color'))
    expect(print(c, 'position')).toBe(print(a, 'position'))
    // The next build without a scheme is CM-07's again (the scheme is only lent to one build).
    expect(print(buildDisguise('toaster'), 'color')).toBe(print(a, 'color'))
    for (const g of [a, b, c]) disposeDisguise(g)
  })

  it('the mission\'s disguise, the base\'s preview, its shelf and the shop\'s pictures are built in the player\'s paint', () => {
    const src = (f: string): string => readFileSync(join(__dirname, '../../src', f), 'utf8')
    expect(src('game/sim/mission.ts')).toContain('buildDisguise(profile.cosmetics.worn, missionPaint())')
    expect(src('game/scenes/commandBase.ts')).toContain('buildDisguise(this.disguise, this.shownPaint)')
    expect(src('game/scenes/commandBase.ts')).toContain('shelfContents(owned, profile.paint.equipped)')
    expect(src('components/base/DisguisePanel.vue')).toContain('disguiseThumb(id, profile.paint.equipped)')
  })
})
