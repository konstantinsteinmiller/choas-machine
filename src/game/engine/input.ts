/**
 * ─── Input → intents ─────────────────────────────────────────────────────────
 *
 * Raw pointer / keyboard events are folded into ONE mutable `Input` record the
 * sim reads once per step. Nothing here knows about guards or the HUD — the
 * sim decides what an action MEANS (a tap near a guard's back is a stab, by a
 * ladder nothing); this layer only reports what the hands did.
 *
 * Touch (GDD 5):
 *   • LEFT ~45 % of the screen: a floating joystick spawns under the thumb.
 *     A faint resting stick always sits low on the left (`joyHome*`, placed
 *     by the HUD): a press on it grabs the stick at its centre, so a player
 *     who never discovers "drag anywhere" still finds the movement control.
 *   • RIGHT side, one gesture decided by what the finger DOES, never at the
 *     press:
 *       – it travels            → a look drag (the camera turns);
 *       – it lifts quickly      → a tap: the contextual action (`actQueued`);
 *       – it stays put          → after `HOLD_MS` the weapon comes up
 *                                 (`aimHeld`); moving the finger then aims,
 *                                 and lifting it fires (`aimReleased`).
 *     The HUD's cancel chip lowers the weapon without the shot.
 *   • HUD buttons write straight into the record (`crouchQueued`, …).
 *   • On a phone or tablet (`touchFirst`) the device stays TOUCH whatever
 *     arrives: a mouse is treated as a finger (no capture, no mouse hints) and
 *     a keyboard only adds its keys. The touch HUD never swaps out mid-game.
 *
 * Desktop — the mouse is CAPTURED (pointer lock):
 *   • The first click on the scene captures the mouse (that click does nothing
 *     else). Moving the mouse looks; the right button holds the weapon up, the
 *     left button fires.
 *   • WASD moves (↑ / ↓ too), ← / → turn, C crouches, E acts, Q drops a decoy,
 *     1 / 2 / 3 draw a weapon, Tab draws the next one, R reloads.
 *   • Esc releases the capture (the browser owns that key while it is
 *     captured); the scene treats a lost capture as "pause".
 *   • Where the capture is refused (a sandboxed embed, an old browser), the
 *     mouse falls back to the touch model: drag to look, hold to aim.
 *
 * Mouse buttons are read from MOUSE events, not pointer events: a second
 * button pressed while the first is held (fire while aiming) arrives as a
 * `pointermove`, never as a `pointerdown`, by the Pointer Events spec.
 */

import { mobileCheck } from '@/utils/function'
import { actionForCode, codesFor, type Action } from './keyBindings'
import { observeKey } from './keyLabels'

export interface Input {
  // Movement (joystick or keys), x = strafe right, y = forward. |v| ≤ 1.
  moveX: number
  moveY: number
  /** Keyboard turning (← / →): −1..1, + = turn right. */
  turn: number
  /** Accumulated look delta in pixels since last consume. */
  lookDX: number
  lookDY: number
  /** The weapon is up: a touch held still on the right side, or the right
   *  mouse button. */
  aimHeld: boolean
  aimPressed: boolean
  /** The aim ended by letting go. On touch this is the shot. */
  aimReleased: boolean
  /** The aim ended WITHOUT a shot (the cancel chip, a lost capture). */
  aimCancelled: boolean
  /** The trigger: the left mouse button. Touch has none; it fires on release. */
  fireHeld: boolean
  firePressed: boolean
  /** The contextual action: a tap on the right side, or the act key. */
  actQueued: boolean
  /** Throw the grappling hook, or take it back. */
  grappleQueued: boolean
  crouchQueued: boolean
  /** The hide box, toggled. */
  hideQueued: boolean
  decoyQueued: boolean
  reloadQueued: boolean
  /** Draw this weapon: 1 sniper, 2 minigun, 3 rockets. */
  weaponQueued: 0 | 1 | 2 | 3
  /** Draw the next weapon. */
  cycleQueued: boolean
  /** Wheel notches this step: −1 up (zoom in), +1 down. Off the scope, a notch is a weapon change. */
  wheelQueued: number
  pauseQueued: boolean
  /** Any fresh press on the scene this step — a touch, a mouse button, a key
   *  (not a modifier or F-key on its own). A cutscene's skip. */
  anyPressed: boolean
  // Joystick visual state (read by the HUD)
  joyActive: boolean
  joyOriginX: number
  joyOriginY: number
  joyX: number
  joyY: number
  /** The resting stick's centre and grab radius (surface px); 0 radius = none. */
  joyHomeX: number
  joyHomeY: number
  joyHomeR: number
  /** The stick's travel in CSS px (half the drawn ring); set by the HUD. */
  joyRadius: number
  /** Where the right-side finger is, while it is down (surface px): the HUD
   *  draws the hold ring there. */
  holdX: number
  holdY: number
  /** 0 … 1 through the hold that raises the weapon; 0 when no finger is down. */
  hold01: number
  /** True once the player has provided any real input (onboarding, Poki gate). */
  touched: boolean
  /** Sprint: the key is down, or the touch chip is switched on. */
  sprintHeld: boolean
  /** Last input device family, for control hints. */
  device: 'touch' | 'mouse'
  /** Desktop: the mouse is captured — movement looks, the buttons aim and fire. */
  locked: boolean
  /** The capture is refused here (or unsupported): the mouse drags to look. */
  lockRefused: boolean
}

