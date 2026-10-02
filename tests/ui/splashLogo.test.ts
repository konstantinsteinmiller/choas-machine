// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─── The boot splash is drawn twice and must be the same picture ───────────
//
// `index.html` paints a static splash before any script runs; `FLogoProgress`
// takes over when Vue mounts and cross-fades the static one away. The hand-over
// is only invisible if the two are the same picture, at the same size, in the
// same place. They used not to be: the static copy was a simplified emblem
// with half the title, so the logo visibly changed as the loader took over.
//
// Now the lockup (the mech's head in the hex badge over the CHAOS /
// MACHINE wordmark) is ONE inline SVG of paths, pasted into both files. This
// pins the two copies to each other, byte for byte, and pins every sizing and
// colour rule of the two layouts to each other, rule for rule. A browser
// check of the hand-over (boxes and pixels) is in the logo redesign notes;
// what a unit test can hold is that nobody edits one copy and not the other.

const read = (rel: string): string => readFileSync(resolve(__dirname, '../..', rel), 'utf8')
const html = read('index.html')
const vue = read('src/components/atoms/FLogoProgress.vue')
const manifest = JSON.parse(read('public/manifest.json')) as { name: string; short_name: string; description: string; background_color: string }

const staticSvg = /<div class="s-logo"[^>]*>(<svg[\s\S]*?<\/svg>)<\/div>/.exec(html)?.[1] ?? ''
const loaderSvg = /h1\.logo\(.*\)\n\s*(<svg[\s\S]*?<\/svg>)\n/.exec(vue)?.[1] ?? ''

/** `prop: value` pairs of a plain CSS rule in index.html's <style>. */
const cssRule = (selector: string): Record<string, string> => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = new RegExp(`(?:^|\\n|\\})\\s*${esc}\\s*\\{([^{}]*)\\}`).exec(css)?.[1]
  if (body === undefined) throw new Error(`index.html has no rule for ${selector}`)
  return Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':')
    return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
  }))
}

