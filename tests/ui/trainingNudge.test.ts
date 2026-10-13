// @vitest-environment jsdom
// #186: a player at a shut training door who has not done the room's thing is
// shown its control until they do: on touch a bouncing arrow on the very
// button, on a keyboard (or when that button is not on screen) its key big in
// the middle of the screen. In the weapons room, the weapon switch.

import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { hud } from '@/game/state/hud'
import TrainingNudge from '@/components/hud/TrainingNudge.vue'
import { NUDGE_BUTTON } from '@/components/hud/touchLook'

enableAutoUnmount(afterEach)
afterEach(() => { hud.training.nudge = ''; hud.device = 'mouse'; document.body.innerHTML = '' })

const nudge = () => mount(TrainingNudge, {
  attachTo: document.body,
  global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
})

describe('the training nudge (#186)', () => {
  it('nothing while no control is nudged', async () => {
    const w = nudge()
    await nextTick()
    expect(w.find('[data-testid="training-nudge"]').exists()).toBe(false)
  })

  it('on a keyboard: the key big in the middle', async () => {
    hud.device = 'mouse'
    hud.training.nudge = 'crouch'
    const w = nudge()
    await nextTick()
    expect(w.find('[data-testid="nudge-centre"]').exists()).toBe(true)
    expect(w.find('[data-testid="nudge-arrow"]').exists()).toBe(false)
  })

  it('on touch: an arrow on the very button; the big glyph when it is not on screen', async () => {
    hud.device = 'touch'
    hud.training.nudge = 'crouch'
    const btn = document.createElement('button')
    btn.dataset.testid = NUDGE_BUTTON.crouch!
    btn.getBoundingClientRect = () => ({ left: 900, top: 500, right: 950, bottom: 550, width: 50, height: 50, x: 900, y: 500, toJSON: () => ({}) })
    document.body.appendChild(btn)
    const w = nudge()
    await nextTick()
    expect(w.find('[data-testid="nudge-arrow"]').exists()).toBe(true)
    btn.remove()
    hud.training.nudge = 'blade'
    await nextTick()
    await nextTick()
    expect(w.find('[data-testid="nudge-centre"]').exists()).toBe(true)
  })

  it('the weapon switch on a keyboard (#201 follow-up): Tab, 2 and 3; never the wheel (scoped it zooms)', async () => {
    hud.device = 'mouse'
    hud.training.nudge = 'weapon'
    const w = nudge()
    await nextTick()
    expect(w.find('[data-testid="nudge-weapon-2"]').exists()).toBe(true)
    expect(w.find('[data-testid="nudge-weapon-3"]').exists()).toBe(true)
    expect(w.find('.mouse-glyph').exists()).toBe(false)
  })

  it('a single key sits beside the mech, not over it (#201 follow-up: it hid the crouch and the gap)', async () => {
    hud.device = 'mouse'
    hud.training.nudge = 'crouch'
    const w = nudge()
    await nextTick()
    expect(w.find('[data-testid="nudge-centre"]').classes()).toContain('beside')
  })

  it('every nudged room control has its button', () => {
    for (const h of ['crouch', 'scope', 'rocket', 'blade', 'burn', 'decoy', 'rope', 'loot', 'weapon'] as const) expect(NUDGE_BUTTON[h], h).toBeTruthy()
  })
})
