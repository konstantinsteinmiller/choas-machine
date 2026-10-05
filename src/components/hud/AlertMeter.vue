<template lang="pug">
  //- The base's Alert Level: five segments that light as the garrison grows
  //- sure of an intruder. The last one is full alert, and never goes out.
  div.alert-meter(
    role="meter"
    :aria-label="t('hud.alert')"
    aria-valuemin="0"
    aria-valuemax="5"
    :aria-valuenow="hud.alert"
    :class="{ chaos: hud.chaos, watched: hud.watched && !hud.chaos, quiet: hud.alert === 0 }"
    data-testid="alert-meter"
  )
    //- The eye shuts in a thicket (hidden) and dims in shadow.
    GameIcon.eye(name="eye" :class="{ dim: hud.concealed === 1, shut: hud.concealed === 2 }")
    div.segments
      span.seg(v-for="n in 5" :key="n" :class="{ lit: n <= hud.alert }" :data-n="n")
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { hud } from '@/game/state/hud'

const { t } = useI18n()
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.eye.dim
  opacity: 0.55
.eye.shut
  opacity: 0.35
  color: #7dffb0
  // A squint: the eye cut to a slit.
  clip-path: inset(34% 0 34% 0)
  transition: clip-path 160ms ease-out
.alert-meter
  --seg-w: clamp(0.85rem, 4vmin, 1.5rem)
  --seg-h: clamp(0.45rem, 1.9vmin, 0.7rem)
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.2vmin, 0.5rem)
  min-height: clamp(1.6rem, 6vmin, 2.2rem)
  padding: clamp(0.2rem, 0.9vmin, 0.35rem) clamp(0.45rem, 1.8vmin, 0.7rem)
  box-sizing: border-box
  color: var(--cm-cyan)
  transition: border-color 200ms ease-out, color 200ms ease-out, opacity 300ms ease-out
  +tech-plate(var(--cm-cyan), tech-fill(var(--cm-cyan), 12%), 0.6rem)
  &.quiet
    opacity: 0.72
  &.watched
    border-color: var(--cm-warn)
    color: var(--cm-warn)
    animation: alert-throb 0.5s ease-in-out infinite alternate
  &.chaos
    border-color: var(--cm-danger)
    color: var(--cm-danger)
    box-shadow: var(--cm-sticker), 0 0 0.9rem rgba(255, 59, 92, 0.6)
.eye
  flex: none
  width: clamp(1rem, 4.2vmin, 1.5rem)
  height: clamp(1rem, 4.2vmin, 1.5rem)
.segments
  display: flex
  gap: clamp(0.14rem, 0.6vmin, 0.25rem)
.seg
  flex: none
  width: var(--seg-w)
  height: var(--seg-h)
  box-sizing: border-box
  background: rgba(246, 241, 255, 0.16)
  transition: background-color 160ms ease-out, box-shadow 160ms ease-out
  +tech-cut(0.18rem)
  &.lit
    background: var(--cm-cyan)
    box-shadow: 0 0 0.4rem rgba(77, 232, 255, 0.8)
  &.lit[data-n="2"]
    background: #b8f06a
    box-shadow: 0 0 0.4rem rgba(184, 240, 106, 0.8)
  &.lit[data-n="3"]
    background: var(--cm-warn)
    box-shadow: 0 0 0.4rem rgba(255, 210, 63, 0.8)
  &.lit[data-n="4"]
    background: #ff8a3d
    box-shadow: 0 0 0.4rem rgba(255, 138, 61, 0.8)
  .chaos &.lit
    background: var(--cm-danger)
    box-shadow: 0 0 0.5rem rgba(255, 59, 92, 0.9)
    animation: alert-throb 0.45s ease-in-out infinite alternate

@keyframes alert-throb
  from
    filter: brightness(1)
  to
    filter: brightness(1.45)

@media (prefers-reduced-motion: reduce)
  .alert-meter.watched, .chaos .seg.lit
    animation: none
</style>
