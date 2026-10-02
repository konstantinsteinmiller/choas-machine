// @vitest-environment jsdom
// Touch controls on a phone (src/game/engine/input.ts): a mouse is treated as
// a finger there and never turns the HUD into the desktop one, and the resting
// joystick grabs by its centre. jsdom has no PointerEvent, so pointer events
// are MouseEvents with the pointer fields laid on.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachInput, consumeEdges, createInput, touchFirst, HOLD_MS, type Input, type InputHandle } from '@/game/engine/input'

const PHONE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

let surface: HTMLDivElement
let input: Input
let handle: InputHandle
let clock = 0

const pointer = (type: string, x: number, y: number, pointerType = 'touch', pointerId = 1) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  Object.defineProperty(e, 'pointerId', { value: pointerId })
  surface.dispatchEvent(e)
}

const mount = () => {
  surface = document.createElement('div')
  // 800 × 400 surface at the origin.
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  document.body.appendChild(surface)
  input = createInput()
  clock = 1000
  handle = attachInput(surface, input, { canLock: () => true, now: () => clock })
}

afterEach(() => {
  handle.detach()
  surface.remove()
  vi.restoreAllMocks()
})

describe('on a phone', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(PHONE)
    mount()
  })

  it('is touch-first, and never asks to capture the mouse', () => {
    expect(touchFirst()).toBe(true)
    expect(input.device).toBe('touch')
    expect(input.lockRefused).toBe(true)
  })

  it('a mouse click and a key press leave the controls on touch', () => {
    surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    expect(input.device).toBe('touch')
    expect(input.moveY).toBeGreaterThan(0) // the keys still work
  })

  it('a mouse drag on the left works the stick like a finger', () => {
    pointer('pointerdown', 100, 300, 'mouse')
    pointer('pointermove', 150, 300, 'mouse')
    expect(input.joyActive).toBe(true)
    expect(input.moveX).toBeGreaterThan(0)
    pointer('pointerup', 150, 300, 'mouse')
    expect(input.joyActive).toBe(false)
  })
})

describe('the resting joystick', () => {
  beforeEach(() => {
    mount()
    input.joyHomeX = 104
    input.joyHomeY = 296
    input.joyHomeR = 76
  })

  it('a press on it grabs it by its centre, already pushing toward the finger', () => {
    pointer('pointerdown', 144, 296)
    expect(input.joyActive).toBe(true)
    expect(input.joyOriginX).toBe(104)
    expect(input.joyOriginY).toBe(296)
    expect(input.moveX).toBeGreaterThan(0.5)
  })

  it('a press elsewhere on the left still floats the stick under the thumb', () => {
    pointer('pointerdown', 250, 120)
    expect(input.joyActive).toBe(true)
    expect(input.joyOriginX).toBe(250)
    expect(input.moveX).toBe(0)
  })

  it('without a resting stick (radius 0) nothing is grabbed from afar', () => {
    input.joyHomeR = 0
    pointer('pointerdown', 144, 296)
    expect(input.joyOriginX).toBe(144)
  })
})

describe('the right-side gesture', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(PHONE)
    mount()
  })

  it('a quick tap is the contextual action', () => {
    pointer('pointerdown', 600, 200)
    clock += 90
    pointer('pointerup', 600, 200)
    expect(input.actQueued).toBe(true)
    expect(input.aimHeld).toBe(false)
    expect(input.lookDX).toBe(0)
  })

  it('a drag turns the camera and is never a tap or an aim', () => {
    pointer('pointerdown', 600, 200)
    pointer('pointermove', 640, 210)
    clock += HOLD_MS * 3
    handle.tick()
    expect(input.aimHeld).toBe(false)
    expect(input.lookDX).toBe(40)
    expect(input.lookDY).toBe(10)
    pointer('pointerup', 640, 210)
    expect(input.actQueued).toBe(false)
  })

  it('held still, the weapon comes up; the finger then aims; lifting fires', () => {
    pointer('pointerdown', 600, 200)
    expect(input.holdX).toBe(600)
    clock += HOLD_MS + 5
    handle.tick()
    expect(input.aimHeld).toBe(true)
    expect(input.aimPressed).toBe(true)
    consumeEdges(input)
    pointer('pointermove', 590, 215)
    expect(input.lookDX).toBe(-10)
    expect(input.lookDY).toBe(15)
    pointer('pointerup', 590, 215)
    expect(input.aimHeld).toBe(false)
    expect(input.aimReleased).toBe(true)
  })

  it('a slow press that is let go before the weapon is up does nothing', () => {
    pointer('pointerdown', 600, 200)
    clock += HOLD_MS - 20
    handle.tick()
    // Too long for a tap would be > TAP_MAX_MS; this one is still a tap.
    clock += 200
    pointer('pointerup', 600, 200)
    expect(input.aimReleased).toBe(false)
  })

  it('the stick and the aiming finger work together', () => {
    pointer('pointerdown', 100, 300, 'touch', 1)
    pointer('pointermove', 150, 300, 'touch', 1)
    pointer('pointerdown', 600, 200, 'touch', 2)
    clock += HOLD_MS + 5
    handle.tick()
    expect(input.joyActive).toBe(true)
    expect(input.moveX).toBeGreaterThan(0)
    expect(input.aimHeld).toBe(true)
    pointer('pointerup', 600, 200, 'touch', 2)
    expect(input.aimReleased).toBe(true)
    expect(input.joyActive).toBe(true)
  })

  it('a third finger does not steal the gesture', () => {
    pointer('pointerdown', 600, 200, 'touch', 2)
    pointer('pointerdown', 700, 100, 'touch', 3)
    pointer('pointerup', 700, 100, 'touch', 3)
    expect(input.actQueued).toBe(false)
  })
})

describe('on a desktop', () => {
  beforeEach(mount)

  it('is not touch-first: the mouse keeps the desktop controls', () => {
    expect(touchFirst()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
    expect(input.device).toBe('mouse')
  })

  it('a mouse pointer event is not read as a finger', () => {
    pointer('pointerdown', 100, 300, 'mouse')
    expect(input.joyActive).toBe(false)
  })
})