/** Best first guess before any pointer event arrives, so the very first
 *  control hint on a phone already names the touch controls. */
const guessDevice = (): Input['device'] => {
  if (typeof navigator !== 'undefined' && mobileCheck()) return 'touch'
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'
}

/**
 * A phone or tablet: the touch controls are THE controls here, whatever input
 * arrives. The UA check covers phones; `pointer: coarse` with touch points
 * covers an iPad asking for the desktop site. A touch-screen laptop (a fine
 * primary pointer) stays a desktop.
 */
export const touchFirst = (): boolean => {
  if (typeof navigator === 'undefined') return false
  if (mobileCheck()) return true
  return (navigator.maxTouchPoints ?? 0) > 0 &&
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

const lockSupported = (): boolean =>
  typeof document !== 'undefined' && 'pointerLockElement' in document &&
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.requestPointerLock === 'function'

export const createInput = (): Input => ({
  moveX: 0, moveY: 0, turn: 0, lookDX: 0, lookDY: 0,
  aimHeld: false, aimPressed: false, aimReleased: false, aimCancelled: false, fireHeld: false, firePressed: false,
  sprintHeld: false,
  actQueued: false, grappleQueued: false, crouchQueued: false, hideQueued: false, decoyQueued: false, reloadQueued: false, weaponQueued: 0, cycleQueued: false, wheelQueued: 0,
  pauseQueued: false, anyPressed: false,
  joyActive: false, joyOriginX: 0, joyOriginY: 0, joyX: 0, joyY: 0, joyHomeX: 0, joyHomeY: 0, joyHomeR: 0, joyRadius: 56,
  holdX: 0, holdY: 0, hold01: 0,
  // A phone never captures the mouse: there, a mouse is a finger.
  touched: false, device: guessDevice(), locked: false, lockRefused: !lockSupported() || touchFirst()
})

/**
 * Reset the one-shot edges after the sim consumed them.
 *
 * NOT the look deltas: those are applied by the mission's RENDER, which runs
 * after this every frame and zeroes them itself. Clearing them here would
 * throw the drag away on every frame that ran a logic step — at 60 Hz nearly
 * all of them — and the camera would only move on the odd step-less frame.
 */
export const consumeEdges = (i: Input): void => {
  i.aimPressed = false
  i.aimReleased = false
  i.aimCancelled = false
  i.firePressed = false
  i.actQueued = false
  i.grappleQueued = false
  i.crouchQueued = false
  i.hideQueued = false
  i.decoyQueued = false
  i.reloadQueued = false
  i.weaponQueued = 0
  i.cycleQueued = false
  i.wheelQueued = 0
  i.pauseQueued = false
  i.anyPressed = false
}

/** Lower the weapon without the shot (the HUD's cancel chip). */
export const cancelAim = (i: Input): void => {
  if (!i.aimHeld) return
  i.aimHeld = false
  i.aimCancelled = true
  i.hold01 = 0
}

export interface InputOptions {
  /** Whether capturing the mouse makes sense right now (a mission in play,
   *  nothing on top of it). Read on every click. */
  canLock?: () => boolean
  /** The capture was lost without the game asking (Esc, a system dialog). */
  onLockLost?: () => void
  /** Every capture change: taken, or ended (`asked` = the game released it). */
  onLockChange?: (locked: boolean, asked: boolean) => void
  /** A clock in ms; tests pass their own. */
  now?: () => number
}

/** A right-side press that lifts within this, having barely moved, is a tap. */
export const TAP_MAX_MS = 260
const TAP_MAX_MOVE = 14
/** A press held this long, having barely moved, raises the weapon. */
export const HOLD_MS = 220
/** A press that travels this far before the hold completes is a look drag. */
const DRAG_TO_LOOK_MOUSE = 10
const DRAG_TO_LOOK_TOUCH = 16
/** One captured mouse event moving further than this is a platform glitch
 *  (Chrome and Firefox both emit the odd huge `movementX` right after the
 *  capture engages or the window regains focus) — dropped, not applied. */
const LOOK_SPIKE = 280
/** A refused capture this soon after the player released one is the browser's
 *  re-capture cooldown, not a refusal of the feature. */
const RELOCK_COOLDOWN_MS = 2500
/** Keys that are never "a press" for a skip: modifiers, and F1 / F2 (help,
 *  mute), which have their own jobs. */
const NOT_A_PRESS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'F1', 'F2'])

