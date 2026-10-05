<template lang="pug">
  //- Between scenes (the fortress → the Command Base, a retry): the old scene
  //- is frozen under this veil while the next one is built.
  Transition(name="veil")
    div.loading-veil(v-if="flow.loading")
      div.bar(role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(flow.loadProgress * 100)")
        div.lit
          div.fill(:style="{ transform: `scaleX(${Math.max(0.04, flow.loadProgress).toFixed(3)})` }")
</template>

<script setup lang="ts">
import { flow } from '@/game/flow'
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.loading-veil
  position: absolute
  inset: 0
  z-index: 60
  display: flex
  align-items: center
  justify-content: center
  background: radial-gradient(circle at 50% 45%, rgba(61, 42, 128, 0.92) 0%, rgba(21, 12, 43, 0.97) 70%)
  // It takes every press: nothing under it is live.
  pointer-events: auto
  touch-action: none
.bar
  position: relative
  width: clamp(9rem, 46vmin, 20rem)
  height: clamp(0.75rem, 2.6vmin, 1.1rem)
  box-sizing: border-box
  overflow: hidden
  box-shadow: var(--cm-glow-cyan)
  transform: skewX(-12deg)
  +tech-track(var(--cm-cyan))
// The fill scales, so the cut that clears the track's strokes is on a still
// box round it (a scaled cut would squash).
.lit
  height: 100%
  +tech-track-fill()
.fill
  width: 100%
  height: 100%
  background: linear-gradient(#ffe3f4 0%, #ff8fd2 35%, #ff4fb6 62%, #a91d70 100%)
  transform-origin: left center
  transition: transform 260ms cubic-bezier(0.2, 0.7, 0.3, 1)

.veil-enter-active
  transition: opacity 140ms ease-out
.veil-leave-active
  transition: opacity 320ms ease-in
  // The next scene is live: a veil fading off it takes no presses. (Its fade
  // can stall for a second while that scene's first frames compile, and it
  // ate the Command Base's first tap.)
  pointer-events: none
.veil-enter-from, .veil-leave-to
  opacity: 0
</style>
