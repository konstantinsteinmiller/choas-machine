<template lang="pug">
  //- The mech's armor: what the base is shooting at. It mends by itself out
  //- of the fire, so the bar is a thing to watch, not to hoard.
  div.armor-bar(
    role="meter"
    :aria-label="t('hud.armor')"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="now"
    :class="{ low: hud.armorLow }"
    data-testid="armor"
  )
    GameIcon.glyph(name="armor")
    div.track
      div.fill(ref="fill")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, hud, vital } from '@/game/state/hud'

const { t } = useI18n()
const fill = ref<HTMLElement | null>(null)
/** For the screen reader only: the bar itself is written by the ticker. */
const now = ref(100)
let off: (() => void) | null = null

onMounted(() => {
  let last = -1
  off = addHudTicker(() => {
    const el = fill.value
    if (!el) return
    const v = Math.round(vital.armor * 100) / 100
    if (v === last) return
    last = v
    el.style.transform = `scaleX(${v})`
    if (Math.abs(v * 100 - now.value) >= 5 || v === 0 || v === 1) now.value = Math.round(v * 100)
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.armor-bar
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.2vmin, 0.5rem)
  min-height: clamp(1.5rem, 5.5vmin, 2rem)
  padding: clamp(0.18rem, 0.8vmin, 0.3rem) clamp(0.45rem, 1.8vmin, 0.7rem)
  box-sizing: border-box
  color: var(--cm-lilac)
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 14%), 0.6rem)
  &.low
    border-color: var(--cm-danger)
    color: var(--cm-danger)
    animation: armor-low 0.5s ease-in-out infinite alternate
.glyph
  flex: none
  width: clamp(1rem, 4.2vmin, 1.5rem)
  height: clamp(1rem, 4.2vmin, 1.5rem)
.track
  width: clamp(4.2rem, 20vmin, 7.5rem)
  height: clamp(0.4rem, 1.7vmin, 0.62rem)
  overflow: hidden
.fill
  width: 100%
  height: 100%
  background: linear-gradient(90deg, var(--cm-violet), var(--cm-cyan))
  transform-origin: left center
  transition: transform 120ms ease-out
  +tech-fillbar()
  .low &
    background: var(--cm-danger)

@keyframes armor-low
  to
    filter: brightness(1.5)

@media (prefers-reduced-motion: reduce)
  .armor-bar.low
    animation: none
</style>
