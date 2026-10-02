import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guard against an icon rendering at its intrinsic size inside a HUD chip.
 *
 * `IconCoin` is an `<img>` — every other icon in the set is an inline `<svg>`.
 * `FHudBadge` used to size only `:slotted(svg)`, so the coin fell through to
 * its natural 128×128 and rendered as a giant gold disc bursting out of the
 * badge and shoving the rest of the bottom HUD row off screen.
 *
 * jsdom has no layout engine, so this cannot be caught by rendering. The
 * invariant is asserted against the source instead: any container that accepts
 * a slotted icon must size BOTH element types.
 */

const read = (rel: string): string =>
  readFileSync(resolve(__dirname, '../..', rel), 'utf8')

/** Components whose slots receive an icon from a caller. */
const ICON_HOSTS = [
  'src/components/atoms/FHudBadge.vue',
  'src/components/atoms/FHudButton.vue'
]

describe('slotted icon sizing', () => {
  it.each(ICON_HOSTS)('%s sizes both slotted svg and slotted img', (path) => {
    const src = read(path)
    expect(src, `${path} has no :slotted() icon rule at all`).toContain(':slotted(')
    expect(src, `${path} does not size slotted <svg>`).toContain(':slotted(svg)')
    expect(src, `${path} does not size slotted <img> — an image icon here would render at its natural size`)
      .toContain(':slotted(img)')
  })
})
