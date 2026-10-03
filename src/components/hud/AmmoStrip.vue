<template lang="pug">
  //- What is left in the weapon in hand: rounds as pips, or the minigun's
  //- heat as a bar.
  div.ammo-strip(:class="[`w-${hud.weapon}`, { reloading: hud.reloading, hot: hud.overheated }]" data-testid="ammo")
    GameIcon.glyph(:name="hud.weapon")
    div.pips(v-if="hud.weapon !== 'minigun'" role="meter" :aria-label="t('hud.ammo')" aria-valuemin="0" :aria-valuemax="capacity" :aria-valuenow="hud.ammo")
      span.pip(v-for="n in capacity" :key="n" :class="{ full: n <= hud.ammo }")
    div.heat(v-else role="meter" :aria-label="t('hud.heat')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="heatNow")
      div.heat-fill(ref="heat")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, gun, hud } from '@/game/state/hud'
import { ROCKETS_PER_MISSION, SNIPER_MAG } from '@/game/sim/weapons'

const { t } = useI18n()
const capacity = computed(() => (hud.weapon === 'rocket' ? ROCKETS_PER_MISSION : SNIPER_MAG))
const heat = ref<HTMLElement | null>(null)
/** For the screen reader only: the bar itself is written by the ticker. */
const heatNow = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let last = -1
  off = addHudTicker(() => {
    const el = heat.value
    if (!el) { last = -1; return }
    const v = Math.round(gun.heat * 50) / 50
    if (v === last) return
    last = v
    el.style.transform = `scaleX(${v})`
    if (Math.abs(v * 100 - heatNow.value) >= 10) heatNow.value = Math.round(v * 100)
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.ammo-strip
  --pip: clamp(0.5rem, 2.2vmin, 0.8rem)
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.2vmin, 0.5rem)
  min-height: clamp(1.5rem, 5.5vmin, 2rem)
  padding: clamp(0.18rem, 0.8vmin, 0.3rem) clamp(0.45rem, 1.8vmin, 0.7rem)
  box-sizing: border-box
  border: var(--cm-rim-w) solid rgba(77, 232, 255, 0.7)
  border-radius: 999px
  background: var(--cm-gloss), var(--cm-surface-soft)
  box-shadow: var(--cm-sticker)
  color: var(--cm-cyan)
  &.w-minigun
    border-color: rgba(255, 210, 63, 0.6)
    color: var(--cm-warn)
  &.w-rocket
    border-color: rgba(255, 138, 61, 0.7)
    color: #ff8a3d
  &.hot
    border-color: var(--cm-danger)
    color: var(--cm-danger)
.glyph
  flex: none
  width: clamp(1rem, 4.2vmin, 1.5rem)
  height: clamp(1rem, 4.2vmin, 1.5rem)
.pips
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.pip
  flex: none
  width: calc(var(--pip) * 0.5)
  height: var(--pip)
  border-radius: 0.14rem
  background: rgba(246, 241, 255, 0.18)
  &.full
    background: currentColor
    box-shadow: 0 0 0.3rem currentColor
// Reloading: the empty pips run a light along the row.
.reloading .pip:not(.full)
  animation: ammo-load 0.6s ease-in-out infinite
  @for $i from 1 through 6
    &:nth-child(#{$i})
      animation-delay: #{$i * 0.08}s
.heat
  width: clamp(3.4rem, 15vmin, 5.6rem)
  height: calc(var(--pip) * 0.8)
  border-radius: 999px
  overflow: hidden
  background: rgba(246, 241, 255, 0.18)
.heat-fill
  width: 100%
  height: 100%
  border-radius: inherit
  background: linear-gradient(90deg, var(--cm-warn), #ff8a3d 60%, var(--cm-danger))
  transform: scaleX(0)
  transform-origin: left center

@keyframes ammo-load
  50%
    background: currentColor

@media (prefers-reduced-motion: reduce)
  .reloading .pip:not(.full)
    animation: none
</style>
