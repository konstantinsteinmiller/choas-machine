<template lang="pug">
  //- Before a new player's first scene, the intro: a browser lets sound start
  //- only after a gesture, and the intro opens on its score. Anywhere on the
  //- screen, or any key, starts it.
  button.tap-start(
    v-if="flow.tapGate"
    type="button"
    data-testid="tap-to-start"
    @pointerdown.prevent.stop
    @pointerup.prevent.stop="go"
    @click.prevent.stop="go"
  )
    span.tap-card
      GameIcon.tap-glyph(name="play")
      span.tap-label {{ t(hud.device === 'touch' ? 'hud.tapToStart' : 'hud.clickToStart') }}
</template>

<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { flow, tapToStart } from '@/game/flow'
import { hud } from '@/game/state/hud'
import { sfx } from '@/game/audio/sfx'

const { t } = useI18n()

const go = (): void => {
  if (!flow.tapGate) return
  tapToStart()
  sfx('uiClick')
}

// Any key starts it too (a keyboard player need not reach for the mouse).
const onKey = (e: KeyboardEvent): void => {
  if (!flow.tapGate || e.repeat) return
  e.preventDefault()
  e.stopPropagation()
  go()
}
watch(() => flow.tapGate, (up) => {
  if (up) window.addEventListener('keydown', onKey, true)
  else window.removeEventListener('keydown', onKey, true)
}, { immediate: true })
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.tap-start
  position: absolute
  inset: 0
  z-index: 45
  display: grid
  place-items: center
  padding: 1rem
  border: 0
  background: radial-gradient(ellipse at 50% 50%, rgba(10, 5, 24, 0.35) 0%, rgba(10, 5, 24, 0.82) 100%)
  color: var(--cm-text)
  cursor: pointer
  touch-action: manipulation
  animation: tap-in 0.4s ease-out both
.tap-card
  display: inline-flex
  align-items: center
  gap: 0.6em
  max-width: 100%
  padding: 0.65em 1.3em
  +tech-plate(rgba(255, 79, 182, 0.9), rgba(21, 12, 43, 0.82), 0.6rem, var(--cm-edge))
  animation: tap-pulse 1.4s ease-in-out infinite
.tap-glyph
  flex: none
  width: clamp(1.6rem, 6vmin, 2.6rem)
  height: clamp(1.6rem, 6vmin, 2.6rem)
  color: #ff8fd0
  filter: drop-shadow(0 0 0.5rem rgba(255, 79, 182, 0.8))
.tap-label
  font-size: clamp(1.1rem, 4.6vmin, 2rem)
  letter-spacing: 0.12em
  text-transform: uppercase
  text-align: center
@keyframes tap-in
  from
    opacity: 0
@keyframes tap-pulse
  0%, 100%
    opacity: 1
    filter: drop-shadow(0 0 0 rgba(255, 79, 182, 0))
  50%
    opacity: 0.82
    filter: drop-shadow(0 0 0.9rem rgba(255, 79, 182, 0.75))
@media (prefers-reduced-motion: reduce)
  .tap-start, .tap-card
    animation: none
</style>
