<template lang="pug">
  //- What is left in the weapon in hand: rounds as pips, or the minigun's
  //- heat as a bar. The unit frame's second row (#145). Running low and
  //- running dry are two states, told apart without a word: low turns the row
  //- amber with a half-empty magazine pulsing slowly beside it; dry turns it
  //- red, the magazine struck through and blinking fast.
  div.ammo-strip(:class="[weaponClass, { reloading: hud.reloading, hot: hud.overheated, dry: hud.dry, low: hud.ammoLow && !hud.dry, loss: flash === 'loss', gain: flash === 'gain' }]" data-testid="ammo")
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
    //- Low or out (#145): the warning glyph after the count.
    GameIcon.state(
      v-if="hud.dry || hud.ammoLow"
      :name="hud.dry ? 'ammo-out' : 'ammo-low'"
      role="img"
      :aria-label="t(hud.dry ? 'hud.ammoOut' : 'hud.ammoLow')"
      data-testid="ammo-state"
    )
    //- What a supply brought (#111): it rises out of the bar and fades.
    span.plus(v-if="plus > 0" :key="plusKey" aria-hidden="true") +{{ plus }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
const weaponClass = computed(() => 'w-' + hud.weapon)

// Feedback (#111): a red flash for every round gone, a green one (and the
// count) for every round a supply brings. A weapon swap shows nothing.
const flash = ref<'' | 'loss' | 'gain'>('')
const plus = ref(0)
const plusKey = ref(0)
let flashTimer: ReturnType<typeof setTimeout> | null = null
const total = (): number => Math.max(0, hud.ammo) + Math.max(0, hud.reserve)
let lastTotal = total()
let lastWeapon = hud.weapon
watch(() => [hud.ammo, hud.reserve, hud.weapon] as const, () => {
  const now = total()
  if (hud.weapon !== lastWeapon) { lastWeapon = hud.weapon; lastTotal = now; return }
  const d = now - lastTotal
  lastTotal = now
  if (d === 0) return
  flash.value = d > 0 ? 'gain' : 'loss'
  if (d > 0) { plus.value = d; plusKey.value++ }
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flash.value = ''; plus.value = 0 }, d > 0 ? 900 : 220)
})

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
onUnmounted(() => { off?.(); if (flashTimer) clearTimeout(flashTimer) })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.ammo-strip
  --pip: clamp(0.5rem, 2.2vmin, 0.8rem)
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.2vmin, 0.5rem)
  // Close under the health bar (#169).
  min-height: clamp(0.85rem, 3.4vmin, 1.25rem)
  box-sizing: border-box
  color: var(--cm-cyan)
  &.w-minigun
    color: #ffe08a
  &.w-rocket
    color: #ff8a3d
  &.hot
    color: var(--cm-danger)
  position: relative
  // A row of the unit frame (#145): no plate of its own; a state recolours it.
  // A round gone: a red flash. Rounds in: a green glow, a moment longer.
  &.loss
    filter: drop-shadow(0 0 0.35rem rgba(255, 64, 96, 0.95))
  &.gain
    filter: drop-shadow(0 0 0.45rem rgba(93, 255, 154, 0.95))
    animation: ammo-gain 0.9s ease-out
  // Running low (#145): amber, the warning glyph breathing slowly.
  &.low
    color: #ffa630
    .state
      animation: ammo-low-pulse 1.1s ease-in-out infinite
  // Nothing left to fire: the row blinks red until something is picked up.
  &.dry
    color: var(--cm-danger)
    animation: ammo-dry 0.5s steps(2) infinite
    .reserve
      color: var(--cm-danger)
.state
  flex: none
  width: clamp(1.05rem, 4.4vmin, 1.55rem)
  height: clamp(1.05rem, 4.4vmin, 1.55rem)
  filter: drop-shadow(0 0 0.3rem currentColor)
@keyframes ammo-low-pulse
  50%
    opacity: 0.35
.plus
  position: absolute
  right: 0.4rem
  bottom: 100%
  color: #5dff9a
  font-size: var(--cm-fs-s)
  font-weight: bold
  text-shadow: 0 0 0.4rem rgba(93, 255, 154, 0.9)
  pointer-events: none
  animation: ammo-plus 0.9s ease-out forwards
@keyframes ammo-plus
  from
    transform: translateY(0.4rem)
    opacity: 0
  20%
    opacity: 1
  to
    transform: translateY(-0.8rem)
    opacity: 0
@keyframes ammo-gain
  0%
    filter: brightness(1)
  25%
    filter: brightness(1.6)
  100%
    filter: brightness(1)
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
  overflow: hidden
.reload-fill
  width: 100%
  height: 100%
  background: currentColor
  box-shadow: 0 0 0.3rem currentColor
  transform: scaleX(0)
  transform-origin: left center
  +tech-fillbar()
.pip
  flex: none
  width: calc(var(--pip) * 0.5)
  height: var(--pip)
  background: rgba(246, 241, 255, 0.18)
  +tech-cut(0.12rem)
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
  overflow: hidden
.heat-fill
  width: 100%
  height: 100%
  background: linear-gradient(90deg, var(--cm-warn), #ff8a3d 60%, var(--cm-danger))
  transform: scaleX(0)
  transform-origin: left center
  +tech-fillbar()

@keyframes ammo-load
  50%
    background: currentColor

@keyframes ammo-dry
  50%
    opacity: 0.55

@media (prefers-reduced-motion: reduce)
  .reloading .pip:not(.full), .ammo-strip.dry, .ammo-strip.low .state
    animation: none
</style>
