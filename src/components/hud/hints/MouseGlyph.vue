<template lang="pug">
  //- A mouse, with the part to use lit: a button, or the whole body moving.
  svg.mouse-glyph(:class="lit" viewBox="0 0 40 56" aria-hidden="true")
    rect.body(x="6" y="4" width="28" height="48" rx="14")
    path.left(d="M6 22V18a14 14 0 0 1 13-14v18z")
    path.right(d="M34 22V18A14 14 0 0 0 21 4v18z")
    path.seam(d="M6 22h28M20 4v18")
    g.arrows(v-if="lit === 'move'")
      path(d="M-1 30l-5 4 5 4zM41 30l5 4-5 4z")
    //- The wheel, rolled (#186: the weapon switch).
    g(v-if="lit === 'wheel'")
      rect.wheel(x="17.5" y="8" width="5" height="11" rx="2.5")
      path.roll(d="M20 -6l-4 5h8zM20 33l-4-5h8z")
</template>

<script setup lang="ts">
defineProps<{ lit: 'move' | 'left' | 'right' | 'wheel' }>()
</script>

<style scoped lang="sass">
.mouse-glyph
  display: block
  width: clamp(1.6rem, 6vmin, 2.4rem)
  height: clamp(2.2rem, 8.4vmin, 3.4rem)
  overflow: visible
.body
  fill: var(--cm-glass)
  stroke: var(--cm-cyan)
  stroke-width: 2.5
.seam
  fill: none
  stroke: var(--cm-cyan)
  stroke-width: 2
.left, .right
  fill: transparent
.left .left, .right .right
  fill: var(--cm-pink)
  animation: mouse-press 0.9s ease-in-out infinite
.arrows, .roll
  fill: var(--cm-pink)
.wheel
  fill: var(--cm-pink)
  stroke: var(--cm-ink)
  stroke-width: 1
.roll
  animation: mouse-press 0.9s ease-in-out infinite
.move
  animation: mouse-slide 1.4s ease-in-out infinite

@keyframes mouse-press
  50%
    fill: var(--cm-pink-deep)
@keyframes mouse-slide
  0%, 100%
    translate: -0.35rem 0
  50%
    translate: 0.35rem 0

@media (prefers-reduced-motion: reduce)
  .move, .left .left, .right .right
    animation: none
</style>
