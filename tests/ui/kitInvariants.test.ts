import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The UI kit's layout rules, held at the source.
 *
 * jsdom does not lay anything out, so "this button cannot collapse" and "the
 * modal header cannot cover the content" cannot be measured in a unit test.
 * What CAN be held is the construction that makes them true; the browser pass
 * (`#/ui` at 320x658, 764x385 and desktop) measures the result.
 */

const root = resolve(__dirname, '../..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(join(root, dir))) {
    const rel = `${dir}/${f}`
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out)
    else if (f.endsWith('.vue')) out.push(rel)
  }
  return out
}
const components = walk('src/components')

const between = (src: string, open: string, close: string): string => {
  const a = src.indexOf(open)
  if (a < 0) return ''
  const b = src.indexOf(close, a)
  return src.slice(src.indexOf('>', a) + 1, b < 0 ? undefined : b)
}
/** The style block's lines, comments dropped: a comment is not a rule. */
const styleLines = (src: string): string[] =>
  between(src, '<style', '</style>').split('\n').filter(l => !l.trim().startsWith('//'))
const templateOf = (src: string): string => between(src, '<template', '</template>')

/**
 * The declarations of one top-level SASS rule: the lines indented under the
 * line that is exactly `selector`, up to the next line at the same indent.
 */
const block = (lines: string[], selector: string): string[] => {
  const start = lines.findIndex(l => l.trim() === selector && !l.startsWith(' '))
  if (start < 0) return []
  const out: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() !== '' && !l.startsWith(' ')) break
    out.push(l.trim())
  }
  return out
}

