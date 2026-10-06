// @vitest-environment jsdom
// ─── The big moment banners ─────────────────────────────────────────────────
//
// Round 5 (#150), copied from Mega Droid: "LEVEL CLEARED" in blue as the robo
// dog lifts the mech out, "WASTED" in red as the mech goes down. The sim raises one with `showBanner` and moves on after
// `BANNER_HOLD`; the card renders `banner.kind`, replays whenever `seq` moves,
// is gone once it has played out, and its words fit one line (the fit itself
// is pinned in `bannerFit.test.ts`; here, that the card is wired to it).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import ar from '@/i18n/locales/ar'
import tr from '@/i18n/locales/tr'
import { LANGUAGES } from '@/utils/enums'
import {
  BANNER_HOLD, banner, bannerSeconds, clearBanner, showBanner, type BannerKind
} from '@/game/state/banner'
import { isAdShowing } from '@/use/useGamePause'
import BigBanner from '@/components/hud/BigBanner.vue'

const card = (locale = 'en') => mount(BigBanner, {
  global: { plugins: [createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { en, ar, tr } })] }
})

/** The band's own fade-out ending, as the browser reports it (scoped
 *  keyframes carry a suffix). */
const endOf = (el: Element, name: string) => {
  const e = new Event('animationend', { bubbles: true })
  Object.defineProperty(e, 'animationName', { value: name })
  el.dispatchEvent(e)
}

enableAutoUnmount(afterEach)
beforeEach(() => clearBanner())
afterEach(() => {
  clearBanner()
  isAdShowing.value = false
  vi.restoreAllMocks()
})

describe('what the card shows', () => {
  it('nothing while no banner is up, but the live region is always there', () => {
    const w = card()
    expect(w.find('.bn-band').exists()).toBe(false)
    const root = w.get('.big-banner')
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
  })

  const cases: [BannerKind, string, string][] = [
    ['cleared', 'Level cleared', 'tone-blue'],
    ['wasted', 'Wasted', 'tone-red']
  ]
  for (const [kind, text, tone] of cases) {
    it(`${kind}: "${text}" in ${tone.slice(5)}`, async () => {
      const w = card()
      showBanner(kind)
      await nextTick()
      const band = w.get('.bn-band')
      expect(band.classes()).toContain(tone)
      expect(band.classes()).toContain(`kind-${kind}`)
      expect(w.get('.bn-text').text()).toBe(text)
    })
  }

  it('the measuring copy is hidden from assistive tech', async () => {
    const w = card()
    showBanner('wasted')
    await nextTick()
    expect(w.get('.bn-measure').attributes('aria-hidden')).toBe('true')
    expect(w.get('.bn-strip').attributes('aria-hidden')).toBe('true')
  })
})

