// @vitest-environment jsdom
// #202: every pull on an empty weapon answers twice: a dry "out of stock"
// click-clack (the `dryFire` event voices `dry`) and a cartoon "No ammo!"
// that wobbles in under the aim point and fades.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import { emit } from '@/game/bus'
import { LANGUAGES } from '@/utils/enums'
import Reticle from '@/components/hud/Reticle.vue'

enableAutoUnmount(afterEach)
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const reticle = () => mount(Reticle, {
  attachTo: document.body,
  global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] }
})

describe('the "No ammo!" pop (#202)', () => {
  it('shows nothing until the trigger is pulled on nothing', async () => {
    const w = reticle()
    await nextTick()
    expect(w.find('[data-testid="no-ammo"]').exists()).toBe(false)
  })

  it('pops the translated caption on a dry pull, then fades it away', async () => {
    const w = reticle()
    emit('dryFire', {})
    await nextTick()
    const pop = w.find('[data-testid="no-ammo"]')
    expect(pop.exists()).toBe(true)
    expect(pop.text()).toBe(en.hud.noAmmo)
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(w.find('[data-testid="no-ammo"]').exists()).toBe(false)
  })

  it('replays on every pull: a new pull is a new element, and keeps it up', async () => {
    const w = reticle()
    emit('dryFire', {})
    await nextTick()
    const first = w.find('[data-testid="no-ammo"]').element
    vi.advanceTimersByTime(600)
    emit('dryFire', {})
    await nextTick()
    const second = w.find('[data-testid="no-ammo"]').element
    expect(second).not.toBe(first)
    vi.advanceTimersByTime(600)
    await nextTick()
    expect(w.find('[data-testid="no-ammo"]').exists()).toBe(true)
  })

  it('is short and translated in every shipped language', async () => {
    expect(en.hud.noAmmo).toBe('No ammo!')
    for (const code of LANGUAGES) {
      const mod = await import(`../../src/i18n/locales/${code}.ts`)
      const s: string = mod.default.hud.noAmmo
      expect(s, code).toBeTruthy()
      expect(s.length, code).toBeLessThanOrEqual(20)
      if (code !== 'en') expect(s, code).not.toBe(en.hud.noAmmo)
    }
  })
})