/** `prop: value` pairs of an indented-sass rule in FLogoProgress (optionally one nested block down). */
const sassRule = (selector: string, nested?: string): Record<string, string> => {
  const style = /<style[^>]*lang="sass">([\s\S]*?)<\/style>/.exec(vue)?.[1] ?? ''
  const lines = style.split('\n')
  const at = lines.findIndex((l) => l === selector)
  if (at < 0) throw new Error(`FLogoProgress has no rule for ${selector}`)
  const block: string[] = []
  for (const l of lines.slice(at + 1)) {
    if (l.trim() && !l.startsWith('  ')) break
    block.push(l)
  }
  let pick = block.filter((l) => /^ {2}[a-z-]+: /.test(l))
  if (nested) {
    const n = block.findIndex((l) => l === `  ${nested}`)
    if (n < 0) throw new Error(`FLogoProgress has no ${nested} under ${selector}`)
    pick = []
    for (const l of block.slice(n + 1)) {
      if (!l.startsWith('    ')) break
      pick.push(l)
    }
  }
  return Object.fromEntries(pick.map((l) => {
    const i = l.indexOf(':')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
}

const only = (rule: Record<string, string>, keys: string[]): Record<string, string> =>
  Object.fromEntries(keys.map((k) => [k, rule[k]]))

describe('the splash lockup', () => {
  it('is in both places', () => {
    expect(staticSvg.length).toBeGreaterThan(1000)
    expect(loaderSvg.length).toBeGreaterThan(1000)
  })

  it('is byte-identical in the static splash and in FLogoProgress', () => {
    expect(loaderSvg).toBe(staticSvg)
  })

  it('carries no id: during the cross-fade both copies are in the document at once', () => {
    // A duplicated id makes url(#…) / <use href="#…"> resolve into the OTHER
    // copy, which is then removed from under it.
    expect(staticSvg).not.toMatch(/\sid=/)
    expect(staticSvg).not.toMatch(/url\(|href=|<use\b/)
  })

  it('is paths, not text: nothing reflows before the bundled fonts load', () => {
    expect(staticSvg).not.toMatch(/<text\b|font-family|font-size/)
  })

  it('requests nothing (Poki forbids external requests; this paints before any script)', () => {
    const withoutNs = staticSvg.replace('xmlns="http://www.w3.org/2000/svg"', '')
    expect(withoutNs).not.toMatch(/https?:|<image\b|@import/)
  })

  it('stays small: it is on the critical path twice (index.html and the loader chunk)', () => {
    expect(staticSvg.length).toBeLessThan(5000)
  })

  it('is decoration for assistive tech; the wrapper carries the name', () => {
    expect(staticSvg).toMatch(/^<svg [^>]*aria-hidden="true"/)
    expect(html).toMatch(/<div class="s-logo" role="img" aria-label="Chaos Machine">/)
    expect(vue).toMatch(/h1\.logo\(:aria-label="t\('gameName'\)"\)/)
  })

  it('is named what the page and the installed app are named', () => {
    // The tab title, the iOS home-screen title, the PWA name and the logo's
    // accessible name are one string.
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]
    expect(title).toBe('Chaos Machine')
    expect(/<meta name="apple-mobile-web-app-title" content="([^"]*)">/.exec(html)?.[1]).toBe(title)
    expect(/<div class="s-logo" role="img" aria-label="([^"]*)">/.exec(html)?.[1]).toBe(title)
    expect(manifest.name).toBe(title)
    expect(manifest.short_name).toBe(title)
  })

  it('declares the aspect ratio its viewBox has, in both layouts', () => {
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(staticSvg) ?? []
    expect(cssRule('.s-logo')['aspect-ratio']).toBe(`${w} / ${h}`)
    expect(sassRule('.logo')['aspect-ratio']).toBe(`${w} / ${h}`)
  })
})

describe('the two layouts are the same, rule for rule', () => {
  it('centre the column the same way (a flex layer, no half-pixel transform)', () => {
    const keys = ['position', 'inset', 'display', 'align-items', 'justify-content']
    expect(only(sassRule('.loader'), keys)).toEqual(only(cssRule('#static-splash'), keys))
    expect(sassRule('.loader').transform).toBeUndefined()
  })

  it('size the column the same', () => {
    const keys = ['position', 'display', 'flex-direction', 'align-items', 'gap', 'width']
    expect(only(sassRule('.card'), keys)).toEqual(only(cssRule('.s-card'), keys))
  })

  it('size the lockup the same', () => {
    expect(only(sassRule('.logo'), ['width', 'aspect-ratio'])).toEqual(only(cssRule('.s-logo'), ['width', 'aspect-ratio']))
    expect(sassRule('.logo', ':deep(svg)')).toEqual(cssRule('.s-logo svg'))
  })

  it('draw the bar the same', () => {
    expect(sassRule('.bar')).toEqual(cssRule('.s-bar'))
    expect(sassRule('.track, .lit')).toEqual(cssRule('.s-track, .s-lit'))
    expect(sassRule('.track')).toEqual(cssRule('.s-track'))
    expect(sassRule('.lit')).toEqual(cssRule('.s-lit'))
    const fill = ['width', 'height', 'background', 'transform-origin']
    expect(only(sassRule('.fill'), fill)).toEqual(only(cssRule('.s-fill'), fill))
  })

  it('paint the same backdrop and the same grid', () => {
    expect(sassRule('.splash-backdrop').background).toBe(cssRule('#static-splash').background)
    const grid = ['inset', 'background-image', 'background-size']
    expect(only(sassRule('.backdrop-grid'), grid)).toEqual(only(cssRule('.s-grid'), grid))
    // Same loop (duration, easing), under each file's own keyframes name.
    const loop = (a: string) => a.split(' ').slice(1).join(' ')
    expect(loop(sassRule('.backdrop-grid').animation)).toBe(loop(cssRule('.s-grid').animation))
  })

  it('end the backdrop in the page colour, so nothing flashes at the edges', () => {
    const edge = /(#[0-9a-f]{6}) 100%\)$/i.exec(cssRule('#static-splash').background)?.[1]
    expect(edge).toBeTruthy()
    expect(cssRule('body')['background-color']).toBe(edge)
    expect(manifest.background_color).toBe(edge)
  })
})

describe('the loader mechanics survive the restyle', () => {
  it('the static bar creeps on the compositor, from nothing, by transform', () => {
    expect(cssRule('.s-fill').transform).toBe('scaleX(0)')
    expect(cssRule('.s-fill').animation).toMatch(/^s-creep /)
    expect(html).toMatch(/@keyframes s-creep \{\s*to \{ transform: scaleX\(0\.1\); \}/)
  })

  it('the Vue bar starts where the static one got to, and only ever creeps forward from there', () => {
    expect(vue).toContain("readScaleX(document.querySelector('#static-splash .s-fill'))")
    expect(vue).toMatch(/div\.fill\(:style="fillStyle"\)/)
    const creepTo = Number(/const CREEP_TO = ([\d.]+)/.exec(vue)?.[1])
    const staticEnd = Number(/@keyframes s-creep \{\s*to \{ transform: scaleX\(([\d.]+)\)/.exec(html)?.[1])
    expect(creepTo).toBeGreaterThan(staticEnd)
  })

  it('the grid pan continues in phase instead of restarting under the cross-fade', () => {
    expect(vue).toMatch(/continuePan\(staticSplash\.querySelector\('\.s-grid'\), gridEl\.value\)/)
    expect(vue).toMatch(/div\.backdrop-grid\(ref="gridEl"/)
  })

  it('the 28-cell bar is gone from both (it was a MegaMan health bar)', () => {
    for (const src of [html, vue]) {
      expect(src).not.toMatch(/\/ 28\)|28-cell|helm/i)
    }
  })
})

describe('the store copy describes this game', () => {
  const meta = /<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? ''

  it.each([['index.html meta description', meta], ['manifest description', manifest.description]])('%s is about the mech and names nothing of the predecessor', (_, text) => {
    expect(text).toMatch(/mech/i)
    expect(text).not.toMatch(/Flux|android|Mega Droid/i)
  })
})
