<template lang="pug">
  //- The training's nudge (#186): a player at a shut door who has not done
  //- the room's thing yet (or, in the weapons room, has not switched weapons)
  //- is shown the very control, until it is used. On touch, a fat yellow arrow
  //- bounces on the button itself; on a keyboard, or when that button is not
  //- on screen right now, the key, the mouse button or the gesture sits big in
  //- the middle of the screen, bouncing.
  div.training-nudge(v-if="hint" aria-hidden="true" data-testid="training-nudge")
    //- The arrow's tip sits on the button's edge; it is turned to point at it.
    //- A yellow ring round the very button, so in a packed cluster there is no
    //- doubt which one the arrow means.
    div.ring(v-if="target" :style="ringStyle" data-testid="nudge-ring")
    div.arrow(v-if="target" :style="arrowStyle" data-testid="nudge-arrow")
      div.shaft
        svg(viewBox="0 0 48 64")
          path(d="M24 62L4 36h12V2h16v34h12z")
    div.centre(v-else data-testid="nudge-centre")
      HintGlyph.glyph(v-if="hint !== 'weapon' || hud.device !== 'mouse'" :hint="hint" :device="hud.device" :weapon="hud.weapon")
      span.glyph.weapon-keys(v-else)
        KeyCap(action="cycle")
        span.or /
        MouseGlyph(lit="wheel")
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { hud } from '@/game/state/hud'
import HintGlyph from '@/components/hud/hints/HintGlyph.vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import { NUDGE_BUTTON } from '@/components/hud/touchLook'

const hint = computed(() => hud.training.nudge || null)

/** The button's box on screen, re-read a few times a second (buttons come and go with the situation). */
const target = ref<DOMRect | null>(null)
let timer = 0
const find = (): void => {
  const id = hint.value && hud.device === 'touch' ? NUDGE_BUTTON[hint.value] : undefined
  const el = id ? document.querySelector(`[data-testid="${id}"]`) : null
  const r = el?.getBoundingClientRect()
  // Only a button that is wholly on screen is pointed at; otherwise the big glyph.
  const onScreen = r && r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
  target.value = onScreen ? r : null
}
watch(hint, (h) => {
  window.clearInterval(timer)
  if (!h) { target.value = null; return }
  find()
  timer = window.setInterval(find, 250)
}, { immediate: true })
onUnmounted(() => window.clearInterval(timer))

