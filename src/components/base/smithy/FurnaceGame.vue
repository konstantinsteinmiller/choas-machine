<template lang="pug">
  //- The furnace: hold the bellows to raise the heat, let go to let it fall,
  //- and keep the needle inside the glowing band until the crucible is full.
  div.furnace(
    :class="{ pumping, hot: inside, scorch: scorching }"
    role="application"
    :aria-label="t('smithy.furnace')"
    data-testid="smith-furnace"
  )
    //- The gauge: the band wanders, the needle is the heat.
    div.gauge
      div.band(:style="{ bottom: `${(band - BAND_HALF) * 100}%`, height: `${BAND_HALF * 200}%` }")
      div.needle(:style="{ bottom: `${heat * 100}%` }")
    //- The furnace's mouth glows with the heat; the crucible fills as it melts.
    div.mouth(:style="{ '--heat': heat.toFixed(3) }")
      div.flames
        span.tongue(v-for="i in 5" :key="i" :style="{ '--i': i }")
      div.crucible
        div.molten(:style="{ height: `${melt * 100}%` }")
        GameIcon.ore(name="scrap")
    //- The bellows: held with a pointer or with Space. The lesson's finger and
    //- its filling ring sit exactly round the button (#185), sized from it.
    div.bellows-wrap
      button.bellows(
        type="button"
        :aria-label="t('smithy.pump')"
        data-testid="smith-bellows"
        @pointerdown.prevent="press(true, $event)"
        @pointerup.prevent="press(false)"
        @pointercancel="press(false)"
        @lostpointercapture="press(false)"
      )
        GameIcon(name="flame")
      FingerGlyph.teach(v-if="!learned" mode="hold" data-testid="smith-teach")
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import FingerGlyph from '@/components/hud/hints/FingerGlyph.vue'
import { markSeen, profile } from '@/game/state/profile'
import { BAND_HALF, bandAt, furnaceQuality, inBand, makeFurnace, stepFurnace } from '@/game/sim/smithy'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { useGameLoop } from './useGameLoop'

const emit = defineEmits<{ (e: 'done', quality: number): void }>()
const { t } = useI18n()

const f = makeFurnace()
const heat = ref(f.heat)
const band = ref(bandAt(0))
const melt = ref(0)
const inside = ref(false)
const scorching = ref(false)
const pumping = ref(false)
let finished = false
let puff = 0
/** Played well once: the finger is not drawn any more. */
const learned = profile.seen.includes('smith-furnace')

const press = (down: boolean, e?: PointerEvent): void => {
  if (down && e?.target instanceof Element) (e.target as Element).setPointerCapture?.(e.pointerId)
  pumping.value = down
}

useGameLoop((dt) => {
  if (finished) return
  stepFurnace(f, dt, pumping.value)
  heat.value = f.heat
  band.value = bandAt(f.t)
  melt.value = f.melt
  const was = inside.value
  inside.value = inBand(f)
  if (inside.value && !was) haptic('tap')
  scorching.value = f.heat >= 0.995
  // The bellows breathe while they are worked.
  puff -= dt
  if (pumping.value && puff <= 0) { puff = 0.42; sfx('bellows') }
  if (f.done) {
    finished = true
    sfx('melt')
    const q = furnaceQuality(f)
    if (q >= 0.5) markSeen('smith-furnace')
    emit('done', q)
  }
}, (down) => { pumping.value = down })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.furnace
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto
  align-items: center
  gap: clamp(0.6rem, 3vmin, 1.4rem)
  padding: clamp(0.5rem, 2vmin, 0.9rem)
  user-select: none
  touch-action: none
  +tech-plate(var(--cm-warn), var(--cm-surface), 0.55rem)
// The bellows and the lesson over them share one centre (#185).
.bellows-wrap
  --bellows: clamp(3.4rem, 15vmin, 5rem)
  position: relative
  display: grid
  place-items: center
  width: var(--bellows)
  height: var(--bellows)
// The lesson: a finger on the control, its ring round the button with a
// little air between, until the game has been played well once.
.bellows-wrap .teach
  --size: calc(var(--bellows) + 1.3rem)
  --ring-color: #ffd27a
  --ring-track: rgba(255, 178, 74, 0.28)
  --ring-width: 3.4
  position: absolute
  left: 50%
  top: 50%
  translate: -50% -50%
  pointer-events: none
  z-index: 2
  filter: drop-shadow(0 0 0.35rem rgba(255, 150, 60, 0.75)) drop-shadow(0 0.15rem 0.2rem rgba(10, 5, 24, 0.6))
