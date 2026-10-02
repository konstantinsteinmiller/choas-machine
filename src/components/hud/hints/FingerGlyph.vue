<template lang="pug">
  //- A fingertip doing the gesture: dragging the stick, swiping to look,
  //- holding to aim, letting go to fire.
  div.finger-glyph(:class="mode" aria-hidden="true")
    //- What the hold fills while the finger stays put.
    svg.ring(v-if="mode === 'hold' || mode === 'release'" viewBox="0 0 40 40")
      circle.track(cx="20" cy="20" r="17")
      circle.fill(cx="20" cy="20" r="17")
    div.tip
      svg(viewBox="0 0 32 44")
        path(d="M10 42V20l-3 3a3 3 0 0 1-4-4l7-9V7a5 5 0 0 1 10 0v9l7 2a4 4 0 0 1 3 4v8a12 12 0 0 1-12 12z")
</template>

<script setup lang="ts">
defineProps<{ mode: 'drag' | 'swipe' | 'hold' | 'release' | 'push' }>()
</script>

<style scoped lang="sass">
.finger-glyph
  --size: clamp(3rem, 15vmin, 5rem)
  position: relative
  width: var(--size)
  height: var(--size)
.tip
  position: absolute
  left: 50%
  top: 50%
  width: 46%
  height: 64%
  margin: -12% 0 0 -18%
  svg
    display: block
    width: 100%
    height: 100%
  path
    fill: var(--cm-text)
    stroke: var(--cm-ink)
    stroke-width: 2.4
    stroke-linejoin: round
.ring
  position: absolute
  inset: 0
  rotate: -90deg
  circle
    fill: none
    stroke-width: 2.5
  .track
    stroke: rgba(246, 241, 255, 0.3)
  .fill
    stroke: var(--cm-pink)
    stroke-linecap: round
    stroke-dasharray: 106.9
    stroke-dashoffset: 106.9

// The stick: round and round.
.drag .tip
  animation: finger-circle 1.8s linear infinite
// The camera: side to side.
.swipe .tip
  animation: finger-swipe 1.6s ease-in-out infinite
// The stick pushed forward: toward the ladder, onto the cable.
.push .tip
  animation: finger-push 1.2s ease-in-out infinite
// Aim: the finger rests and the ring closes.
.hold .fill
  animation: finger-fill 1.6s ease-in-out infinite
// Fire: the ring is full, and the finger comes off.
.release .fill
  stroke-dashoffset: 0
.release .tip
  animation: finger-lift 1.1s ease-in-out infinite

@keyframes finger-circle
  0%
    translate: 0 -28%
  25%
    translate: 28% 0
  50%
    translate: 0 28%
  75%
    translate: -28% 0
  100%
    translate: 0 -28%
@keyframes finger-swipe
  0%, 100%
    translate: -45% 0
  50%
    translate: 45% 0
@keyframes finger-push
  0%, 100%
    translate: 0 20%
  50%
    translate: 0 -35%
@keyframes finger-fill
  0%
    stroke-dashoffset: 106.9
  70%, 100%
    stroke-dashoffset: 0
@keyframes finger-lift
  0%, 30%
    translate: 0 0
    opacity: 1
  80%, 100%
    translate: 12% -45%
    opacity: 0.25

@media (prefers-reduced-motion: reduce)
  .tip, .fill
    animation: none
</style>
