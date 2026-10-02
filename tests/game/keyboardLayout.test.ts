// @vitest-environment jsdom
// Keyboard layout + key bindings (src/game/engine/keyBindings.ts, keyLabels.ts,
// input.ts): keys are PHYSICAL and rebindable; what they are CALLED follows
// the detected layout (the Keyboard API, else the keys the player types, else
// the browser language), or the layout the player picked with detection off.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIONS, DEFAULT_BINDINGS, actionForCode, bindKey, bindingsChanged, boundCode, codesFor, isBindable,
  primaryCode, resetBindings, __resetBindingsForTests
} from '@/game/engine/keyBindings'
import {
  activeLayout, actionKeyLabel, classify, guessFromLanguage, keyboard, keyLabel, observeKey,
  setAutoLayout, setManualLayout, __resetKeyboardForTests
} from '@/game/engine/keyLabels'
import { attachInput, createInput, type Input, type InputHandle } from '@/game/engine/input'

const press = (code: string, key: string) =>
  observeKey({ code, key, ctrlKey: false, altKey: false, metaKey: false })

beforeEach(() => {
  __resetBindingsForTests()
  __resetKeyboardForTests()
})

describe('key bindings', () => {
  it('defaults: WASD, arrows as alternates, every action bound', () => {
    expect(primaryCode('forward')).toBe('KeyW')
    expect(codesFor('forward')).toEqual(['KeyW', 'ArrowUp'])
    for (const a of ACTIONS) expect(codesFor(a).length, a).toBeGreaterThan(0)
    expect(actionForCode('KeyE')).toBe('act')
    expect(actionForCode('Escape')).toBeNull()
    expect(bindingsChanged()).toBe(false)
  })

  it('rebinding onto another action\'s key swaps them: nothing is left unbound', () => {
    expect(bindKey('forward', 'KeyE')).toBe(true)
    expect(primaryCode('forward')).toBe('KeyE')
    expect(primaryCode('act')).toBe('KeyW')
    expect(actionForCode('KeyE')).toBe('forward')
    expect(actionForCode('KeyW')).toBe('act')
    for (const a of ACTIONS) expect(codesFor(a).length, a).toBeGreaterThan(0)
  })

  it('a rebinding that takes an alternate removes it from its old action', () => {
    bindKey('decoy', 'ArrowUp')
    expect(codesFor('forward')).toEqual(['KeyW'])
    expect(actionForCode('ArrowUp')).toBe('decoy')
  })

  it('reserved keys are refused', () => {
    for (const c of ['Escape', 'F1', 'F2', 'MetaLeft', '']) {
      expect(isBindable(c), c).toBe(false)
      expect(bindKey('crouch', c)).toBe(false)
    }
    expect(primaryCode('crouch')).toBe('KeyC')
  })

  it('the HUD asks for a DEFAULT key and gets the key as bound now', () => {
    bindKey('act', 'KeyG')
    expect(boundCode('KeyE')).toBe('KeyG')
    expect(boundCode('KeyW')).toBe('KeyW')
    expect(boundCode('MouseRight')).toBe('MouseRight')
    expect(actionKeyLabel('KeyE')).toBe('G')
  })

  it('reset puts every default back', () => {
    bindKey('forward', 'KeyI')
    bindKey('crouch', 'KeyX')
    expect(bindingsChanged()).toBe(true)
    resetBindings()
    for (const a of ACTIONS) expect(primaryCode(a)).toBe(DEFAULT_BINDINGS[a][0])
    expect(bindingsChanged()).toBe(false)
  })
})