const ringStyle = computed(() => {
  const r = target.value!
  const pad = 5
  return { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` }
})

/** The other controls on screen, the arrow must not lie across (re-read with the target). */
const others = ref<DOMRect[]>([])
watch(target, () => {
  const id = hint.value ? NUDGE_BUTTON[hint.value] : undefined
  others.value = [...document.querySelectorAll('[data-testid^="btn-"], [data-testid="look-stick"]')]
    .filter(e => e.getAttribute('data-testid') !== id)
    .map(e => e.getBoundingClientRect())
    .filter(r => r.width > 0)
})

/** The shaft's length behind the tip, bounce included (`.shaft`: 1.33 × its width). */
const shaftWidth = (): number => Math.min(96, Math.max(57.6, 0.16 * Math.min(window.innerWidth, window.innerHeight)))

/**
 * Where the arrow comes from: from the middle of the screen if that way is
 * clear, else the nearest angle that is — the whole arrow on screen, and not
 * lying across any other control (the thumb cluster is packed: from straight
 * left the arrow to crouch lay over the decoy). Its tip stops on the rim.
 */
const arrowStyle = computed(() => {
  const r = target.value!
  const W = window.innerWidth
  const H = window.innerHeight
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const base = Math.atan2(H / 2 - cy, W / 2 - cx)
  const rim = Math.min(r.width, r.height) / 2 + 4
  const w = shaftWidth()
  const len = w * 1.33 + 16
  const clear = (a: number): boolean => {
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const px = cx + ux * (rim + len * t)
      const py = cy + uy * (rim + len * t)
      if (px < w / 2 || px > W - w / 2 || py < w / 2 || py > H - w / 2) return false
      if (t > 0.05 && others.value.some(o => px > o.left - w * 0.3 && px < o.right + w * 0.3 && py > o.top - w * 0.3 && py < o.bottom + w * 0.3)) return false
    }
    return true
  }
  let from = base
  for (const d of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120]) {
    const a = base + (d * Math.PI) / 180
    if (clear(a)) { from = a; break }
  }
  // The arrow is drawn pointing down (+y); turned clockwise by θ it points along -from.
  const vx = -Math.cos(from)
  const vy = -Math.sin(from)
  return { left: `${cx - vx * rim}px`, top: `${cy - vy * rim}px`, '--angle': `${Math.atan2(-vx, vy)}rad` }
})
</script>

<style scoped lang="sass">
.training-nudge
  position: absolute
  inset: 0
  pointer-events: none
  z-index: 6
// A point on the button's edge, turned toward the button; the shaft hangs
// above it with its tip on the point and bounces away and back.
.arrow
  position: fixed
  width: 0
  height: 0
  rotate: var(--angle)
.shaft
  // Big and fat (#186 follow-up): it must not be missed.
  --w: clamp(3.6rem, 16vmin, 6rem)
  position: absolute
  width: var(--w)
  height: calc(var(--w) * 1.33)
  left: calc(var(--w) * -0.5)
  bottom: 0
  animation: nudge-bounce 0.8s ease-in-out infinite
  svg
    display: block
    width: 100%
    height: 100%
    overflow: visible
  path
    fill: #ffd23f
    stroke: #3a2600
    stroke-width: 3
    stroke-linejoin: round
    filter: drop-shadow(0 0 0.4rem rgba(255, 210, 63, 0.85))
.ring
  position: fixed
  box-sizing: border-box
  border-radius: 50%
  border: 0.3rem solid #ffd23f
  box-shadow: 0 0 0.9rem rgba(255, 210, 63, 0.9), inset 0 0 0.6rem rgba(255, 210, 63, 0.6)
  animation: nudge-ring 0.8s ease-in-out infinite
@keyframes nudge-ring
  50%
    opacity: 0.45
.centre
  position: absolute
  left: 50%
  // In the player's face, but below the door ahead (where the hologram
  // shows the way through): over the mech's legs, not the doorway.
  top: 72%
  translate: -50% -50%
  display: grid
  place-items: center
  padding: 0.6em 0.9em
  border-radius: 0.8rem
  background: rgba(21, 12, 43, 0.6)
  box-shadow: 0 0 0 0.2rem #ffd23f, 0 0 1.4rem rgba(255, 210, 63, 0.6)
  font-size: clamp(1.6rem, 6vmin, 2.6rem)
  animation: nudge-pop 0.9s ease-in-out infinite
// The key in the player's face (#186 follow-up): their own key, big and fat.
.glyph
  font-size: inherit
  :deep(.key-cap)
    min-width: clamp(4.6rem, 20vmin, 8.5rem)
    height: clamp(4.6rem, 20vmin, 8.5rem)
    font-size: clamp(2.4rem, 10vmin, 4.6rem)
    font-weight: 800
    --plate-edge: #ffd23f
  :deep(.mouse-glyph)
    width: clamp(3rem, 13vmin, 5rem)
    height: clamp(4.2rem, 18vmin, 7rem)
  :deep(.touch-button-glyph), :deep(.finger-glyph)
    --size: clamp(4.6rem, 20vmin, 8.5rem)
.weapon-keys
  display: inline-flex
  align-items: center
  gap: 0.35em
.or
  color: #ffd23f
  font-weight: 700
@keyframes nudge-bounce
  0%, 100%
    translate: 0 0
  50%
    translate: 0 -0.9rem
// An attention bounce: up and back, never bigger (no control is sized by scale).
@keyframes nudge-pop
  0%, 100%
    translate: -50% -50%
  50%
    translate: -50% calc(-50% - 0.7rem)
@media (prefers-reduced-motion: reduce)
  .shaft, .centre, .ring
    animation: none
</style>
