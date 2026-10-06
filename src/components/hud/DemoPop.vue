<template lang="pug">
  //- The training hologram's button press (#114): its key (on a keyboard),
  //- the mouse button, or the button's picture (on touch) pops up over the
  //- hologram's head, rises and fades. Pinned by a HUD ticker.
  div.demo-pop(ref="el" aria-hidden="true")
    div.chip(v-if="hint && hud.device === 'mouse'" :key="seq")
      MouseGlyph.mouse(v-if="MOUSE[hint]" :lit="MOUSE[hint]")
      KeyCap(v-else :action="KEYS[hint] ?? 'act'")
    //- On touch (#160): a copy of the very button pressed, its shape and its
    //- colour; a gesture (the stick, a swipe, a hold) as the finger doing it.
    div.touch(v-else-if="hint" :key="seq")
      TouchButtonGlyph(v-if="HINT_BUTTON[hint]" :look="lookOf(HINT_BUTTON[hint] ?? 'strike', hud.weapon, hint)")
      FingerGlyph.finger(v-else :mode="FINGER[hint] ?? 'tap'")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import FingerGlyph from '@/components/hud/hints/FingerGlyph.vue'
import TouchButtonGlyph from '@/components/hud/hints/TouchButtonGlyph.vue'
import { HINT_BUTTON, HINT_GESTURE, lookOf } from '@/components/hud/touchLook'
import type { HintId } from '@/game/sim/coach'
import type { Action } from '@/game/engine/keyBindings'
import { addHudTicker, demoPop, hud } from '@/game/state/hud'

/** The key each control is pressed with (the player's own binding is lettered by KeyCap). */
const KEYS: Readonly<Record<string, Action>> = {
  move: 'forward', climb: 'forward', supply: 'forward', crouch: 'crouch', blade: 'act', decoy: 'decoy', hide: 'hide',
  grapple: 'grapple', sabotage: 'act', loot: 'act', jump: 'jump', rope: 'rope', burn: 'burn', weapon: 'cycle', sprint: 'sprint', goal: 'forward', rocket: 'weapon3'
}
/** The ones a mouse does. */
const MOUSE: Readonly<Record<string, 'move' | 'left' | 'right'>> = { look: 'move', scope: 'right', fire: 'left' }
const FINGER = HINT_GESTURE

const el = ref<HTMLElement | null>(null)
const hint = ref<HintId | ''>('')
const seq = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let shown = false
  off = addHudTicker(() => {
    const e = el.value
    if (!e) return
    if (demoPop.on !== shown) {
      shown = demoPop.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (demoPop.seq !== seq.value) { seq.value = demoPop.seq; hint.value = demoPop.hint as HintId }
    if (!shown) return
    e.style.left = `${(demoPop.x * 100).toFixed(2)}%`
    e.style.top = `${(demoPop.y * 100).toFixed(2)}%`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.demo-pop
  position: absolute
  translate: -50% -100%
  opacity: 0
  transition: opacity 120ms ease-out
  pointer-events: none
.chip
  display: flex
  align-items: center
  justify-content: center
  min-width: 2.2rem
  min-height: 2.2rem
  padding: 0.25rem
  color: var(--cm-cyan, #5fe9ff)
  animation: demo-pop 1.6s ease-out forwards
  +tech-plate(var(--cm-cyan), linear-gradient(180deg, rgba(43, 27, 92, 0.75), rgba(10, 5, 24, 0.65)), 0.45rem, var(--cm-edge))
// On touch the copy of the button is the chip itself, rising and fading the same way.
.touch
  animation: demo-pop 1.6s ease-out forwards
.finger
  --size: 2.8rem
.mouse
  width: 1.3rem
  height: 1.8rem
.icon
  width: 1.5rem
  height: 1.5rem
@keyframes demo-pop
  0%
    transform: translateY(0.6rem)
    opacity: 0
  12%
    opacity: 1
  70%
    opacity: 1
  100%
    transform: translateY(-2.4rem)
    opacity: 0
</style>
