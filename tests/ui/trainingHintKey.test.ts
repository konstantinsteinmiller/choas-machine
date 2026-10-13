// @vitest-environment jsdom
// A playtester read the decoy room's "Place a decoy to distract the guard…"
// and had no idea which key that was. On a keyboard, every room hint that
// names one thing to do carries that thing's key, lettered as this keyboard
// prints it; on touch there is no key to show.

import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { hud } from '@/game/state/hud'
import { LESSON_IDS } from '@/game/data/fortresses/training'
import TrainingHud from '@/components/hud/TrainingHud.vue'

const hudFor = () => mount(TrainingHud, {
  global: { plugins: [createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })] }
})

enableAutoUnmount(afterEach)

const inRoom = (lesson: string, device: 'mouse' | 'touch'): void => {
  hud.training.on = true
  hud.training.room = LESSON_IDS.indexOf(lesson as (typeof LESSON_IDS)[number])
  hud.training.done = hud.training.room
  hud.training.watching = false
  hud.device = device
}

describe('a room hint shows the key it is done with', () => {
  it('the decoy room: the decoy key before the words, on a keyboard', async () => {
    inRoom('decoy', 'mouse')
    const w = hudFor()
    await nextTick()
    const cap = w.find('[data-testid="decoy-hint"] .key-cap')
    expect(cap.exists()).toBe(true)
    expect(cap.attributes('data-action')).toBe('decoy')
    expect(w.find('[data-testid="decoy-hint"]').text()).toContain('Place a decoy')
  })

  it('each room that names one action: burn, disguise, hook, rope, crouch, jump', async () => {
    const want = { burn: 'burn', box: 'hide', hook: 'grapple', rope: 'rope', cover: 'crouch', jump: 'jump' }
    for (const [lesson, action] of Object.entries(want)) {
      inRoom(lesson, 'mouse')
      const w = hudFor()
      await nextTick()
      expect(w.find(`[data-testid="${lesson}-hint"] .key-cap`).attributes('data-action'), lesson).toBe(action)
      w.unmount()
    }
  })

  it('no key on touch', async () => {
    inRoom('decoy', 'touch')
    const w = hudFor()
    await nextTick()
    expect(w.find('[data-testid="decoy-hint"]').exists()).toBe(true)
    expect(w.find('[data-testid="decoy-hint"] .key-cap').exists()).toBe(false)
  })
})