describe('when it plays', () => {
  it('replays from the start when the same banner is raised again', async () => {
    const w = card()
    showBanner('wasted')
    await nextTick()
    const first = w.get('.bn-band').element
    showBanner('wasted')
    await nextTick()
    const second = w.get('.bn-band').element
    expect(second).not.toBe(first)
    expect(w.element.contains(second)).toBe(true)
    expect(w.element.contains(first)).toBe(false)
  })

  it('a new kind replaces the one on screen', async () => {
    const w = card()
    showBanner('wasted')
    await nextTick()
    showBanner('cleared')
    await nextTick()
    expect(w.findAll('.bn-band')).toHaveLength(1)
    expect(w.get('.bn-text').text()).toBe('Level cleared')
  })

  it('is gone once its fade-out has run, even with the kind still set', async () => {
    const w = card()
    showBanner('wasted')
    await nextTick()
    // A child's animation ending (the text's entrance) is not the end.
    endOf(w.get('.bn-text').element, 'bn-text-in-data-v-1')
    await nextTick()
    expect(w.find('.bn-band').exists()).toBe(true)
    endOf(w.get('.bn-band').element, 'bn-band-out-data-v-1')
    await nextTick()
    expect(banner.kind).toBe('wasted')
    expect(w.find('.bn-band').exists()).toBe(false)
    // …and the next one still plays.
    showBanner('wasted')
    await nextTick()
    expect(w.find('.bn-band').exists()).toBe(true)
  })

  it('clearBanner takes it down at once', async () => {
    const w = card()
    showBanner('cleared')
    await nextTick()
    clearBanner()
    await nextTick()
    expect(w.find('.bn-band').exists()).toBe(false)
  })

  it('a banner raised before the view mounted never shows', async () => {
    showBanner('wasted')
    const w = card()
    await nextTick()
    expect(w.find('.bn-band').exists()).toBe(false)
  })

  it('the animation fits inside the sim\'s hold, for every kind', async () => {
    const w = card()
    for (const kind of Object.keys(BANNER_HOLD) as BannerKind[]) {
      expect(bannerSeconds(kind)).toBeLessThan(BANNER_HOLD[kind])
      showBanner(kind)
      await nextTick()
      expect((w.get('.bn-band').element as HTMLElement).style.getPropertyValue('--bn-dur')).toBe(`${bannerSeconds(kind)}s`)
    }
  })

  it('pauses with the game (an ad, a modal): the sim\'s clock stops too', async () => {
    const w = card()
    showBanner('wasted')
    await nextTick()
    expect(w.get('.bn-band').classes()).not.toContain('paused')
    isAdShowing.value = true
    await nextTick()
    expect(w.get('.bn-band').classes()).toContain('paused')
  })
})

describe('language', () => {
  it('carries the language, so CSS uppercasing follows its rules (Turkish i → İ)', async () => {
    const w = card('tr')
    showBanner('cleared')
    await nextTick()
    const text = w.get('.bn-text')
    expect(text.attributes('lang')).toBe('tr')
    expect(text.attributes('dir')).toBe('ltr')
    expect(text.text()).toBe(tr.banner.cleared)
    expect(w.get('.bn-band').classes()).not.toContain('caseless')
  })

  it('Arabic runs right to left and is set as a script without capitals', async () => {
    const w = card('ar')
    showBanner('wasted')
    await nextTick()
    const text = w.get('.bn-text')
    expect(text.attributes('lang')).toBe('ar')
    expect(text.attributes('dir')).toBe('rtl')
    expect(text.text()).toBe(ar.banner.wasted)
    expect(w.get('.bn-band').classes()).toContain('caseless')
  })

  it('both banners exist, translated, in every shipped locale', async () => {
    for (const code of LANGUAGES) {
      const { default: msgs } = await import(`../../src/i18n/locales/${code}.ts`)
      for (const kind of ['cleared', 'wasted'] as const) {
        const s = msgs.banner?.[kind]
        expect(typeof s, `${code}: banner.${kind}`).toBe('string')
        expect(s.trim().length, `${code}: banner.${kind}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('the size is fitted to the screen', () => {
  const setViewport = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h })
  }
  const saved = { w: window.innerWidth, h: window.innerHeight }
  afterEach(() => setViewport(saved.w, saved.h))

  /** The words measure `width` px at the reference size (jsdom has no layout). */
  const measuresAt = (width: number) => {
    const real = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('bn-measure')) return real.call(this)
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 100, width, height: 100, toJSON: () => ({}) } as DOMRect
    })
  }

  it('sizes the band from the measured width, and again on resize', async () => {
    setViewport(1024, 768)
    measuresAt(1000)
    const w = card()
    showBanner('wasted')
    await nextTick()
    await nextTick()
    const band = w.get('.bn-band').element as HTMLElement
    // 1024 × 0.88 of free width for words 1000 px wide at 100 px: 90 px.
    expect(band.style.fontSize).toBe('90px')
    setViewport(512, 768)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(band.style.fontSize).toBe('45px')
  })

  it('short words stop at the card\'s design maximum', async () => {
    setViewport(2560, 1080)
    measuresAt(300)
    const w = card()
    showBanner('cleared')
    await nextTick()
    await nextTick()
    expect((w.get('.bn-band').element as HTMLElement).style.fontSize).toBe('112px')
  })
})
