// #160: every on-screen button is named by its look alone, a shape and a
// colour of its own, and everything that points at a button on touch (the
// hologram's press, the prompt over the world, a lesson) shows that button.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUTTON_LOOK, HINT_BUTTON, HINT_GESTURE, PROMPT_BUTTON, WEAPON_TONES, type TouchButton } from '@/components/hud/touchLook'
import { HINT_IDS } from '@/game/sim/coach'

const BUTTONS = Object.keys(BUTTON_LOOK) as TouchButton[]

describe('the buttons\' looks (#160)', () => {
  it('no two buttons share a picture: each says what it does by itself', () => {
    // The fire button draws the weapon in hand, the weapon chip too: they are one family.
    const icons = BUTTONS.filter(b => b !== 'weapon' && b !== 'fire').map(b => BUTTON_LOOK[b].icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it('the thumb cluster is round keys with a picture of the mech doing the thing', () => {
    // A playtester could not tell coloured hexes and diamonds with chevrons apart.
    for (const b of ['jump', 'crouch', 'sprint', 'decoy', 'hide'] as const) {
      expect(BUTTON_LOOK[b].shape, b).toBe('round')
      expect(BUTTON_LOOK[b].icon.startsWith('act-'), b).toBe(true)
    }
    const fam = (bs: TouchButton[]): string[] => [...new Set(bs.map(b => BUTTON_LOOK[b].shape))]
    expect(fam(['strike', 'loot', 'burn', 'sabotage', 'drag'])).toEqual(['round'])
    expect(fam(['fire', 'weapon', 'zoom', 'cancel'])).toEqual(['plate'])
  })

  it('the weapons in their colours (#161): the rifle cyan, the gun violet, the launcher red', () => {
    expect(WEAPON_TONES).toEqual({ sniper: 'cyan', minigun: 'violet', rocket: 'danger' })
  })

  it('every control a lesson teaches has a button or a gesture to show on touch', () => {
    for (const id of HINT_IDS) expect(!!HINT_BUTTON[id] || !!HINT_GESTURE[id], id).toBe(true)
  })

  it('every prompt over the world names a button', () => {
    for (const b of Object.values(PROMPT_BUTTON)) expect(BUTTONS).toContain(b)
  })

  it('the HUD draws each button from the table, not from colours of its own', () => {
    const src = readFileSync('src/components/hud/MissionHud.vue', 'utf8')
    for (const b of ['strike', 'loot', 'burn', 'sabotage', 'drag', 'grapple', 'rope', 'decoy', 'hide', 'jump', 'crouch', 'sprint'] as const) {
      expect(src, b).toContain(`:shape="LOOK.${b}.shape"`)
      expect(src, b).toContain(`LOOK.${b}.tone`)
    }
  })
})
