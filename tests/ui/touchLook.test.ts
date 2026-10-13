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
    for (const b of ['strike', 'loot', 'burn', 'sabotage', 'drag', 'grapple', 'rope', 'decoy', 'hide', 'jump', 'crouch', 'shoot', 'scope'] as const) {
      expect(src, b).toContain(`:shape="LOOK.${b}.shape"`)
      expect(src, b).toContain(`LOOK.${b}.tone`)
    }
  })
})

// A body's billboard said E while the burn lesson taught X (both burnt it,
// but a player reads the screen, not the code): every in-world prompt shows
// the key of its own button, the one its lesson teaches.
describe('an in-world prompt shows the key its lesson teaches', () => {
  it('the burn prompt is the burn key, the hook the hook\'s, a body\'s drag the drag key, the takedowns and piles the act key', async () => {
    const { promptAction, HINT_KEYS } = await import('@/components/hud/touchLook')
    expect(promptAction('burn')).toBe('burn')
    expect(promptAction('burn')).toBe(HINT_KEYS.burn)
    expect(promptAction('hook')).toBe(HINT_KEYS.grapple)
    expect(promptAction('rope')).toBe(HINT_KEYS.rope)
    expect(promptAction('strike')).toBe(HINT_KEYS.blade)
    expect(promptAction('assassinate')).toBe(HINT_KEYS.blade)
    expect(promptAction('salvage')).toBe(HINT_KEYS.loot)
    for (const k of ['sabotage', 'silence', 'cutPower', 'jam'] as const) expect(promptAction(k)).toBe(HINT_KEYS.sabotage)
    expect(promptAction('grab')).toBe('drag')
    expect(promptAction('drop')).toBe('drag')
  })

  it('the billboard takes its key from that table, never a list of its own', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/components/hud/WorldPrompt.vue', 'utf8')
    expect(src).toContain('promptAction(kind)')
    expect(src).not.toMatch(/kind === '/)
  })
})

// The flame button read E while the card and the billboard said X: every
// action button on the HUD carries the key of its own action, from the one table.
describe('every HUD action button is lettered with its own action\'s key', () => {
  it('btn-<button> shows BUTTON_ACTION[<button>]', async () => {
    const { BUTTON_ACTION } = await import('@/components/hud/touchLook')
    const src = readFileSync('src/components/hud/MissionHud.vue', 'utf8')
    const blocks = src.split(/FHudButton(?:\.[a-z-]+)?\(/).slice(1)
    let checked = 0
    for (const b of blocks) {
      const id = /data-testid="btn-([a-z]+)"/.exec(b.slice(0, 900))?.[1]
      const key = /:hotkey="kb\('([a-zA-Z0-9]+)'\)"/.exec(b.slice(0, 900))?.[1]
      if (!id || !key || !(id in BUTTON_ACTION)) continue
      expect(key, `btn-${id}`).toBe(BUTTON_ACTION[id as keyof typeof BUTTON_ACTION])
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(9)
  })
})

// A machine's bar sat over CM-07's line under the alarm ("…gibt's nichts" half
// hidden): the bars are painted under every bubble of speech.
describe('speech is drawn over the health bars', () => {
  it('HealthBars comes before SpeechBubbles and QuipBubble in the HUD', () => {
    const src = readFileSync('src/components/hud/MissionHud.vue', 'utf8')
    const lines = src.split('\n')
    const at = (n: string): number => lines.findIndex(l => l.trim() === n)
    expect(at('HealthBars')).toBeGreaterThan(0)
    expect(at('HealthBars')).toBeLessThan(at('SpeechBubbles'))
    expect(at('HealthBars')).toBeLessThan(at('QuipBubble'))
  })
})
