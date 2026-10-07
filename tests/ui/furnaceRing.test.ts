// @vitest-environment jsdom
// #185: the hold lesson's ring sits round the heat (bellows) button: it is drawn
// in the button's own wrapper, centred on it and sized from it, never placed
// by a hand-tuned offset from the panel's edge.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(__dirname, '..', '..', 'src', 'components', 'base', 'smithy', 'FurnaceGame.vue'), 'utf8')

describe('the furnace lesson ring (#185)', () => {
  it('is drawn inside the bellows wrapper, after the button', () => {
    const wrap = src.indexOf('div.bellows-wrap')
    const button = src.indexOf('button.bellows', wrap)
    const teach = src.indexOf('FingerGlyph.teach', wrap)
    expect(wrap).toBeGreaterThan(0)
    expect(button).toBeGreaterThan(wrap)
    expect(teach).toBeGreaterThan(button)
  })

  it('is centred on the button and sized from it', () => {
    const rule = src.slice(src.indexOf('.bellows-wrap .teach'), src.indexOf('.bellows-wrap .teach') + 400)
    expect(rule).toContain('left: 50%')
    expect(rule).toContain('top: 50%')
    expect(rule).toContain('translate: -50% -50%')
    expect(rule).toMatch(/--size: calc\(var\(--bellows\) \+/)
    expect(src).toMatch(/\.bellows\n\s+width: var\(--bellows\)\n\s+height: var\(--bellows\)/)
  })
})