describe('layout detection', () => {
  it('telltale keys classify the layout', () => {
    expect(classify('KeyW', 'z')).toBe('azerty')
    expect(classify('KeyQ', 'a')).toBe('azerty')
    expect(classify('KeyY', 'z')).toBe('qwertz')
    expect(classify('KeyZ', 'y')).toBe('qwertz')
    expect(classify('KeyW', 'w')).toBe('qwerty')
    expect(classify('KeyE', 'e')).toBeNull()
  })

  it('the browser language is a first guess, with its exceptions', () => {
    expect(guessFromLanguage(['fr-FR'])).toBe('azerty')
    expect(guessFromLanguage(['fr-BE'])).toBe('azerty')
    expect(guessFromLanguage(['fr-CA'])).toBe('qwerty')
    expect(guessFromLanguage(['fr-CH'])).toBe('qwertz')
    expect(guessFromLanguage(['de-DE'])).toBe('qwertz')
    expect(guessFromLanguage(['de'])).toBe('qwertz')
    expect(guessFromLanguage(['en-US'])).toBe('qwerty')
    expect(guessFromLanguage([])).toBe('qwerty')
  })

  it('an AZERTY key press relabels the keys: KeyW reads Z, KeyA reads Q', () => {
    expect(keyLabel('KeyW')).toBe('W')
    press('KeyW', 'z')
    expect(keyboard.detected).toBe('azerty')
    expect(keyLabel('KeyW')).toBe('Z')
    expect(keyLabel('KeyA')).toBe('Q')
    expect(keyLabel('KeyQ')).toBe('A')
  })

  it('typing outranks the language guess', () => {
    keyboard.detected = 'azerty'
    keyboard.source = 'language'
    press('KeyW', 'w')
    expect(keyboard.detected).toBe('qwerty')
  })

  it('typing also overrides the layout map: the OS layout can switch after it was read', () => {
    keyboard.detected = 'qwerty'
    keyboard.source = 'map'
    press('KeyW', 'z')
    expect(keyboard.detected).toBe('azerty')
    expect(keyLabel('KeyA')).toBe('Q') // no mixed "Z A S D"
  })

  it('digits stay digits (AZERTY prints & é " unshifted)', () => {
    press('KeyW', 'z')
    expect(keyLabel('Digit1')).toBe('1')
    expect(keyLabel('Numpad2')).toBe('2')
  })

  it('auto-detect off: the picked layout names the keys, whatever was typed', () => {
    press('KeyW', 'z')
    setAutoLayout(false)
    setManualLayout('qwertz')
    expect(activeLayout.value).toBe('qwertz')
    expect(keyLabel('KeyW')).toBe('W')
    expect(keyLabel('KeyY')).toBe('Z')
    setManualLayout('qwerty')
    expect(keyLabel('KeyY')).toBe('Y')
  })
})

describe('input follows the bindings', () => {
  let surface: HTMLDivElement
  let input: Input
  let handle: InputHandle
  const key = (type: 'keydown' | 'keyup', code: string, k = '') =>
    window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true }))

  beforeEach(() => {
    surface = document.createElement('div')
    document.body.appendChild(surface)
    input = createInput()
    handle = attachInput(surface, input, { canLock: () => true })
  })
  afterEach(() => {
    handle.detach()
    surface.remove()
  })

  it('a rebound key drives the action, and the old key no longer does', () => {
    bindKey('act', 'KeyG')
    key('keydown', 'KeyG', 'g')
    expect(input.actQueued).toBe(true)
    input.actQueued = false
    key('keyup', 'KeyG')
    key('keydown', 'KeyE', 'e')
    expect(input.actQueued).toBe(false)
  })

  it('rebound movement moves', () => {
    bindKey('forward', 'KeyI')
    key('keydown', 'KeyI', 'i')
    expect(input.moveY).toBeGreaterThan(0)
    key('keyup', 'KeyI')
    expect(input.moveY).toBe(0)
  })

  it('Esc always pauses', () => {
    key('keydown', 'Escape', 'Escape')
    expect(input.pauseQueued).toBe(true)
  })

  it('a key press in the game teaches the layout', () => {
    key('keydown', 'KeyW', 'z')
    expect(keyLabel('KeyW')).toBe('Z')
  })
})
