// @vitest-environment jsdom
// #170: every dialog by keyboard alone. Tab and Shift+Tab walk its controls
// and wrap inside it, the arrows move between them, left/right change a tab
// row or a picker in place, the picker's list is walked and chosen from by
// keyboard, Esc closes the list before the dialog; and the game's own key
// handler leaves Tab and Space to the menu while one is open. By named keys
// only, so the same on every keyboard layout.

import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import FModal from '@/components/molecules/FModal.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import { keyCapture, listsOpen, menuKey, menuStep, ownsArrow } from '@/use/useMenuKeys'

enableAutoUnmount(afterEach)
afterEach(() => { document.body.innerHTML = ''; keyCapture.value = false; listsOpen.value = 0 })

const press = (key: string, code = key, shiftKey = false): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key, code, shiftKey, bubbles: true, cancelable: true })
  ;(document.activeElement ?? document.body).dispatchEvent(e)
  return e
}

const Menu = defineComponent({
  setup() {
    const open = ref(true)
    const tab = ref('a')
    const pick = ref('one')
    return () => h(FModal, {
      modelValue: open.value, 'onUpdate:modelValue': (v: boolean) => { open.value = v },
      tabs: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], activeTab: tab.value, 'onUpdate:activeTab': (v: string) => { tab.value = v }
    }, () => [
      h('button', { id: 'first' }, 'First'),
      h('input', { id: 'slider', type: 'range', min: 0, max: 10, value: 5 }),
      h(FSelect, { modelValue: pick.value, 'onUpdate:modelValue': (v: string) => { pick.value = v }, options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }] }),
      h('button', { id: 'last' }, 'Last'),
      h('output', { id: 'state' }, `${tab.value}:${pick.value}:${open.value}`)
    ])
  }
})

const mountMenu = async () => {
  const w = mount(Menu, { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  await nextTick()
  await nextTick()
  return w
}
const id = (): string => (document.activeElement as HTMLElement | null)?.id || (document.activeElement as HTMLElement | null)?.getAttribute('role') || (document.activeElement as HTMLElement | null)?.className || ''
const state = (): string => document.getElementById('state')?.textContent ?? ''

describe('menu keys are named keys, the same on every layout', () => {
  it('reads Tab and the arrows, never letters', () => {
    const k = (key: string, code = key, shiftKey = false) => menuKey({ key, code, shiftKey, altKey: false, ctrlKey: false, metaKey: false })
    expect(k('Tab')).toBe('next')
    expect(k('Tab', 'Tab', true)).toBe('prev')
    expect(k('ArrowDown')).toBe('down')
    // The numpad's arrows with Num Lock off.
    expect(k('ArrowUp', 'Numpad8')).toBe('up')
    // W on QWERTY is Z on AZERTY: neither moves a menu.
    expect(k('w', 'KeyW')).toBeNull()
    expect(k('z', 'KeyW')).toBeNull()
  })

  it('wraps round, and leaves a slider\'s, a tab row\'s and a picker\'s left/right to them', () => {
    const a = document.createElement('button')
    const b = document.createElement('input')
    b.type = 'range'
    const c = document.createElement('button')
    c.setAttribute('aria-haspopup', 'listbox')
    expect(menuStep([a, b, c], c, 'next')).toBe(a)
    expect(menuStep([a, b, c], a, 'prev')).toBe(c)
    expect(menuStep([a, b, c], b, 'down')).toBe(c)
    expect(menuStep([a, b, c], b, 'right')).toBeNull()
    expect(ownsArrow(c, 'left')).toBe(true)
    expect(ownsArrow(a, 'left')).toBe(false)
  })
})

describe('a dialog by keyboard (#170)', () => {
  it('takes the focus when it opens: its chosen tab', async () => {
    await mountMenu()
    expect(document.activeElement?.getAttribute('role')).toBe('tab')
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
  })

  it('Tab walks every control and wraps inside the dialog; Shift+Tab goes back', async () => {
    await mountMenu()
    const seen: string[] = []
    for (let i = 0; i < 7; i++) { press('Tab'); seen.push(id()) }
    // The chosen tab, the close button, then the content, then round again.
    expect(seen).toContain('first')
    expect(seen).toContain('slider')
    expect(seen).toContain('last')
    press('Tab', 'Tab', true)
    const back = id()
    press('Tab')
    press('Tab', 'Tab', true)
    expect(id()).toBe(back)
  })

  it('a Tab the dialog takes does not leave it to the browser', async () => {
    await mountMenu()
    expect(press('Tab').defaultPrevented).toBe(true)
  })

  it('left/right on the tab row change the tab and keep the focus on it', async () => {
    await mountMenu()
    press('ArrowRight')
    await nextTick()
    await nextTick()
    expect(state().startsWith('b:')).toBe(true)
    expect(document.activeElement?.textContent).toContain('B')
  })

  it('up/down move between controls; on a slider they move on, its left/right are its own', async () => {
    await mountMenu()
    ;(document.getElementById('first') as HTMLElement).focus()
    press('ArrowDown')
    expect(id()).toBe('slider')
    expect(press('ArrowRight').defaultPrevented).toBe(false)
    expect(id()).toBe('slider')
    press('ArrowDown')
    expect(document.activeElement?.getAttribute('aria-haspopup')).toBe('listbox')
  })

  it('left/right on a picker step its value in place', async () => {
    await mountMenu()
    ;(document.querySelector('[aria-haspopup="listbox"]') as HTMLElement).focus()
    press('ArrowRight')
    await nextTick()
    expect(state()).toContain(':two:')
    press('ArrowLeft')
    await nextTick()
    press('ArrowLeft')
    await nextTick()
    expect(state()).toContain(':three:')
  })

  it('a picker\'s list: opened, walked with the arrows, chosen with Enter; Esc shuts the list, not the dialog', async () => {
    await mountMenu()
    const trigger = document.querySelector('[aria-haspopup="listbox"]') as HTMLElement
    trigger.focus()
    trigger.click()
    await nextTick()
    await nextTick()
    await nextTick()
    expect(document.activeElement?.getAttribute('role'), 'focus in the open list').toBe('option')
    press('ArrowDown')
    press('Enter')
    await nextTick()
    expect(state()).toContain(':two:')
    expect(document.activeElement).toBe(trigger)
    trigger.click()
    await nextTick()
    await nextTick()
    press('Escape', 'Escape')
    await nextTick()
    expect(document.querySelector('[role="listbox"]'), 'the list is shut').toBeNull()
    expect(state().endsWith(':true'), 'the dialog stays: ' + state()).toBe(true)
    press('Escape', 'Escape')
    await nextTick()
    // Shut: its content is gone with it.
    expect(document.getElementById('state')).toBeNull()
  })

  it('while a key is being captured for a binding, Tab and the arrows are left alone', async () => {
    await mountMenu()
    keyCapture.value = true
    const at = document.activeElement
    expect(press('Tab').defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(at)
  })
})

describe('the game leaves a menu its keys (#170)', () => {
  it('its key handler stands aside while any dialog is open, so Tab and Space reach the menu', () => {
    const src = readFileSync(`${process.cwd()}/src/game/engine/input.ts`, 'utf8')
    const at = src.indexOf('const onKeyDown')
    const guard = src.indexOf('if (isAnyModalOpen.value) return', at)
    expect(guard).toBeGreaterThan(at)
    // Before anything is queued or prevented.
    expect(guard).toBeLessThan(src.indexOf('e.preventDefault()', at))
  })
})
