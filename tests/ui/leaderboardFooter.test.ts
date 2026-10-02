// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import de from '@/i18n/locales/de'
import ja from '@/i18n/locales/ja'
import { LANGUAGES } from '@/utils/enums'
import { formatCount } from '@/utils/localeNumber'

/**
 * ─── "You are #1,130 of 2,531" ──────────────────────────────────────────────
 *
 * The modal footer is the whole reason a player who is nowhere near the top
 * opens the board at all, and it has two faults that appear ONLY when the
 * message is rendered — never when the locale files are inspected.
 *
 * A locale-parity suite (every locale carries every key, with the same
 * `{placeholders}`) passes on both of them, because neither is a fault in the
 * files. They are faults at the CALL SITE:
 *
 *   1. `yourRank` exists in the wild as both `"You are #{n}"` and
 *      `"You are #{n} of {total}"`. A project that inherited its locale files
 *      from a sibling game usually has the second, while the component was
 *      written against the first — so it passes only `{ n }`, vue-i18n drops
 *      the parameter it was not given, and the footer reads
 *      "You are #1,130 of " with a second span appending "of 2,531".
 *   2. Several languages put the POPULATION first. A footer split into a rank
 *      span and an "of N" span renders every one of them backwards.
 *
 * ── Instantiating this ──
 *
 * Point the three locale imports at this project's source locale plus two
 * others: one that groups differently from English (German, French, Russian,
 * Hindi) and one that leads with the population (Japanese, Korean, Turkish,
 * Kazakh). If the project ships neither, keep the first two cases and drop the
 * third — but check the claim before dropping it.
 */

const i18nFor = (locale: string, messages: Record<string, unknown>) =>
  createI18n({ legacy: false, locale, fallbackLocale: 'en', messages: { [locale]: messages } })
    .global.t

describe('the board footer renders one complete sentence', () => {
  it('leaves no dangling "of" when both parameters are supplied', () => {
    const t = i18nFor('en', en)
    const out = t('leaderboard.yourRank', { n: '1,130', total: '2,531' })
    expect(out).toBe('You are #1,130 of 2,531')
  })

  it('would leave a dangling fragment if the population were dropped', () => {
    // The regression itself, pinned so nobody "simplifies" the call site back
    // to one parameter. This is what shipped.
    const t = i18nFor('en', en)
    expect(t('leaderboard.yourRank', { n: '1,130' })).toBe('You are #1,130 of ')
  })

  it('keeps the population first in the languages that put it there', () => {
    // Japanese is "{total} 人中 #{n} 位" — the population leads. THIS is why the
    // footer is one message rather than a rank span plus an "of N" span: a
    // split renders this language, Korean, Turkish and Kazakh backwards, and
    // nothing in a parity suite can see it.
    const t = i18nFor('ja', ja)
    const out = t('leaderboard.yourRank', { n: '1,130', total: '2,531' })
    expect(out.indexOf('2,531')).toBeLessThan(out.indexOf('1,130'))
  })

  it('groups both numbers the way the active language does', () => {
    const t = i18nFor('de', de)
    const n = formatCount(1130, 'de')
    const total = formatCount(2531, 'de')
    expect(t('leaderboard.yourRank', { n, total })).toBe('Du bist #1.130 von 2.531')
  })

  it('never pluralises on a value that arrives pre-formatted', async () => {
    // `{n}` and `{total}` are STRINGS by the time they reach these messages —
    // that is what makes the grouping locale-correct. vue-i18n's plural
    // selection needs a real number, so a locale that split one of them on `|`
    // would silently pick the wrong form, or render the raw pipe.
    //
    // Walks the project's OWN locale list, because the one locale that does
    // this is the one nobody on the team plays in.
    // Only keys the template's i18n block defines (`i18n-keys.ts`). A project
    // that feeds another pre-formatted count into a message adds it here.
    const preFormatted = ['leaderboard.yourRank', 'leaderboard.of']
    for (const code of LANGUAGES) {
      const mod = await import(`../../src/i18n/locales/${code}.ts`)
      for (const path of preFormatted) {
        const [group, key] = path.split('.') as [string, string]
        const message = (mod.default as Record<string, Record<string, string>>)[group]?.[key]
        expect(message, `${code} is missing ${path}`).toBeTypeOf('string')
        expect(message, `${code} pluralises ${path} on a pre-formatted value`)
          .not.toContain('|')
      }
    }
  })
})