// ─── Pointer lock (module state: there is one document) ─────────────────────

let lockEl: HTMLElement | null = null
let releasing = false
let lastUnlockAt = -1e9
let lastLockAt = -1e9
/** The pending request rode a real gesture, and not the post-release
 *  cooldown — so a refusal of it means the platform refuses captures. */
let requestCounts = false

/** The mouse is captured by the game right now. */
export const isPointerLocked = (): boolean =>
  typeof document !== 'undefined' && !!lockEl && document.pointerLockElement === lockEl

/** The capture ended within the last `ms` (so an Esc keydown that arrives
 *  with it is the release, not a second press). */
export const unlockedRecently = (ms = 400): boolean => performance.now() - lastUnlockAt < ms

/** Hand the mouse back (a modal, the base, an ad). Not treated as "lost". */
export const releasePointerLock = (): void => {
  if (!isPointerLocked()) return
  releasing = true
  document.exitPointerLock()
}

/**
 * Capture the mouse, if the platform allows it. Must run inside a user
 * gesture (a click or a key press, or within a few seconds of one). A refusal
 * right after the player released the capture is Chrome's cooldown, so only
 * a refusal with no recent release switches the mouse to drag-look for good.
 */
export const requestPointerLock = (input: Input): void => {
  const el = lockEl
  if (!el || input.lockRefused || isPointerLocked()) return
  // Without a live gesture (e.g. the pause menu closed by Esc, which is not
  // one) the browser says no by rule; do not ask, and do not count it.
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  if (activation && !activation.isActive) return
  requestCounts = performance.now() - lastUnlockAt >= RELOCK_COOLDOWN_MS
  const refuse = () => {
    if (requestCounts && !isPointerLocked()) input.lockRefused = true
  }
  try {
    const r = (el.requestPointerLock as (o?: unknown) => Promise<void> | void).call(el)
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(refuse)
  } catch {
    refuse()
  }
}

export interface InputHandle {
  detach: () => void
  /** Advance the hold timer. Called once per frame by the scene: a finger
   *  resting still emits no events, so the hold cannot be an event. */
  tick: () => void
}

