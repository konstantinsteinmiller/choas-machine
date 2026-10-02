import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ART_SHEETS, promptDocs, referenceFile, sheetIndex } from '@/game/art/artSheet'
import {
  COVER_ASPECTS, COVER_PICK, COVER_SCENARIOS, LOGO_PLACEMENT, coverFiles, promotionPromptDoc, promptForCover
} from '@/game/art/promotionSheet'

describe('the cover manifest', () => {
  it('cuts every size from a plate of its own aspect, never a smaller one', () => {
    for (const a of COVER_ASPECTS) {
      for (const s of a.sizes) {
        const drift = Math.abs((s.w / s.h) / (a.plate.w / a.plate.h) - 1)
        expect(drift, `${s.w}x${s.h} from ${a.id}`).toBeLessThan(0.005)
        expect(a.plate.w, `${a.id} plate`).toBeGreaterThanOrEqual(s.w)
        expect(a.plate.h, `${a.id} plate`).toBeGreaterThanOrEqual(s.h)
      }
      // Plates are shot at device pixel ratio 2.
      expect(a.plate.w % 2).toBe(0)
      expect(a.plate.h % 2).toBe(0)
    }
  })

  it('delivers exactly the files the portals ask for', () => {
    const files = COVER_ASPECTS.flatMap(a => coverFiles(a).map(f => f.file)).sort()
    expect(files).toEqual([
      // With and without the logo, in both formats.
      'cover-800x800.jpg', 'cover-800x800-logo.jpg', 'cover-800x800.webp', 'cover-800x800-logo.webp',
      'cover-1920x1080.jpg', 'cover-1920x1080-logo.jpg', 'cover-1920x1080.webp', 'cover-1920x1080-logo.webp',
      // One format, with and without.
      'cover-1080x1920.jpg', 'cover-1080x1920-logo.jpg',
      'cover-800x1200.webp', 'cover-800x1200-logo.webp',
      // With the logo only.
      'cover-1360x850-logo.jpg', 'cover-800x450-logo.webp', 'cover-400x225-logo.jpg',
      'cover-512x512-logo.jpg', 'cover-628x628-logo.jpg', 'cover-512x384-logo.jpg', 'cover-512x340-logo.jpg'
    ].sort())
    expect(new Set(files).size).toBe(files.length)
  })

  it('never puts the logo in the top left, where a portal lays its own badge', () => {
    for (const p of Object.values(LOGO_PLACEMENT)) {
      expect(['bottom-right', 'top-right']).toContain(p.anchor)
      // ...and the prompt names the same corner as the one to keep calm.
      expect(p.corner).toBe(p.anchor === 'top-right' ? 'TOP RIGHT' : 'LOWER RIGHT')
      expect(p.size).toBeGreaterThan(0.25)
      expect(p.size).toBeLessThan(0.6)
    }
  })

  it('ships one scenario out of several, and every prompt forbids text, logo and interface', () => {
    expect(COVER_SCENARIOS.length).toBeGreaterThanOrEqual(4)
    expect(COVER_SCENARIOS.map(s => s.id)).toContain(COVER_PICK)
    for (const s of COVER_SCENARIOS) {
      for (const a of COVER_ASPECTS) {
        const p = promptForCover(s, a)
        expect(p).toContain('NO TEXT ANYWHERE')
        expect(p).toContain('NO LOGO')
        expect(p).toContain('NO USER INTERFACE')
        expect(p).toContain(`${a.plate.w} x ${a.plate.h}`)
        // The deliverable is stated first and again last.
        expect(p.startsWith('WHAT COMES BACK')).toBe(true)
        expect(p.trimEnd().endsWith('No text, no logo, no interface, no border.')).toBe(true)
      }
    }
  })

  it('stays out of the Art Desk\'s scan: the cover document is not a sheet document', () => {
    expect(Object.keys(promptDocs())).not.toContain('PROMPTS-PROMOTION.md')
    expect(promotionPromptDoc()).toContain(`**${COVER_PICK}**`)
  })
})

describe('the drop-in manifest', () => {
  it('names files the game actually looks for', () => {
    const textures = readFileSync('src/game/world/textures.ts', 'utf-8')
    for (const s of ART_SHEETS) {
      expect(s.target).toMatch(/^images\/textures\/[a-z]+\.webp$/)
      const name = s.target.slice('images/textures/'.length, -'.webp'.length)
      // The atlas draws this cell by this name, and can draw its reference.
      expect(textures).toContain(`'${name}'`)
      expect(s.stem).toBe(`texture-${name}`)
    }
  })

  it('writes one desk job per sheet, with the heading shape the desk parses', () => {
    const doc = promptDocs()['PROMPTS-textures.md']!
    for (const s of ART_SHEETS) {
      expect(doc).toContain(`(${referenceFile(s)} → ${s.target})`)
    }
    expect(doc.match(/^```text$/gm)?.length).toBe(ART_SHEETS.length)
    const index = sheetIndex()
    expect(index.sheets.map(x => x.files.clean)).toEqual(ART_SHEETS.map(referenceFile))
    expect(index.sheets.every(x => x.cells.length === 1 && x.cells[0]!.target.endsWith('.webp'))).toBe(true)
  })
})
