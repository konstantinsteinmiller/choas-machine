<template lang="pug">
  //- The quench: the part cools from white-hot through orange to red; dip it
  //- when it glows the cherry red of the swatch. The strip under it is the
  //- whole cooling, with the marker running along it.
  div.quench(
    :class="{ dipped }"
    role="application"
    :aria-label="t('smithy.quench')"
    data-testid="smith-quench"
    @pointerdown.prevent="go"
  )
    div.part(:style="{ background: color, boxShadow: `0 0 ${(glow * 2).toFixed(2)}rem ${color}` }")
    div.tank
      div.water
      div.steam(v-if="dipped")
        span(v-for="i in 4" :key="i" :style="{ '--i': i }")
    div.scale
      div.window(:style="{ left: `${(1 - CHERRY - CHERRY_HALF) * 100}%`, width: `${CHERRY_HALF * 200}%` }")
      div.marker(:style="{ left: `${(1 - glow) * 100}%` }")
    button.dip(type="button" :aria-label="t('smithy.dip')" data-testid="smith-dip")
      GameIcon(name="drop")
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import { CHERRY, CHERRY_HALF, dip, glowAt, makeQuench, quenchQuality, stepQuench } from '@/game/sim/smithy'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { useGameLoop } from './useGameLoop'

const emit = defineEmits<{ (e: 'done', quality: number): void }>()
const { t } = useI18n()

const q = makeQuench()
const glow = ref(1)
const dipped = ref(false)
let finished = false

/** Steel's colour as it cools: white, yellow, orange, cherry red, dull red, grey. */
const STOPS: [number, [number, number, number]][] = [
  [1, [255, 252, 236]], [0.82, [255, 226, 120]], [0.64, [255, 150, 50]], [0.45, [214, 40, 50]], [0.25, [120, 30, 40]], [0, [70, 64, 96]]
]
const color = computed(() => {
  const g = glow.value
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [ga, ca] = STOPS[i]!
    const [gb, cb] = STOPS[i + 1]!
    if (g <= ga && g >= gb) {
      const k = (ga - g) / (ga - gb)
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j]! - c) * k)).join(',')})`
    }
  }
  return 'rgb(70,64,96)'
})

const end = (): void => {
  finished = true
  dipped.value = true
  sfx('hiss')
  haptic('tap')
  window.setTimeout(() => emit('done', quenchQuality(q)), 650)
}

const go = (): void => {
  if (finished) return
  dip(q)
  glow.value = q.dippedAt
  end()
}

useGameLoop((dt) => {
  if (finished) return
  stepQuench(q, dt)
  glow.value = glowAt(q.t)
  if (q.done) { glow.value = q.dippedAt; end() }
}, (down) => { if (down) go() })
</script>

<style scoped lang="sass">
.quench
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
  padding: clamp(0.5rem, 2vmin, 0.9rem)
  border-radius: var(--cm-radius-m)
  background: radial-gradient(ellipse at 50% 80%, rgba(95, 233, 255, 0.16), rgba(21, 12, 43, 0.6) 70%)
  cursor: pointer
  user-select: none
  touch-action: none
.part
  width: min(70%, 16rem)
  height: clamp(1.2rem, 5vmin, 1.8rem)
  border-radius: 0.3rem 1.4rem 1.4rem 0.3rem
  transition: translate 0.35s ease-in
  .dipped &
    translate: 0 clamp(2rem, 9vmin, 3.2rem)
.tank
  position: relative
  width: min(80%, 18rem)
  height: clamp(2.4rem, 10vmin, 3.6rem)
  margin-top: calc(clamp(1.2rem, 5vmin, 1.8rem) * -0.4)
  border-radius: 0.3rem 0.3rem 1rem 1rem
  background: #4f4985
  box-shadow: inset 0 0 0 0.2rem #8b86b8
  overflow: visible
.water
  position: absolute
  inset: 28% 0.2rem 0.2rem
  border-radius: 0 0 0.8rem 0.8rem
  background: linear-gradient(180deg, rgba(95, 233, 255, 0.7), rgba(40, 90, 200, 0.8))
.steam
  position: absolute
  left: 0
  right: 0
  bottom: 70%
  display: flex
  justify-content: space-around
  pointer-events: none
  span
    width: 1.4rem
    height: 1.4rem
    border-radius: 50%
    background: rgba(255, 255, 255, 0.75)
    animation: steam 0.9s ease-out forwards
    animation-delay: calc(var(--i) * 70ms)
    opacity: 0
.scale
  position: relative
  width: min(80%, 18rem)
  height: clamp(0.6rem, 2.4vmin, 0.9rem)
  border-radius: 999px
  background: linear-gradient(90deg, #fffcec, #ffe278 18%, #ff9632 36%, #d62832 55%, #781e28 75%, #464060)
.window
  position: absolute
  top: -0.25rem
  bottom: -0.25rem
  border-radius: 0.3rem
  box-shadow: 0 0 0 0.16rem #fff, 0 0 0.6rem #fff
.marker
  position: absolute
  top: -0.45rem
  bottom: -0.45rem
  width: 0.24rem
  margin-left: -0.12rem
  border-radius: 999px
  background: var(--cm-cyan)
  box-shadow: 0 0 0.5rem var(--cm-cyan)
.dip
  width: clamp(3rem, 13vmin, 4.4rem)
  height: clamp(3rem, 13vmin, 4.4rem)
  border-radius: 50%
  border: var(--cm-edge) solid var(--cm-cyan)
  background: radial-gradient(circle at 40% 35%, #a8f4ff, #2a8ad8 75%)
  color: #fff
  box-shadow: 0 0.3rem 0 #1b4d8a, 0 0 1rem rgba(95, 233, 255, 0.5)
  cursor: pointer
  :deep(svg)
    width: 52%
    height: 52%
@keyframes steam
  0%
    opacity: 0.9
    translate: 0 0
  100%
    opacity: 0
    translate: 0 -2.4rem
    width: 2.4rem
    height: 2.4rem
@media (prefers-reduced-motion: reduce)
  .steam span
    animation: none
</style>
