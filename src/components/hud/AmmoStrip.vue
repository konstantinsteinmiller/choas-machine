<template lang="pug">
  //- What is left in the weapon in hand: rounds as pips, or the minigun's
  //- heat as a bar.
  div.ammo-strip(:class="[`w-${hud.weapon}`, { reloading: hud.reloading, hot: hud.overheated, dry: hud.dry }]" data-testid="ammo")
    GameIcon.glyph(:name="hud.weapon")
    div.load(v-if="hud.weapon !== 'minigun'")
      div.pips(role="meter" :aria-label="t('hud.ammo')" aria-valuemin="0" :aria-valuemax="capacity" :aria-valuenow="hud.ammo")
        span.pip(v-for="n in capacity" :key="n" :class="{ full: n <= hud.ammo }")
      //- Reloading (#84): a bar fills under the pips.
      div.reload(v-show="hud.reloading" role="progressbar" :aria-label="t('hud.reloading')")
        div.reload-fill(ref="reload")
    div.heat(v-else role="meter" :aria-label="t('hud.heat')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="heatNow")
      div.heat-fill(ref="heat")
    //- What is carried besides (#76): the rifle's reserve, the mini-gun's belt.
    span.reserve(v-if="hud.reserve >= 0" :aria-label="t('hud.reserve', { n: hud.reserve })") {{ hud.reserve }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { addHudTicker, gun, hud } from '@/game/state/hud'
import { SNIPER_MAG } from '@/game/sim/weapons'

const { t } = useI18n()
const capacity = computed(() => Math.max(1, hud.ammoMax || SNIPER_MAG))
const heat = ref<HTMLElement | null>(null)
const reload = ref<HTMLElement | null>(null)
/** For the screen reader only: the bar itself is written by the ticker. */
const heatNow = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let last = -1
  let lastLoad = -1
  off = addHudTicker(() => {
    const bar = reload.value
    if (bar) {
      const r = Math.round(gun.reload * 60) / 60
      if (r !== lastLoad) {
        lastLoad = r
        bar.style.transform = `scaleX(${r})`
      }
    }
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
  // Nothing left to fire: the strip blinks red until something is picked up.
  &.dry
    border-color: var(--cm-danger)
    color: var(--cm-danger)
    animation: ammo-dry 0.8s steps(2) infinite
.reserve
  font-size: var(--cm-fs-s)
  font-variant-numeric: tabular-nums
  color: var(--cm-text)
  opacity: 0.85
.glyph
  flex: none
  width: clamp(1rem, 4.2vmin, 1.5rem)
  height: clamp(1rem, 4.2vmin, 1.5rem)
.load
  display: flex
  flex-direction: column
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.pips
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.reload
  height: clamp(0.18rem, 0.7vmin, 0.28rem)
  border-radius: 999px
  overflow: hidden
  background: rgba(246, 241, 255, 0.18)
.reload-fill
  width: 100%
  height: 100%
  border-radius: inherit
  background: currentColor
  box-shadow: 0 0 0.3rem currentColor
  transform: scaleX(0)
  transform-origin: left center
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
  @for $i from 1 through 12
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

@keyframes ammo-dry
  50%
    opacity: 0.55

@media (prefers-reduced-motion: reduce)
  .reloading .pip:not(.full), .ammo-strip.dry
    animation: none
</style>
