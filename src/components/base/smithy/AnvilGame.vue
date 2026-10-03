<template lang="pug">
  //- The anvil: the hot bar lies on it with four glowing marks; a ring closes
  //- on the next one, and the strike lands when the ring meets the mark.
  div.anvil(
    role="application"
    :aria-label="t('smithy.anvil')"
    data-testid="smith-anvil"
    @pointerdown.prevent="hit"
  )
    div.bench
      div.bar(:style="{ '--glow': glow.toFixed(3) }")
        div.mark(
          v-for="i in STRIKES"
          :key="i"
          :class="[verdicts[i - 1] ?? '', { next: i - 1 === next }]"
          :style="{ left: `${12 + (i - 1) * 25.3}%` }"
        )
          div.closing(v-if="i - 1 === next" :style="{ '--k': ring.toFixed(3) }")
          div.burst(v-if="verdicts[i - 1]")
      div.block
    FingerGlyph.teach(v-if="!learned" mode="tap")
    //- The hammer swings on every strike.
    div.hammer(:class="{ swing }")
      GameIcon(name="hammer")
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import FingerGlyph from '@/components/hud/hints/FingerGlyph.vue'
import { markSeen, profile } from '@/game/state/profile'
import { STRIKES, anvilQuality, makeAnvil, nextBeat, ringClose, stepAnvil, strike, type Strike } from '@/game/sim/smithy'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { useGameLoop } from './useGameLoop'

const emit = defineEmits<{ (e: 'done', quality: number): void }>()
const { t } = useI18n()

const a = makeAnvil()
const next = ref(0)
const ring = ref(0)
const verdicts = ref<Strike[]>([])
const swing = ref(false)
const glow = ref(1)
let finished = false
let swingT = 0
const learned = profile.seen.includes('smith-anvil')

const land = (s: Strike): void => {
  sfx(s === 'perfect' ? 'clang' : s === 'miss' ? 'clangOff' : s === 'good' ? 'clang' : 'clangOff', 0, s === 'perfect' ? 1.1 : 0.8)
  if (s !== 'miss') haptic(s === 'perfect' ? 'blast' : 'tap')
}

const hit = (): void => {
  if (finished) return
  swing.value = true
  swingT = 0.16
  const s = strike(a)
  if (s) land(s)
}

useGameLoop((dt) => {
  if (swingT > 0) { swingT -= dt; if (swingT <= 0) swing.value = false }
  if (finished) return
  const before = a.strikes.length
  stepAnvil(a, dt)
  // A beat let go by is a miss: it still sounds, dully.
  if (a.strikes.length > before) land(a.strikes[a.strikes.length - 1]!)
  verdicts.value = [...a.strikes]
  next.value = nextBeat(a)
  ring.value = ringClose(a)
  // The bar cools a little with every strike, and glows again on a good one.
  glow.value = Math.max(0.35, 1 - a.t * 0.1)
  if (a.done) {
    finished = true
    const q = anvilQuality(a)
    if (q >= 0.5) markSeen('smith-anvil')
    window.setTimeout(() => emit('done', q), 450)
  }
}, (down) => { if (down) hit() })
</script>

<style scoped lang="sass">
.anvil
  position: relative
  display: flex
  align-items: flex-end
  justify-content: center
  min-height: clamp(8rem, 36vmin, 12rem)
  padding: clamp(0.5rem, 2vmin, 0.9rem)
  border-radius: var(--cm-radius-m)
  background: radial-gradient(ellipse at 50% 70%, rgba(95, 233, 255, 0.12), rgba(21, 12, 43, 0.6) 70%)
  cursor: pointer
  user-select: none
  touch-action: none
// The lesson: a finger on the control, until the game has been played well once.
.teach
  position: absolute
  pointer-events: none
  z-index: 2
  filter: drop-shadow(0 0.15rem 0.2rem rgba(10, 5, 24, 0.7))
  left: 50%
  top: 0
  margin-left: calc(clamp(3rem, 15vmin, 5rem) / -2)
.bench
  position: relative
  width: min(100%, 26rem)
.bar
  --glow: 1
  position: relative
  height: clamp(1.4rem, 6vmin, 2.2rem)
  margin: 0 8%
  border-radius: 0.5rem
  background: linear-gradient(180deg, #fff1b0, #ff9a3a calc(30% + (1 - var(--glow)) * 40%), #c2402a)
  box-shadow: 0 0 calc(var(--glow) * 1.4rem) rgba(255, 150, 60, 0.75)
.block
  height: clamp(2.6rem, 11vmin, 4rem)
  margin: 0 18%
  border-radius: 0.3rem 0.3rem 1.2rem 1.2rem
  background: linear-gradient(180deg, #8b86b8, #4f4985)
  box-shadow: inset 0 0.25rem 0 #b9b2e0
.mark
  position: absolute
  top: 50%
  width: clamp(1rem, 4vmin, 1.5rem)
  height: clamp(1rem, 4vmin, 1.5rem)
  margin: calc(clamp(1rem, 4vmin, 1.5rem) / -2) 0 0 calc(clamp(1rem, 4vmin, 1.5rem) / -2)
  border-radius: 50%
  background: #fff8e6
  box-shadow: 0 0 0.6rem #fff, 0 0 1.2rem #ffd27a
  &.next
    animation: pulse 0.45s ease-in-out infinite alternate
  &.perfect
    background: var(--cm-cyan)
    box-shadow: 0 0 1rem var(--cm-cyan)
  &.good
    background: var(--cm-ok)
    box-shadow: 0 0 0.8rem var(--cm-ok)
  &.off
    background: var(--cm-warn)
    box-shadow: none
  &.miss
    background: #4f4985
    box-shadow: none
.closing
  --k: 0
  position: absolute
  inset: calc((1 - var(--k)) * -2.4rem)
  border-radius: 50%
  border: 0.2rem solid #fff
  opacity: calc(0.25 + var(--k) * 0.75)
  pointer-events: none
.burst
  position: absolute
  inset: -0.9rem
  border-radius: 50%
  border: 0.18rem solid currentColor
  color: #fff
  animation: burst 0.4s ease-out forwards
  pointer-events: none
  .perfect &
    color: var(--cm-cyan)
  .good &
    color: var(--cm-ok)
  .miss &, .off &
    display: none
.hammer
  position: absolute
  right: 6%
  top: 4%
  width: clamp(2.6rem, 11vmin, 3.8rem)
  height: clamp(2.6rem, 11vmin, 3.8rem)
  color: #d8ccff
  rotate: -25deg
  transform-origin: 80% 90%
  transition: rotate 120ms ease-out
  filter: drop-shadow(0 0.2rem 0 #241848)
  &.swing
    rotate: 35deg
    transition-duration: 60ms
@keyframes pulse
  from
    box-shadow: 0 0 0.4rem #fff, 0 0 0.8rem #ffd27a
  to
    box-shadow: 0 0 1rem #fff, 0 0 2rem #ffd27a
@keyframes burst
  from
    opacity: 1
    inset: -0.4rem
  to
    opacity: 0
    inset: -1.8rem
@media (prefers-reduced-motion: reduce)
  .mark.next, .burst
    animation: none
</style>
