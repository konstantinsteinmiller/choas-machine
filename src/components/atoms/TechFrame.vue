<template lang="pug">
  //- The ornaments inside a panel's border (jam build): circuit-trace corner
  //- brackets with a hex bolt, a notched tab with lit pips on the top edge, a
  //- vent grille on the bottom, ruler ticks down the sides. Purely decoration:
  //- it sits over the panel's padding, never takes a click, and scales with
  //- the screen. The parent must be `position: relative`.
  div.tech-frame(aria-hidden="true" :class="`tone-${tone}`")
    svg.corner(v-for="c in CORNERS" :key="c" :class="c" viewBox="0 0 64 64")
      path.bracket(d="M4 40 V12 L12 4 H40")
      path.trace(d="M16 10 H30 L36 16 H50")
      path.trace(d="M10 16 V30 L16 36 V48")
      circle.node(cx="50" cy="16" r="2.4")
      circle.node(cx="16" cy="48" r="2.4")
      polygon.bolt(points="22,15.5 26,13 30,15.5 30,20.5 26,23 22,20.5")
      circle.bolt-core(cx="26" cy="18" r="1.4")
    svg.tab(viewBox="0 0 120 14" preserveAspectRatio="none")
      path.plate(d="M0 0 H120 L108 12 H12 Z")
      rect.pip(v-for="i in 3" :key="i" :x="44 + (i - 1) * 12" y="3.5" width="8" height="4" rx="1")
    svg.vent(viewBox="0 0 80 10")
      rect.slot(v-for="i in 6" :key="i" :x="4 + (i - 1) * 12.5" y="2" width="9" height="6" rx="2")
    div.ruler.left
    div.ruler.right
</template>

<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'cyan' | 'pink' | 'violet' }>(), { tone: 'cyan' })
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const
</script>

<style scoped lang="sass">
.tech-frame
  --tf-tone: var(--cm-cyan)
  --tf-hi: var(--cm-cyan-hi)
  --tf-size: clamp(1.4rem, 5.6vmin, 2.6rem)
  position: absolute
  inset: calc(var(--cm-rim-w, 3px) + 0.15rem)
  pointer-events: none
  z-index: 0
  &.tone-pink
    --tf-tone: var(--cm-pink)
    --tf-hi: var(--cm-pink-hi)
  &.tone-violet
    --tf-tone: var(--cm-violet)
    --tf-hi: var(--cm-lilac)

.corner
  position: absolute
  width: var(--tf-size)
  height: var(--tf-size)
  overflow: visible
  &.tl
    left: 0
    top: 0
  &.tr
    right: 0
    top: 0
    // A mirror, not a resize: one axis flipped.
    transform: scaleX(-1)
  &.bl
    left: 0
    bottom: 0
    transform: scaleY(-1)
  &.br
    right: 0
    bottom: 0
    transform: rotate(180deg)

.bracket
  fill: none
  stroke: var(--tf-hi)
  stroke-width: 3.2
  stroke-linejoin: round
  filter: drop-shadow(0 0 2px var(--tf-tone))
.trace
  fill: none
  stroke: var(--tf-tone)
  stroke-width: 1.4
  opacity: 0.65
.node
  fill: var(--tf-hi)
  filter: drop-shadow(0 0 2px var(--tf-tone))
.bolt
  fill: color-mix(in srgb, var(--tf-tone) 30%, #1a0f3a)
  stroke: var(--tf-hi)
  stroke-width: 1
.bolt-core
  fill: var(--tf-hi)

.tab
  position: absolute
  top: calc(var(--cm-rim-w, 3px) * -1 - 0.15rem)
  left: 50%
  translate: -50% 0
  width: clamp(4.5rem, 18vmin, 8rem)
  height: clamp(0.55rem, 1.8vmin, 0.85rem)
  .plate
    fill: color-mix(in srgb, var(--tf-tone) 45%, #1a0f3a)
    stroke: var(--tf-hi)
    stroke-width: 1
  .pip
    fill: var(--tf-hi)
    animation: tf-pip 2.4s ease-in-out infinite
    &:nth-child(3)
      animation-delay: 0.3s
    &:nth-child(4)
      animation-delay: 0.6s

.vent
  position: absolute
  bottom: 0.1rem
  left: 50%
  translate: -50% 0
  width: clamp(3rem, 11vmin, 5rem)
  height: clamp(0.4rem, 1.2vmin, 0.6rem)
  opacity: 0.55
  .slot
    fill: none
    stroke: var(--tf-tone)
    stroke-width: 1.2

.ruler
  position: absolute
  top: calc(var(--tf-size) + 0.3rem)
  bottom: calc(var(--tf-size) + 0.3rem)
  width: 0.35rem
  background: repeating-linear-gradient(180deg, var(--tf-tone) 0 1px, transparent 1px 0.55rem)
  opacity: 0.4
  &.left
    left: 0.05rem
  &.right
    right: 0.05rem

@keyframes tf-pip
  0%, 100%
    opacity: 0.35
  50%
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .tab .pip
    animation: none
</style>
