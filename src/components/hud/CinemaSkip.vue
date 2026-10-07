<template lang="pug">
  //- A story scene is playing (#100): a skip button you can see (the mouse
  //- is free during a scene, #175), and Space held for a second and a half
  //- does the same, its ring filling round the key.
  div.cinema-hud(v-if="hud.phase === 'cinema'")
    //- The intro's closing still (#184): darkened at the edges, and named as
    //- what is coming, locked; it must not read as the next level starting.
    div.still-frame(v-if="hud.cineStill" data-testid="cinema-still")
      div.still-card
        GameIcon.still-lock(name="lock")
        span.still-name {{ t(`fortress.${hud.cineStill}`) }}
    div.cinema-skip
      HoldSkipButton(:active="hud.phase === 'cinema'" :keys="hud.device === 'mouse'" testid="btn-cinema-skip" @skip="skipCinema")
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import HoldSkipButton from '@/components/hud/HoldSkipButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { hud } from '@/game/state/hud'
import { skipCinema } from '@/game/flow'

const { t } = useI18n()
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.cinema-hud
  position: absolute
  inset: 0
  pointer-events: none
.still-frame
  position: absolute
  inset: 0
  display: flex
  align-items: flex-end
  justify-content: flex-start
  padding: clamp(1.6rem, 9vmin, 4.5rem) clamp(1rem, 5vw, 3rem)
  // Darkened at the edges: a look through the lens, not the game's own camera.
  background: radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(10, 6, 22, 0.72) 100%)
  animation: still-in 0.6s ease-out both
.still-card
  display: inline-flex
  align-items: center
  gap: 0.55em
  padding: 0.4em 0.8em
  margin-bottom: clamp(2rem, 8vmin, 4rem)
  +tech-plate(rgba(255, 130, 90, 0.8), rgba(21, 12, 43, 0.78), 0.5rem, var(--cm-edge))
  color: var(--cm-text)
  animation: card-in 0.7s 0.3s ease-out both
.still-lock
  width: 1.3em
  height: 1.3em
  color: #ffb27a
.still-name
  font-size: clamp(1.2rem, 4.5vmin, 2.2rem)
  letter-spacing: 0.08em
  text-transform: uppercase
@keyframes still-in
  from
    opacity: 0
@keyframes card-in
  from
    opacity: 0
    transform: translateX(-1.5rem)
@media (prefers-reduced-motion: reduce)
  .still-frame, .still-card
    animation: none
.cinema-skip
  position: absolute
  right: max(1rem, env(safe-area-inset-right))
  bottom: calc(clamp(1.6rem, 9vmin, 4.5rem) + 0.75rem)
  pointer-events: auto
</style>
