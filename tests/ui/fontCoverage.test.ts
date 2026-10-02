import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The game ships ONE face (AngryBirds), which covers Western European Latin
 * and nothing else. A language set in it must not contain a letter the face
 * lacks: that letter would fall to a system face and the word would be drawn
 * in two fonts. Such a language belongs in the system-face list in
 * `fonts.sass` instead. This test reads the font's character map and every
 * locale's strings, and holds the two lists together.
 */

const ROOT = join(__dirname, '..', '..')
const FONT = join(ROOT, 'src', 'assets', 'css', 'font', 'angrybirds-regular.ttf')
const LOCALES = join(ROOT, 'src', 'i18n', 'locales')
const SASS = readFileSync(join(ROOT, 'src', 'assets', 'css', 'fonts.sass'), 'utf8')

/** Every code point the font has a glyph for (cmap formats 4 and 12). */
const fontCodePoints = (): Set<number> => {
  const b = readFileSync(FONT)
  const numTables = b.readUInt16BE(4)
  let cmap = -1
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (b.toString('ascii', rec, rec + 4) === 'cmap') cmap = b.readUInt32BE(rec + 8)
  }
  if (cmap < 0) throw new Error('no cmap table')
  const out = new Set<number>()
  const n = b.readUInt16BE(cmap + 2)
  for (let i = 0; i < n; i++) {
    const sub = cmap + b.readUInt32BE(cmap + 4 + i * 8 + 4)
    const format = b.readUInt16BE(sub)
    if (format === 4) {
      const segX2 = b.readUInt16BE(sub + 6)
      const ends = sub + 14
      const starts = ends + segX2 + 2
      const deltas = starts + segX2
      const ranges = deltas + segX2
      for (let s = 0; s < segX2; s += 2) {
        const end = b.readUInt16BE(ends + s)
        const start = b.readUInt16BE(starts + s)
        const delta = b.readInt16BE(deltas + s)
        const range = b.readUInt16BE(ranges + s)
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number
          if (range === 0) glyph = (c + delta) & 0xffff
          else {
            const at = ranges + s + range + (c - start) * 2
            glyph = b.readUInt16BE(at)
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff
          }
          if (glyph !== 0) out.add(c)
        }
      }
    } else if (format === 12) {
      const groups = b.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12
        const start = b.readUInt32BE(at)
        const end = b.readUInt32BE(at + 4)
        for (let c = start; c <= end; c++) out.add(c)
      }
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
const SYSTEM = langsOfRule('these set wholly in a system sans')
/** Their own script from a system face; digits and Latin names in the game face. */
const SCRIPTS = [...langsOfRule('Scripts with no Latin text of their own'), 'zh-Hant']
/** `html lang` for a locale file: the two Chinese files are tagged by script. */
const langOf = (code: string): string => (code === 'zh-TW' ? 'zh-Hant' : code === 'pt-PT' ? 'pt' : code)

describe('the bundled font and the languages set in it', () => {
  const have = fontCodePoints()

  it('the font is the Latin face it is taken for', () => {
    for (const ch of 'ABCxyz0189ÄÖÜßéèñçåøæ') expect(have.has(ch.codePointAt(0)!), ch).toBe(true)
    // …and not a Cyrillic or Greek one: those languages are in the system list.
    expect(have.has('Я'.codePointAt(0)!)).toBe(false)
    expect(have.has('Ω'.codePointAt(0)!)).toBe(false)
  })

  for (const code of codes) {
    const lang = langOf(code)
    if (SYSTEM.includes(lang) || SCRIPTS.includes(lang)) continue
    it(`${code}: every letter and digit of its strings is in the font`, async () => {
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

  it('every language in the system-face list is one the game ships', () => {
    for (const lang of SYSTEM) expect(codes.map(langOf), lang).toContain(lang)
  })

  it('a language set in a system face is there for a reason: it has letters the font lacks', async () => {
    for (const lang of SYSTEM) {
      const code = codes.find(c => langOf(c) === lang)!
      const text = (await stringsOf(code)).join('')
      const lacks = [...text].some(ch => /\p{L}/u.test(ch) && !have.has(ch.codePointAt(0)!))
      expect(lacks, `${lang} is fully covered by the game face: take it out of the system list`).toBe(true)
    }
  })
})