.furnace
  position: relative
.gauge
  position: relative
  width: clamp(0.9rem, 3.4vmin, 1.4rem)
  height: clamp(7rem, 34vmin, 12rem)
  box-shadow: inset 0 0 0 var(--cm-edge) rgba(255, 255, 255, 0.35)
  overflow: hidden
  +tech-track(var(--cm-warn))
.band
  position: absolute
  left: 0
  right: 0
  border-radius: 0.4rem
  background: rgba(77, 255, 176, 0.35)
  box-shadow: inset 0 0 0 0.14rem var(--cm-ok), 0 0 0.6rem var(--cm-ok)
  .hot &
    background: rgba(77, 255, 176, 0.6)
.needle
  position: absolute
  left: -20%
  right: -20%
  height: 0.24rem
  margin-bottom: -0.12rem
  border-radius: 999px
  background: #fff
  box-shadow: 0 0 0.4rem #fff
.mouth
  --heat: 0
  position: relative
  height: clamp(7rem, 34vmin, 12rem)
  border-radius: 46% 46% 0.8rem 0.8rem / 38% 38% 0.8rem 0.8rem
  background: radial-gradient(ellipse at 50% 85%, rgba(255, 210, 120, calc(0.25 + var(--heat) * 0.75)), rgba(255, 70, 40, calc(var(--heat) * 0.8)) 45%, #1b1236 80%)
  box-shadow: inset 0 0 0 0.3rem #3b2f6e, 0 0 calc(var(--heat) * 2.2rem) rgba(255, 120, 40, calc(var(--heat) * 0.7))
  overflow: hidden
.flames
  position: absolute
  left: 10%
  right: 10%
  bottom: 18%
  display: flex
  justify-content: space-around
  align-items: flex-end
.tongue
  width: 14%
  height: calc(1.2rem + var(--heat) * 3.4rem)
  border-radius: 50% 50% 40% 40% / 70% 70% 30% 30%
  background: linear-gradient(0deg, #ff4f2a, #ffb14a 60%, #fff1b0)
  opacity: calc(0.35 + var(--heat) * 0.65)
  animation: flicker calc(0.5s + var(--i) * 0.07s) ease-in-out infinite alternate
  transform-origin: 50% 100%
.crucible
  position: absolute
  left: 50%
  bottom: 6%
  width: 44%
  height: 34%
  margin-left: -22%
  border-radius: 0.4rem 0.4rem 45% 45%
  background: #2b2152
  box-shadow: inset 0 0 0 0.18rem #8b86b8
  overflow: hidden
.molten
  position: absolute
  left: 0
  right: 0
  bottom: 0
  background: linear-gradient(0deg, #ff7a1a, #ffd27a)
  box-shadow: 0 0 0.8rem #ffb14a
  transition: height 120ms linear
.ore
  position: absolute
  inset: 22% 30%
  color: #b9b2e0
  opacity: 0.8
.bellows
  width: var(--bellows)
  height: var(--bellows)
  border-radius: 50%
  border: var(--cm-edge) solid #ffb14a
  background: radial-gradient(circle at 40% 35%, #ffcf7a, #ff7a2a 70%)
  color: #fff8e6
  box-shadow: 0 0.35rem 0 #a8441a, 0 0 1rem rgba(255, 140, 50, 0.6)
  cursor: pointer
  touch-action: none
  transition: box-shadow 90ms, translate 90ms
  :deep(svg)
    width: 55%
    height: 55%
  .pumping &
    translate: 0 0.3rem
    box-shadow: 0 0.05rem 0 #a8441a, 0 0 1.6rem rgba(255, 160, 60, 0.9)
.scorch .mouth
  animation: shake 0.12s linear infinite
@keyframes flicker
  from
    opacity: calc(0.25 + var(--heat) * 0.55)
    translate: 0 0.18rem
  to
    opacity: calc(0.4 + var(--heat) * 0.6)
    translate: 0 -0.12rem
@keyframes shake
  0%, 100%
    translate: 0 0
  50%
    translate: 0.12rem -0.08rem
@media (prefers-reduced-motion: reduce)
  .tongue, .scorch .mouth
    animation: none
</style>
