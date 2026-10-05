import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The game ships its faces as per-script subsets (Chakra Petch: Latin, Latin
 * Extended, Vietnamese, Thai; Exo 2: Cyrillic), each declared with the
 * `unicode-range` it covers. A language set in them must not contain a letter
 * outside those ranges: it would fall to a system face and a word would be
 * drawn in two fonts. Such a language belongs in the system-face list in
 * `fonts.sass` instead. This test reads the ranges and every locale's
 * strings, and holds the two together.
 */

const ROOT = join(__dirname, '..', '..')
const LOCALES = join(ROOT, 'src', 'i18n', 'locales')
const CSS = join(ROOT, 'src', 'assets', 'css')
const SASS = readFileSync(join(CSS, 'fonts.sass'), 'utf8')

/** Every code point some bundled face declares it covers. */
const covered = (): Set<number> => {
  const out = new Set<number>()
  for (const m of SASS.matchAll(/unicode-range: ([^\n]+)/g)) {
    for (const part of m[1]!.split(',')) {
      const r = part.trim().replace(/^U\+/i, '')
      const [a, b] = r.includes('-') ? r.split('-') : [r, r]
      for (let c = parseInt(a!, 16); c <= parseInt(b!, 16); c++) out.add(c)
    }
  }
  return out
}

/** Every string of a locale file, flattened. */
const stringsOf = async (code: string): Promise<string[]> => {
  const mod = (await import(join(LOCALES, `${code}.ts`))) as { default: unknown }
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v)
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(mod.default)
  return out
}

/** The `html:lang(…)` codes of the rule that carries a comment containing `marker`. */
const langsOfRule = (marker: string): string[] => {
  const at = SASS.indexOf(marker)
  if (at < 0) throw new Error(`fonts.sass: no rule marked "${marker}"`)
  const rule = SASS.slice(at).split('\n').find(l => l.startsWith('html:lang('))!
  return [...rule.matchAll(/html:lang\(([^)]+)\)/g)].map(m => m[1]!)
}

const codes = readdirSync(LOCALES).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).sort()
/** Set wholly in a system face. */
const SYSTEM = langsOfRule('neither face has it')
/** Their own script from a system face; digits and Latin names in the game face. */
const SCRIPTS = [...langsOfRule('Scripts with no Latin text of their own'), 'zh-Hant']
/** `html lang` for a locale file: the two Chinese files are tagged by script. */
const langOf = (code: string): string => (code === 'zh-TW' ? 'zh-Hant' : code === 'pt-PT' ? 'pt' : code)

describe('the bundled faces and the languages set in them', () => {
  const have = covered()

  it('every face it declares is bundled, with its licence beside it', () => {
    for (const m of SASS.matchAll(/url\(\.\/font\/([^)]+)\)/g)) expect(existsSync(join(CSS, 'font', m[1]!)), m[1]).toBe(true)
    expect(existsSync(join(CSS, 'font', 'OFL-ChakraPetch.txt'))).toBe(true)
    expect(existsSync(join(CSS, 'font', 'OFL-Exo2.txt'))).toBe(true)
  })

  it('the faces cover Latin, Vietnamese, Thai and Cyrillic, and not Greek', () => {
    for (const ch of 'ABCxyz0189ÄÖÜßéèñçåøæŁąčőțşƏəđươกขЯжЇ') expect(have.has(ch.codePointAt(0)!), ch).toBe(true)
    expect(have.has('Ω'.codePointAt(0)!)).toBe(false)
  })

  for (const code of codes) {
    const lang = langOf(code)
    if (SYSTEM.includes(lang) || SCRIPTS.includes(lang)) continue
    it(`${code}: every letter and digit of its strings is in a bundled face`, async () => {
      const missing = new Set<string>()
      for (const s of await stringsOf(code)) {
        // Placeholders are replaced by numbers or by other translated strings.
        for (const ch of s.replace(/\{[a-zA-Z]+\}/g, '')) {
          if (/[\p{L}\p{N}]/u.test(ch) && !have.has(ch.codePointAt(0)!)) missing.add(ch)
        }
      }
      expect([...missing].sort().join(' '), `${code} would be drawn in two faces: add it to the system-face list in fonts.sass`).toBe('')
    })
  }

  it('a language set in a system face is there for a reason: it has letters the faces lack', async () => {
    for (const lang of SYSTEM) {
      const code = codes.find(c => langOf(c) === lang)!
      const text = (await stringsOf(code)).join('')
      expect([...text].some(ch => /\p{L}/u.test(ch) && !have.has(ch.codePointAt(0)!)), lang).toBe(true)
    }
  })
})