export const attachInput = (surface: HTMLElement, input: Input, opts: InputOptions = {}): InputHandle => {
  const keys = new Set<string>()
  const now = opts.now ?? (() => performance.now())
  let joyId: number | null = null
  let lookId: number | null = null
  let gStartX = 0
  let gStartY = 0
  let gLastX = 0
  let gLastY = 0
  let gStartT = 0
  /** What the right-side press has become: undecided, a look drag, or an aim. */
  let gesture: 'none' | 'pending' | 'look' | 'aim' = 'none'
  let gestureMouse = false
  let skipNextLook = false
  /** Last touch press: a touch also emits compatibility mouse events. */
  let lastTouchAt = -1e9
  /** Phone / tablet: a mouse is a finger, and the device never turns 'mouse'. */
  const touchOnly = touchFirst()
  /** Pointer events this build reads as touch (see `touchOnly`). */
  const asTouch = (e: PointerEvent) => e.pointerType !== 'mouse' || touchOnly
  lockEl = surface

  const rect = () => surface.getBoundingClientRect()
  /** Any key bound to the action is down (see `keyBindings.ts`). */
  const held = (a: Action): boolean => codesFor(a).some(c => keys.has(c))

  const updateKeysMove = () => {
    if (input.joyActive) return
    let x = 0
    let y = 0
    if (held('left')) x -= 1
    if (held('right')) x += 1
    if (held('forward')) y += 1
    if (held('back')) y -= 1
    // ← / → TURN: the keyboard-only way to look around (a trackpad player
    // who never finds the drag still has one).
    input.turn = (held('turnRight') ? 1 : 0) - (held('turnLeft') ? 1 : 0)
    input.sprintHeld = held('sprint')
    const l = Math.hypot(x, y)
    input.moveX = l > 0 ? x / l : 0
    input.moveY = l > 0 ? y / l : 0
  }

  const raise = (): void => {
    gesture = 'aim'
    input.aimHeld = true
    input.aimPressed = true
    input.hold01 = 1
  }

  // ── The right-side gesture shared by touch and the unlocked mouse ──
  const gestureDown = (x: number, y: number, mouse: boolean) => {
    gStartX = gLastX = x
    gStartY = gLastY = y
    gStartT = now()
    gesture = 'pending'
    gestureMouse = mouse
    input.holdX = x
    input.holdY = y
    input.hold01 = 0
  }
  const gestureMove = (x: number, y: number) => {
    if (gesture === 'none') return
    const dx = x - gLastX
    const dy = y - gLastY
    gLastX = x
    gLastY = y
    input.holdX = x
    input.holdY = y
    if (gesture === 'pending') {
      if (Math.hypot(x - gStartX, y - gStartY) <= (gestureMouse ? DRAG_TO_LOOK_MOUSE : DRAG_TO_LOOK_TOUCH)) return
      // It travels: a look. The travel so far counts, so the view does not
      // lag the finger.
      gesture = 'look'
      input.hold01 = 0
      input.lookDX += x - gStartX
      input.lookDY += y - gStartY
      return
    }
    // A look drag turns the camera; an aiming finger moves the reticle.
    input.lookDX += dx
    input.lookDY += dy
  }
  const gestureUp = () => {
    const g = gesture
    gesture = 'none'
    input.hold01 = 0
    if (g === 'aim') {
      // The weapon may already be down (the cancel chip): then nothing fires.
      if (input.aimHeld) {
        input.aimHeld = false
        input.aimReleased = true
      }
    } else if (g === 'pending' && now() - gStartT < TAP_MAX_MS && Math.hypot(gLastX - gStartX, gLastY - gStartY) < TAP_MAX_MOVE) {
      input.actQueued = true
    }
  }
  /** A finger held still sends no events: the scene's frame drives the hold. */
  const tick = (): void => {
    if (gesture !== 'pending') return
    const k = (now() - gStartT) / HOLD_MS
    input.hold01 = Math.min(1, Math.max(0, k))
    if (k >= 1) raise()
  }

  // ── Touch / pen: pointer events ──
  const onDown = (e: PointerEvent) => {
    if (!asTouch(e)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    input.touched = true
    input.device = 'touch'
    input.anyPressed = true
    lastTouchAt = now()
    const r = rect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const leftZone = x < r.width * 0.45
    const onHome = input.joyHomeR > 0 && Math.hypot(x - input.joyHomeX, y - input.joyHomeY) <= input.joyHomeR
    if ((leftZone || onHome) && joyId === null) {
      joyId = e.pointerId
      input.joyActive = true
      // On the resting stick: grab it by its centre, so the first touch is
      // already a push in the finger's direction. Anywhere else: float.
      input.joyOriginX = onHome ? input.joyHomeX : x
      input.joyOriginY = onHome ? input.joyHomeY : y
      input.joyX = 0
      input.joyY = 0
      if (onHome) stickTo(x, y)
      try { surface.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      e.preventDefault()
      return
    }
    if (lookId !== null) return
    lookId = e.pointerId
    gestureDown(x, y, false)
    try { surface.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    e.preventDefault()
  }

  /** Point the stick at a finger position (surface px). */
  const stickTo = (x: number, y: number) => {
    let dx = x - input.joyOriginX
    let dy = y - input.joyOriginY
    const l = Math.hypot(dx, dy)
    // Drag the origin along when the thumb overshoots, so the stick never
    // "sticks" at the rim — the floating-stick feel.
    const joyR = Math.max(24, input.joyRadius)
    if (l > joyR) {
      const k = (l - joyR) / l
      input.joyOriginX += dx * k
      input.joyOriginY += dy * k
      dx = x - input.joyOriginX
      dy = y - input.joyOriginY
    }
    input.joyX = dx / joyR
    input.joyY = dy / joyR
    const mag = Math.min(1, Math.hypot(input.joyX, input.joyY))
    // Small dead zone, then an ease so fine steps are possible.
    const dz = 0.12
    const eased = mag < dz ? 0 : Math.pow((mag - dz) / (1 - dz), 1.25)
    const nx = mag > 0 ? input.joyX / mag : 0
    const ny = mag > 0 ? input.joyY / mag : 0
    input.moveX = nx * eased
    input.moveY = -ny * eased
  }

  const onMove = (e: PointerEvent) => {
    if (!asTouch(e)) return
    const r = rect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (e.pointerId === joyId) {
      stickTo(x, y)
      e.preventDefault()
      return
    }
    if (e.pointerId === lookId) {
      gestureMove(x, y)
      e.preventDefault()
    }
  }

  const onUp = (e: PointerEvent) => {
    if (!asTouch(e)) return
    if (e.pointerId === joyId) {
      joyId = null
      input.joyActive = false
      // The sprint switch lets go with the stick.
      input.sprintHeld = false
      input.moveX = 0
      input.moveY = 0
      updateKeysMove()
      return
    }
    if (e.pointerId === lookId) {
      gestureUp()
      lookId = null
    }
  }

  // ── Mouse: captured, or, where refused, the touch gesture ──
  const onMouseDown = (e: MouseEvent) => {
    if (touchOnly || now() - lastTouchAt < 900) return
    input.touched = true
    input.device = 'mouse'
    input.anyPressed = true
    if (e.button === 2) {
      // The press is the game's: no context menu, no in-page gesture. A free
      // mouse is captured by this press too, as by a left click.
      e.preventDefault()
      if (!input.locked && !input.lockRefused && (opts.canLock?.() ?? false)) requestPointerLock(input)
      if (!input.aimHeld) {
        input.aimHeld = true
        input.aimPressed = true
      }
      return
    }
    if (e.button !== 0) return
    if (input.locked) {
      input.fireHeld = true
      input.firePressed = true
      return
    }
    // Not captured yet: this click captures (and does nothing else).
    if (!input.lockRefused && (opts.canLock?.() ?? false)) {
      requestPointerLock(input)
      return
    }
    const r = rect()
    gestureDown(e.clientX - r.left, e.clientY - r.top, true)
  }

  const onMouseMove = (e: MouseEvent) => {
    if (touchOnly) return
    if (input.locked) {
      if (skipNextLook) { skipNextLook = false; return }
      const dx = e.movementX || 0
      const dy = e.movementY || 0
      if (Math.abs(dx) > LOOK_SPIKE || Math.abs(dy) > LOOK_SPIKE) return
      input.lookDX += dx
      input.lookDY += dy
      return
    }
    if (gesture === 'none' || !gestureMouse) return
    const r = rect()
    gestureMove(e.clientX - r.left, e.clientY - r.top)
  }

  const onMouseUp = (e: MouseEvent) => {
    if (touchOnly) return
    if (e.button === 2) {
      if (input.aimHeld) {
        input.aimHeld = false
        // On a desktop the trigger is the left button: letting the right one
        // go lowers the weapon and fires nothing.
        input.aimCancelled = true
      }
      return
    }
    if (e.button !== 0) return
    if (input.locked) {
      input.fireHeld = false
      return
    }
    if (gesture !== 'none' && gestureMouse) gestureUp()
  }

  const onLockChange = () => {
    const locked = document.pointerLockElement === surface
    if (locked === input.locked) return
    input.locked = locked
    if (locked) {
      lastLockAt = performance.now()
      skipNextLook = true
      gesture = 'none'
      input.device = 'mouse'
      opts.onLockChange?.(true, false)
      return
    }
    lastUnlockAt = performance.now()
    // The weapon comes down with the capture, and the trigger lets go.
    input.fireHeld = false
    cancelAim(input)
    const asked = releasing
    releasing = false
    opts.onLockChange?.(false, asked)
    if (!asked) opts.onLockLost?.()
  }

  const onLockError = () => {
    if (requestCounts && !isPointerLocked()) input.lockRefused = true
  }

  const onWheel = (e: WheelEvent) => {
    if (touchOnly || !input.locked) return
    if (e.deltaY !== 0) input.wheelQueued += Math.sign(e.deltaY)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    input.touched = true
    if (!touchOnly) input.device = 'mouse'
    // Every real key teaches the layout its label (`keyLabels.ts`).
    if (!touchOnly) observeKey(e)
    if (e.repeat && keys.has(e.code)) return
    keys.add(e.code)
    if (!e.repeat && !NOT_A_PRESS.has(e.code)) input.anyPressed = true
    // Through the bindings (`keyBindings.ts`): physical keys, rebindable.
    switch (actionForCode(e.code)) {
      case 'crouch':
        input.crouchQueued = true
        break
      case 'hide':
        input.hideQueued = true
        break
      case 'pause':
        input.pauseQueued = true
        break
      case 'act':
        input.actQueued = true
        break
      case 'grapple':
        input.grappleQueued = true
        break
      case 'decoy':
        input.decoyQueued = true
        break
      case 'reload':
        input.reloadQueued = true
        break
      case 'weapon1':
        input.weaponQueued = 1
        break
      case 'weapon2':
        input.weaponQueued = 2
        break
      case 'weapon3':
        input.weaponQueued = 3
        break
      case 'cycle':
        input.cycleQueued = true
        // Tab would walk the browser's focus out of the game.
        e.preventDefault()
        break
      case null:
        // Esc always pauses (it also ends a mouse capture).
        if (e.code === 'Escape') input.pauseQueued = true
        break
    }
    // Space scrolls the page and presses a focused button; it is neither here.
    if (e.code === 'Space') e.preventDefault()
    updateKeysMove()
  }

  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code)
    updateKeysMove()
  }

  const onBlur = () => {
    keys.clear()
    input.moveX = 0
    input.moveY = 0
    input.turn = 0
    input.sprintHeld = false
    input.fireHeld = false
    cancelAim(input)
    input.joyActive = false
    joyId = null
    lookId = null
    gesture = 'none'
    input.hold01 = 0
  }

  const onContext = (e: Event) => e.preventDefault()

  surface.addEventListener('pointerdown', onDown, { passive: false })
  surface.addEventListener('pointermove', onMove, { passive: false })
  surface.addEventListener('pointerup', onUp)
  surface.addEventListener('pointercancel', onUp)
  surface.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  surface.addEventListener('contextmenu', onContext)
  surface.addEventListener('wheel', onWheel, { passive: true })
  document.addEventListener('pointerlockchange', onLockChange)
  document.addEventListener('pointerlockerror', onLockError)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  const detach = (): void => {
    releasePointerLock()
    if (lockEl === surface) lockEl = null
    surface.removeEventListener('pointerdown', onDown)
    surface.removeEventListener('pointermove', onMove)
    surface.removeEventListener('pointerup', onUp)
    surface.removeEventListener('pointercancel', onUp)
    surface.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    surface.removeEventListener('contextmenu', onContext)
    surface.removeEventListener('wheel', onWheel)
    document.removeEventListener('pointerlockchange', onLockChange)
    document.removeEventListener('pointerlockerror', onLockError)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  }
  return { detach, tick }
}

/** When the capture last engaged (ms, `performance.now()`); for tests / QA. */
export const lastPointerLockAt = (): number => lastLockAt