describe('no component is sized with a scale transform', () => {
  it.each(components)('%s has no Tailwind scale-* class', (rel) => {
    // `scale-110`, `sm:scale-100`, `scale-[1.02]`, `hover:scale-…`: a scaled
    // element keeps its unscaled layout box, so neighbours overlap or leave
    // dead gaps and the hit target drifts off the painted pixels.
    const hits = templateOf(read(rel)).split('\n').filter(l => /(?:^|[\s"'.:(])scale-(?:\d|\[)/.test(l))
    expect(hits).toEqual([])
  })

  it.each(components)('%s does not grow or shrink a control with scale', (rel) => {
    // A panel's entrance may squash one axis (scaleX / scaleY); nothing is
    // sized by a uniform scale.
    const hits = styleLines(read(rel)).filter(l =>
      (l.includes('transform:') && l.includes('scale(')) || l.trim().startsWith('scale:'))
    expect(hits).toEqual([])
  })
})

describe('every control has a floor it cannot be collapsed below', () => {
  it.each([
    ['src/components/atoms/FButton.vue', '.f-button', ['min-width: var(--fbtn-min-w)', 'min-height: var(--fbtn-min-h)', 'max-width: 100%']],
    ['src/components/atoms/FHudButton.vue', '.f-hud-button', ['min-width: 2.5rem', 'min-height: 2.5rem', 'width: var(--cm-chip)']],
    ['src/components/atoms/FTabs.vue', '.f-tabs__tab', ['min-width: 2.75rem', 'min-height: 2.5rem']],
    ['src/components/atoms/FSelect.vue', '.f-select__trigger', ['min-height: 2.75rem']],
    ['src/components/atoms/FSlider.vue', '.f-slider', ['min-width: 7rem']],
    ['src/components/molecules/FModal.vue', '.f-modal__close', ['min-width: 2.5rem', 'min-height: 2.5rem']]
  ] as const)('%s %s', (rel, selector, rules) => {
    const decls = block(styleLines(read(rel)), selector)
    for (const rule of rules) expect(decls, `${selector} lost "${rule}"`).toContain(rule)
  })

  it('the HUD chip token itself never drops under the 40 px touch floor', () => {
    expect(read('src/assets/css/tokens.sass')).toContain('--cm-chip: clamp(2.5rem,')
  })

  it('FMuteButton always renders a button (no branch can leave it empty)', () => {
    const tpl = templateOf(read('src/components/atoms/FMuteButton.vue'))
    expect(tpl.trim().startsWith('FHudButton(')).toBe(true)
    expect(tpl.includes('v-if') || tpl.includes('v-else') || tpl.includes('v-show')).toBe(false)
  })
})

describe('FModal: the header can never cover the content', () => {
  const src = read('src/components/molecules/FModal.vue')
  const lines = styleLines(src)
  const tpl = templateOf(src)

  it('lays the panel out as three rows, and only the content row scrolls', () => {
    expect(block(lines, '.f-modal__panel')).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(lines.filter(l => l.includes('overflow-y: auto'))).toHaveLength(1)
    expect(block(lines, '.f-modal__content')).toContain('overflow-y: auto')
  })

  it('keeps the header in the flow: no overlap compensation, no measuring', () => {
    const header = block(lines, '.f-modal__header')
    expect(header).toContain('position: relative')
    expect(header.some(l => l.startsWith('margin'))).toBe(false)
    expect(src.includes('ResizeObserver')).toBe(false)
    expect(lines.some(l => l.includes('header-overlap'))).toBe(false)
  })

  it('puts the close button inside the header row, beside the title or tabs', () => {
    const header = tpl.slice(tpl.indexOf('header.f-modal__header'), tpl.indexOf('div.f-modal__content'))
    expect(header).toContain('button.f-modal__close')
    expect(block(lines, '.f-modal__close').some(l => l.startsWith('position:'))).toBe(false)
  })

  it('gives the content a minimum height and lets the footer wrap', () => {
    expect(block(lines, '.f-modal__content')).toContain('min-height: min(7rem, 40dvh)')
    expect(block(lines, '.f-modal__footer')).toContain('flex-wrap: wrap')
  })

  it('stays inside the safe area on every side', () => {
    expect(block(lines, '.f-modal')).toContain('padding: var(--cm-safe-top) var(--cm-safe-right) var(--cm-safe-bottom) var(--cm-safe-left)')
  })
})

describe('the kit is coloured from the tokens', () => {
  it.each([
    'src/components/atoms/FButton.vue',
    'src/components/atoms/FHudButton.vue',
    'src/components/atoms/FHudBadge.vue',
    'src/components/atoms/FTabs.vue',
    'src/components/atoms/FSelect.vue',
    'src/components/atoms/FSlider.vue',
    'src/components/molecules/FModal.vue'
  ])('%s names no colour of the predecessor', (rel) => {
    // The yellow plate and navy outline of Mega Droid's candy-plastic kit.
    const src = read(rel).toLowerCase()
    for (const hex of ['#ffcd00', '#f7a000', '#0f1a30', '#1a2b4b', '#141a33']) expect(src.includes(hex), hex).toBe(false)
  })

  it('the bundled faces are the tech ones, Chakra Petch and Exo 2, shipped as files', () => {
    const fonts = read('src/assets/css/fonts.sass')
    const families = new Set([...fonts.matchAll(/font-family: '([^']+)'/g)].map(m => m[1]))
    expect([...families].sort()).toEqual(['Chakra Petch', 'Exo 2'])
    expect(fonts.includes('fonts.googleapis') || fonts.includes('fonts.gstatic')).toBe(false)
    expect(read('package.json').includes('@fontsource')).toBe(false)
    expect(read('src/App.vue')).toContain('font-family: var(--font-ui)')
  })
})

describe('the system corner', () => {
  it('stacks the speaker over the settings cog, inside the safe area', () => {
    const src = read('src/components/hud/SystemCorner.vue')
    const tpl = templateOf(src)
    expect(tpl.indexOf('FMuteButton')).toBeGreaterThan(0)
    expect(tpl.indexOf('FMuteButton')).toBeLessThan(tpl.indexOf('SettingsButton'))
    const corner = block(styleLines(src), '.system-corner')
    expect(corner).toContain('bottom: var(--cm-safe-bottom)')
    expect(corner).toContain('left: var(--cm-safe-left)')
  })

  it('the settings cog carries its own modal', () => {
    const tpl = templateOf(read('src/components/organisms/SettingsButton.vue'))
    expect(tpl).toContain('FHudButton(')
    expect(tpl).toContain('OptionsModal(')
  })
})
