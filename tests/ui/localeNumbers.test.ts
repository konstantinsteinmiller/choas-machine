// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '@/utils/enums'
import { formatCount } from '@/utils/localeNumber'

/**
 * ─── Grouping, in every locale the game actually ships ──────────────────────
 *
 * `formatCount` exists because `#41032 of 154331` is two strings of digits
 * rather than a placing. What is pinned here is not the comma — it is that the
 * separator belongs to the PLAYER, that the digits stay Latin, and that no
 * locale in the project's own list makes the formatter throw.
 *
 * That last one is why this walks `LANGUAGES` instead of a sample. A locale
 * added later with a tag `Intl` cannot parse throws at a render site on the
 * result screen, in exactly one language — which is precisely the bug that
 * reaches production, because nobody on the team plays in that language.
 *
 * ── Instantiating this ──
 *
 * Point the import at wherever the project keeps its shipped locale list. If it
 * has none (a single-language game), replace it with a literal array of the
 * tags the game could plausibly grow into and keep the rest as it is.
 */
describe('formatCount', () => {
  it('groups a six-digit number in every shipped locale, and never throws', () => {
    for (const locale of LANGUAGES) {
      const out = formatCount(154331, locale)
      // Something separates the groups: a comma, a dot, or one of the several
      // spaces (U+0020, U+00A0, U+202F) the space-grouping locales use.
      expect(out, `${locale} must group`).toMatch(/^\d{1,3}[.,\s  ]\d/)
      // Latin digits in every one of them — see the note in `localeNumber.ts`.
      expect(out, `${locale} must stay Latin`).toMatch(/^[\d.,\s  ]+$/)
    }
  })

  it('uses each locale own convention rather than one house style', () => {
    expect(formatCount(154331, 'en')).toBe('154,331')
    // German groups on dots — an English comma there reads as a decimal point.
    expect(formatCount(154331, 'de')).toBe('154.331')
    // Hindi groups in lakhs: 1,54,331, not 154,331. Proof the formatter is
    // asking a real locale database rather than inserting a comma every three.
    expect(formatCount(154331, 'hi')).toBe('1,54,331')
  })

  it('leaves small numbers alone', () => {
    expect(formatCount(7, 'en')).toBe('7')
    expect(formatCount(999, 'de')).toBe('999')
    expect(formatCount(1000, 'en')).toBe('1,000')
  })

  it('renders nothing rather than NaN for a number that is not one', () => {
    // This lands in a pill on the result screen: a blank reads as "not yet",
    // where `NaN` reads as a broken game.
    expect(formatCount(Number.NaN, 'en')).toBe('')
    expect(formatCount(Number.POSITIVE_INFINITY, 'en')).toBe('')
  })

  it('falls back to plain digits on a locale tag Intl cannot parse', () => {
    // Never throw at a render site: ungrouped digits beat no board at all.
    expect(formatCount(154331, 'not a locale')).toBe('154331')
  })
})

/**
 * The badge's own grouping is worth one case in the component suite too, since
 * the bug it guards is a formatter built at setup instead of read per render:
 *
 *   it('re-groups when the player switches language', async () => {
 *     const i = createI18n({ legacy: false, locale: 'en', messages: { en, de } })
 *     const w = mount(RankBadge, { props: { score: 12 }, global: { plugins: [i] } })
 *     expect(w.text()).toContain('#41,032')
 *     i.global.locale.value = 'de'
 *     await w.vm.$nextTick()
 *     expect(w.text()).toContain('#41.032')
 *   })
 */
