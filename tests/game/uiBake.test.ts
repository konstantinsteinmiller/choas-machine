import { describe, expect, it } from 'vitest'
import {
  cssUrls, objectFit, rewriteHtmlSelectors, selectorKeys, styleWithoutPosition, unicodeRanges
} from '@/game/debug/domRaster'
import * as real from '@/game/debug/uiBake'
import * as stub from '@/game/debug/uiBake.stub'

// The debug UI bake (HUD drawn into the canvas for Poki's canvas-only
// playtest recorder). Its browser half is verified in a real Chrome; these
// pin the pure rules it rests on.

describe('UI bake: the stub a flag-off build ships', () => {
  it('mirrors every export of the real module, so a build without the flag still resolves', () => {
    expect(Object.keys(stub).sort()).toEqual(Object.keys(real).sort())
  })
})

describe('UI bake: CSS carried into the SVG', () => {
  it('rewrites html selectors to the wrapper, and nothing that merely contains the word', () => {
    expect(rewriteHtmlSelectors('html{font-size:10px}')).toBe('.uib-html{font-size:10px}')
    expect(rewriteHtmlSelectors('html[dir=rtl] .a, html.dark .b{}')).toBe('.uib-html[dir=rtl] .a, .uib-html.dark .b{}')
    expect(rewriteHtmlSelectors('.html-note{} .x html-y{}')).toBe('.html-note{} .x html-y{}')
  })

  it('finds url()s to inline, resolved against the sheet, and leaves data: and #refs alone', () => {
    const found = cssUrls('a{src:url(./font/x.woff2)} b{background:url("data:image/png;base64,AA")} c{fill:url(#g)}', 'http://h/assets/app.css')
    expect(found.map(f => f.abs)).toEqual(['http://h/assets/font/x.woff2'])
  })

  it('keys a rule by the rightmost compound: id, else class, else tag; otherwise every unit gets it', () => {
    expect(selectorKeys('.hud .bar[data-v-1]')).toEqual(['.bar'])
    expect(selectorKeys('#root > .a, span.b:hover::before')).toEqual(['.a', '.b'])
    expect(selectorKeys('.w-1\\/2')).toEqual(['.w-1/2'])
    expect(selectorKeys('.a:is(.b, .c) div')).toEqual(['div'])
    expect(selectorKeys(':root')).toBeNull()
    expect(selectorKeys('*, ::before')).toBeNull()
    expect(selectorKeys('html body')).toBeNull()
    expect(selectorKeys('.a, [dir=rtl]')).toBeNull()
  })

  it('reads unicode-range lists, wildcards included', () => {
    expect(unicodeRanges('U+0000-00FF, U+0131, U+02??')).toEqual([[0, 0xff], [0x131, 0x131], [0x200, 0x2ff]])
  })
})

describe('UI bake: what a change is', () => {
  it('treats a translate-only transform or an offset as a move, not a change', () => {
    expect(styleWithoutPosition('transform: translate(10px, 20px); opacity: 1')).toBe('opacity: 1')
    expect(styleWithoutPosition('left: 3px; top: 4px; color: red')).toBe('color: red')
    expect(styleWithoutPosition('transform: translate(1px, 2px)')).toBe(styleWithoutPosition('transform: translate(30px, 40px)'))
  })

  it('treats anything else in the style as a change', () => {
    expect(styleWithoutPosition('opacity: 0')).not.toBe(styleWithoutPosition('opacity: 1'))
    expect(styleWithoutPosition('transform: translate(1px, 2px) rotate(3deg)')).not.toBe(styleWithoutPosition('transform: translate(1px, 2px)'))
  })
})

describe('UI bake: images drawn straight from the page', () => {
  const box = { x: 10, y: 20, w: 100, h: 50 }

  it('cover crops the source to the box aspect, centred', () => {
    const { src, dst } = objectFit('cover', 200, 200, box)
    expect(dst).toEqual(box)
    expect(src).toEqual({ x: 0, y: 50, w: 200, h: 100 })
  })

  it('contain letterboxes inside the box', () => {
    const { src, dst } = objectFit('contain', 200, 200, box)
    expect(src).toEqual({ x: 0, y: 0, w: 200, h: 200 })
    expect(dst).toEqual({ x: 35, y: 20, w: 50, h: 50 })
  })

  it('fill stretches', () => {
    expect(objectFit('fill', 7, 9, box).dst).toEqual(box)
  })
})
