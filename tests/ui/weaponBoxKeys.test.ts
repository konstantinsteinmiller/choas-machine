// @vitest-environment jsdom
// The weapon box on a desktop shows the number keys of the other two weapons
// (2 / 3 with the sniper in hand), not the mouse wheel: players read the
// keys on screen and press them.
import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import MissionHud from '@/components/hud/MissionHud.vue'
import { hud } from '@/game/state/hud'

enableAutoUnmount(afterEach)

describe('the weapon box keys', () => {
  it('shows 2 / 3 with the sniper, 1 / 3 with the minigun, and no wheel', async () => {
    hud.device = 'mouse'
    hud.weapon = 'sniper'
    const w = mount(MissionHud, { global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
    await nextTick()
    const keys = w.find('[data-testid="weapon-keys"]')
    expect(keys.exists()).toBe(true)
    expect(keys.text().replace(/\s/g, '')).toBe('2/3')
    expect(keys.find('svg').exists()).toBe(false)
    expect(keys.findAll('[data-action]').map(k => k.attributes('data-action'))).toEqual(['weapon2', 'weapon3'])
    hud.weapon = 'minigun'
    await nextTick()
    expect(w.find('[data-testid="weapon-keys"]').text().replace(/\s/g, '')).toBe('1/3')
  })
})
