// @vitest-environment jsdom
// A weapon upgrade (an Armory track, or a Forge tier's scrap) can be paid with
// a rewarded video instead of its Tech Scrap: the level only once the video
// played to the end, three per visit to the Command Base (#182), never past the
// top level. Spent, the button stays, disabled, and says it needs time to refresh.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const video = vi.hoisted(() => ({ canPlay: true, finishes: true }))
vi.mock('@/use/useAdGate', () => ({
  canOfferVideo: () => video.canPlay,
  claimReward: async (grant: () => void) => { if (video.finishes) grant(); return video.finishes }
}))

const load = async () => {
  vi.resetModules()
  const offers = await import('@/use/useRewardedOffers')
  const progress = await import('@/game/state/progress')
  const { profile, defaultProfile } = await import('@/game/state/profile')
  const { TRACK_MAX } = await import('@/game/data/upgrades')
  Object.assign(profile, defaultProfile())
  offers.__resetOffers()
  return { ...offers, ...progress, profile, TRACK_MAX }
}

beforeEach(() => { video.canPlay = true; video.finishes = true })

describe('a weapon upgrade for a video', () => {
  it('a finished video buys the next level without scrap', async () => {
    const m = await load()
    m.profile.scrap = 0
    expect(m.canBuyTrack('sniperDamage')).toBe(false)
    expect(m.canOffer('upgrade')).toBe(true)
    expect(await m.watchFor('upgrade', () => { m.buyTrack('sniperDamage', true) })).toBe(true)
    expect(m.trackLevel('sniperDamage')).toBe(1)
    expect(m.profile.scrap).toBe(0)
  })

  it('a video not watched to the end buys nothing', async () => {
    const m = await load()
    video.finishes = false
    expect(await m.watchFor('upgrade', () => { m.buyTrack('sniperDamage', true) })).toBe(false)
    expect(m.trackLevel('sniperDamage')).toBe(0)
  })

  it('three per visit to the Command Base, the Armory and the Forge together; then spent until a mission is done', async () => {
    const m = await load()
    expect(m.UPGRADE_VIDEOS_PER_VISIT).toBe(3)
    await m.watchFor('upgrade', () => { m.buyTrack('minigunDamage', true) })
    await m.watchFor('upgrade', () => { m.buyTrack('rocketBlast', true) })
    expect(m.offerSpent('upgrade')).toBe(false)
    m.profile.arsenal.blueprints.sniper = 99
    expect(await m.watchFor('upgrade', () => { m.buildTier('sniper', true) })).toBe(true)
    expect(m.canOffer('upgrade')).toBe(false)
    expect(m.offerSpent('upgrade')).toBe(true)
    expect(await m.watchFor('upgrade', () => { m.buyTrack('sniperZoom', true) })).toBe(false)
    expect(m.trackLevel('sniperZoom')).toBe(0)
    m.profile.missions++
    expect(m.canOffer('upgrade')).toBe(true)
    expect(m.offerSpent('upgrade')).toBe(false)
  })

  it('a Forge tier for a video: the blueprints are still due, the scrap is not', async () => {
    const m = await load()
    m.profile.scrap = 0
    expect(m.canForgeByVideo('minigun')).toBe(false)
    m.profile.arsenal.blueprints.minigun = 50
    const before = m.profile.arsenal.blueprints.minigun
    const tier = m.profile.arsenal.tiers.minigun
    expect(m.canForge('minigun')).toBe(false)
    expect(m.buildTier('minigun', true)).toBe(true)
    expect(m.profile.arsenal.tiers.minigun).toBe(tier + 1)
    expect(m.profile.arsenal.blueprints.minigun).toBeLessThan(before)
    expect(m.profile.scrap).toBe(0)
  })

  it('never offered where no video can play, and never past the top level', async () => {
    const m = await load()
    video.canPlay = false
    expect(m.canOffer('upgrade')).toBe(false)
    expect(m.offerSpent('upgrade')).toBe(false)
    m.profile.arsenal.upgrades.rocketBlast = m.TRACK_MAX
    expect(m.buyTrack('rocketBlast', true)).toBe(false)
  })
})

describe('the Armory shows it with the film mark', () => {
  it('a video button beside each weapon upgrade\'s scrap price, none on the chassis', async () => {
    const { mount } = await import('@vue/test-utils')
    const { createI18n } = await import('vue-i18n')
    const en = (await import('@/i18n/locales/en')).default
    await load()
    const UpgradeList = (await import('@/components/base/UpgradeList.vue')).default
    const { TRACK_IDS, TRACKS } = await import('@/game/data/upgrades')
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    for (const station of ['armory', 'chassis'] as const) {
      const w = mount(UpgradeList, { props: { station }, global: { plugins: [i18n] } })
      for (const id of TRACK_IDS.filter(t => TRACKS[t].station === station)) {
        const v = w.find(`[data-testid="video-${id}"]`)
        expect(v.exists(), `${station} ${id}`).toBe(station === 'armory')
        if (v.exists()) {
          expect(v.html()).toContain('video')
          expect(v.attributes('aria-label')).toContain('Watch a video')
        }
        expect(w.find(`[data-testid="buy-${id}"]`).exists()).toBe(true)
      }
      w.unmount()
    }
  })
})

describe('a spent video button says why (#182)', () => {
  const mountButton = async (spent: boolean) => {
    const { mount } = await import('@vue/test-utils')
    const { createI18n } = await import('vue-i18n')
    const en = (await import('@/i18n/locales/en')).default
    const VideoOfferButton = (await import('@/components/atoms/VideoOfferButton.vue')).default
    return mount(VideoOfferButton, {
      props: { label: 'Watch a video to upgrade X', testid: 'v', spent },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
    })
  }
  const pointer = (type: string, pointerType: string) => {
    const e = new Event(type, { bubbles: true })
    Object.defineProperty(e, 'pointerType', { value: pointerType })
    return e
  }

  it('live: the film mark, enabled, no note', async () => {
    const w = await mountButton(false)
    expect(w.find('[data-testid="v"]').html()).toContain('video')
    expect(w.find('[data-testid="v"]').attributes('disabled')).toBeUndefined()
    w.element.dispatchEvent(pointer('pointerenter', 'mouse'))
    await w.vm.$nextTick()
    expect(w.find('[data-testid="video-refresh-tip"]').exists()).toBe(false)
  })

  it('spent: disabled; the note on hover, and for four seconds after a tap on touch', async () => {
    vi.useFakeTimers()
    try {
      const w = await mountButton(true)
      expect(w.find('[data-testid="v"]').attributes('disabled')).toBeDefined()
      w.element.dispatchEvent(pointer('pointerenter', 'mouse'))
      await w.vm.$nextTick()
      expect(w.find('[data-testid="video-refresh-tip"]').text()).toBe('Needs time to refresh, do some missions')
      w.element.dispatchEvent(pointer('pointerleave', 'mouse'))
      await w.vm.$nextTick()
      expect(w.find('[data-testid="video-refresh-tip"]').exists()).toBe(false)
      w.element.dispatchEvent(pointer('pointerdown', 'touch'))
      await w.vm.$nextTick()
      expect(w.find('[data-testid="video-refresh-tip"]').exists()).toBe(true)
      vi.advanceTimersByTime(3900)
      await w.vm.$nextTick()
      expect(w.find('[data-testid="video-refresh-tip"]').exists()).toBe(true)
      vi.advanceTimersByTime(200)
      await w.vm.$nextTick()
      expect(w.find('[data-testid="video-refresh-tip"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
