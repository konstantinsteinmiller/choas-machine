// @vitest-environment jsdom
// Desktop input (src/game/engine/input.ts): keys through the bindings, the
// captured mouse (move looks, right aims, left fires), and the unlocked
// fallback, where the mouse uses the touch gesture.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachInput, consumeEdges, createInput, cancelAim, HOLD_MS, type Input, type InputHandle } from '@/game/engine/input'
import { __resetBindingsForTests } from '@/game/engine/keyBindings'

let surface: HTMLDivElement
let input: Input
let handle: InputHandle
let clock = 0

const key = (type: 'keydown' | 'keyup', code: string): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
}
const mouse = (type: string, button: number, x = 400, y = 200, extra: Record<string, number> = {}): void => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: y })
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(e, k, { value: v })
  ;(type === 'mousedown' ? surface : type === 'mousemove' ? document : window).dispatchEvent(e)
}

beforeEach(() => {
  __resetBindingsForTests()
  clock = 1000
  surface = document.createElement('div')
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(surface)
  input = createInput()
  handle = attachInput(surface, input, { canLock: () => false, now: () => clock })
})

afterEach(() => {
  handle.detach()
  surface.remove()
})

describe('keys', () => {
  it('WASD moves, normalised on the diagonal; arrows turn', () => {
    key('keydown', 'KeyW')
    key('keydown', 'KeyD')
    expect(input.moveY).toBeCloseTo(Math.SQRT1_2)
    expect(input.moveX).toBeCloseTo(Math.SQRT1_2)
    key('keyup', 'KeyD')
    expect(input.moveX).toBe(0)
    expect(input.moveY).toBe(1)
    key('keydown', 'ArrowLeft')
    expect(input.turn).toBe(-1)
  })

  it('each action key queues its action once, until consumed', () => {
    key('keydown', 'KeyC')
    key('keydown', 'KeyE')
    key('keydown', 'KeyQ')
    key('keydown', 'KeyR')
    key('keydown', 'Digit2')
    key('keydown', 'Tab')
    expect(input).toMatchObject({
      crouchQueued: true, actQueued: true, decoyQueued: true, reloadQueued: true, weaponQueued: 2, cycleQueued: true
    })
    consumeEdges(input)
    expect(input).toMatchObject({
      crouchQueued: false, actQueued: false, decoyQueued: false, reloadQueued: false, weaponQueued: 0, cycleQueued: false
    })
  })

  it('a held key does not repeat its action', () => {
    key('keydown', 'KeyE')
    consumeEdges(input)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true }))
    expect(input.actQueued).toBe(false)
  })

  it('Esc and P pause', () => {
    key('keydown', 'Escape')
    expect(input.pauseQueued).toBe(true)
  })

  it('a key typed into a form field is text, not a game key', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }))
    expect(input.actQueued).toBe(false)
    field.remove()
  })

  it('losing the window lets go of everything', () => {
    key('keydown', 'KeyW')
    input.aimHeld = true
    input.fireHeld = true
    window.dispatchEvent(new Event('blur'))
    expect(input).toMatchObject({ moveY: 0, aimHeld: false, fireHeld: false, aimCancelled: true })
  })
})

describe('the captured mouse', () => {
  beforeEach(() => { input.locked = true })

  it('moving it looks, and a glitch-sized jump is dropped', () => {
    mouse('mousemove', 0, 0, 0, { movementX: 17, movementY: -4 })
    expect(input.lookDX).toBe(17)
    expect(input.lookDY).toBe(-4)
    mouse('mousemove', 0, 0, 0, { movementX: 900, movementY: 0 })
    expect(input.lookDX).toBe(17)
  })

  it('look deltas survive the step that clears the edges', () => {
    mouse('mousemove', 0, 0, 0, { movementX: 5, movementY: 5 })
    consumeEdges(input)
    expect(input.lookDX).toBe(5)
  })

  it('the right button holds the weapon up; letting go lowers it without a shot', () => {
    mouse('mousedown', 2)
    expect(input).toMatchObject({ aimHeld: true, aimPressed: true })
    consumeEdges(input)
    mouse('mouseup', 2)
    expect(input).toMatchObject({ aimHeld: false, aimReleased: false, aimCancelled: true })
  })

  it('the left button is the trigger, held or not', () => {
    mouse('mousedown', 0)
    expect(input).toMatchObject({ fireHeld: true, firePressed: true })
    consumeEdges(input)
    expect(input).toMatchObject({ fireHeld: true, firePressed: false })
    mouse('mouseup', 0)
    expect(input.fireHeld).toBe(false)
  })

  it('aiming and firing at once', () => {
    mouse('mousedown', 2)
    mouse('mousedown', 0)
    expect(input).toMatchObject({ aimHeld: true, fireHeld: true })
  })
})

describe('a mouse that cannot be captured uses the touch gesture', () => {
  beforeEach(() => { input.lockRefused = true })

  it('a quick click is the contextual action', () => {
    mouse('mousedown', 0, 500, 200)
    clock += 120
    mouse('mouseup', 0, 500, 200)
    expect(input.actQueued).toBe(true)
    expect(input.aimHeld).toBe(false)
  })

  it('a drag looks, and the travel before it was decided counts', () => {
    mouse('mousedown', 0, 500, 200)
    mouse('mousemove', 0, 530, 200)
    expect(input.lookDX).toBe(30)
    mouse('mousemove', 0, 540, 205)
    expect(input.lookDX).toBe(40)
    expect(input.lookDY).toBe(5)
    mouse('mouseup', 0, 540, 205)
    expect(input.actQueued).toBe(false)
  })

  it('a press held still raises the weapon; moving then aims; lifting fires', () => {
    mouse('mousedown', 0, 500, 200)
    clock += HOLD_MS / 2
    handle.tick()
    expect(input.aimHeld).toBe(false)
    expect(input.hold01).toBeCloseTo(0.5)
    clock += HOLD_MS
    handle.tick()
    expect(input).toMatchObject({ aimHeld: true, aimPressed: true })
    mouse('mousemove', 0, 512, 196)
    expect(input.lookDX).toBe(12)
    expect(input.lookDY).toBe(-4)
    consumeEdges(input)
    mouse('mouseup', 0, 512, 196)
    expect(input).toMatchObject({ aimHeld: false, aimReleased: true, aimCancelled: false })
  })

  it('the cancel chip lowers the weapon, and the lift then fires nothing', () => {
    mouse('mousedown', 0, 500, 200)
    clock += HOLD_MS + 10
    handle.tick()
    cancelAim(input)
    expect(input).toMatchObject({ aimHeld: false, aimCancelled: true })
    consumeEdges(input)
    mouse('mouseup', 0, 500, 200)
    expect(input.aimReleased).toBe(false)
  })
})
