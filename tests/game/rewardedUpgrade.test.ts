// @vitest-environment jsdom
// A weapon upgrade in the Armory can be paid with a rewarded video instead of
// its Tech Scrap: the level only once the video played to the end, once per
// visit to the Command Base, and never past the top level.

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

  it('once per visit to the Command Base; the next visit offers it again', async () => {
    const m = await load()
    await m.watchFor('upgrade', () => { m.buyTrack('minigunDamage', true) })
    expect(m.canOffer('upgrade')).toBe(false)
    m.profile.missions++
    expect(m.canOffer('upgrade')).toBe(true)
  })

  it('never offered where no video can play, and never past the top level', async () => {
    const m = await load()
    video.canPlay = false
    expect(m.canOffer('upgrade')).toBe(false)
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
