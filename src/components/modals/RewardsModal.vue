<template lang="pug">
  //- The tally after an extraction: what the run was, what it earned.
  FModal(:model-value="open" :title="t('rewards.title')" :is-closable="false" data-testid="rewards")
    div.tally(v-if="pay && run")
      //- The three medals, lit one after another.
      div.medals
        div.medal(v-for="(m, i) in MEDAL_IDS" :key="m" :class="{ won: pay.medals[m], shown: step > i }")
          GameIcon.medal-icon(:name="MEDAL_ICONS[m]")
          span.medal-name {{ t(`medal.${m}`) }}
      dl.lines
        div.line
          dt {{ t('rewards.time') }}
          dd {{ formatClock(run.time) }}
        div.line
          dt {{ t('rewards.kills') }}
          dd {{ run.kills }}
        div.line
          dt {{ t('rewards.headshots') }}
          dd {{ run.headshots }}
        div.line.score
          dt {{ t('rewards.score') }}
          dd
            span.best(v-if="isBest") {{ t('rewards.newBest') }}
            | {{ fmt(score) }}
      //- What goes into the wallet.
      div.loot
        div.item.scrap(:title="t('base.scrap')")
          GameIcon(name="scrap")
          span(data-testid="reward-scrap") +{{ fmt(scrap) }}
        div.item.cores(v-if="pay.cores > 0" :title="t('base.cores')")
          GameIcon(name="core")
          span +{{ pay.cores }}
        div.item.bp(v-for="(w, i) in pay.blueprints" :key="i" :title="t('base.blueprints')")
          GameIcon(name="blueprint")
          GameIcon.of(:name="w")
    template(#footer)
      FButton(size="lg" icon="home" data-testid="btn-to-base" @click="toBase") {{ t('rewards.continue') }}
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { MEDAL_ICONS } from '@/components/base/medals'
import { MEDAL_IDS } from '@/game/data/ids'
import { flow, goBase } from '@/game/flow'
import { profile } from '@/game/state/profile'
import { levelKey } from '@/game/state/progress'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount, formatClock } from '@/utils/formatAmount'

const { t, locale } = useI18n()
const open = computed(() => flow.modal === 'rewards')
const pay = computed(() => flow.result)
const run = computed(() => flow.run)
const fmt = (n: number): string => formatAmount(n, locale.value)
const isBest = computed(() => !!pay.value && pay.value.score > 0 && pay.value.score >= (profile.fortresses[levelKey(flow.level)]?.bestScore ?? 0))

// ── The reveal: medals light in turn, then the numbers count up ──
const step = ref(0)
const score = ref(0)
const scrap = ref(0)
let timers: number[] = []
let raf = 0
const clear = (): void => {
  for (const id of timers) window.clearTimeout(id)
  timers = []
  cancelAnimationFrame(raf)
}
const countUp = (ms: number): void => {
  const p = pay.value
  if (!p) return
  const start = performance.now()
  const tick = (): void => {
    const k = Math.min(1, (performance.now() - start) / ms)
    const e = 1 - (1 - k) * (1 - k)
    score.value = Math.round(p.score * e)
    scrap.value = Math.round(p.scrap * e)
    if (k < 1) raf = requestAnimationFrame(tick)
  }
  tick()
}
watch(open, (o) => {
  clear()
  if (!o || !pay.value) return
  step.value = 0
  score.value = 0
  scrap.value = 0
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    step.value = MEDAL_IDS.length
    score.value = pay.value.score
    scrap.value = pay.value.scrap
    return
  }
  MEDAL_IDS.forEach((m, i) => {
    timers.push(window.setTimeout(() => {
      step.value = i + 1
      if (pay.value?.medals[m]) { sfx('medal'); haptic('reward') }
    }, 350 + i * 320))
  })
  timers.push(window.setTimeout(() => countUp(900), 350 + MEDAL_IDS.length * 320))
}, { immediate: true })
onUnmounted(clear)

const toBase = (): void => { void goBase() }
</script>

<style scoped lang="sass">
.tally
  display: flex
  flex-direction: column
  gap: clamp(0.5rem, 2.2vmin, 1rem)
.medals
  display: flex
  justify-content: center
  gap: clamp(0.5rem, 3vmin, 1.6rem)
.medal
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.2em
  min-width: 0
  color: var(--cm-dim)
  opacity: 0.3
  transition: opacity 200ms ease-out, color 200ms ease-out
  &.shown
    opacity: 0.55
  &.shown.won
    opacity: 1
    color: var(--cm-warn)
    .medal-icon
      filter: drop-shadow(0 0 0.5rem rgba(255, 210, 63, 0.8))
      animation: medal-pop 380ms cubic-bezier(0.2, 1.6, 0.4, 1)
.medal-icon
  width: clamp(2.2rem, 11vmin, 3.6rem)
  height: clamp(2.2rem, 11vmin, 3.6rem)
.medal-name
  font-size: var(--cm-fs-xs)
  line-height: 1.1
  text-align: center
  overflow-wrap: anywhere
.lines
  margin: 0
  display: flex
  flex-direction: column
  gap: clamp(0.15rem, 0.8vmin, 0.35rem)
.line
  display: flex
  align-items: baseline
  justify-content: space-between
  gap: 1em
  font-size: var(--cm-fs-s)
  dt
    color: var(--cm-dim)
  dd
    margin: 0
    color: var(--cm-text)
    font-variant-numeric: tabular-nums
    text-align: right
  &.score
    padding-top: clamp(0.2rem, 1vmin, 0.4rem)
    border-top: var(--cm-edge) solid rgba(154, 120, 255, 0.4)
    font-size: var(--cm-fs-m)
    dd
      color: var(--cm-cyan-hi)
.best
  margin-right: 0.6em
  color: var(--cm-pink-hi)
  font-size: var(--cm-fs-xs)
.loot
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: clamp(0.35rem, 1.8vmin, 0.8rem)
.item
  display: inline-flex
  align-items: center
  gap: 0.3em
  min-height: clamp(1.8rem, 7vmin, 2.5rem)
  padding: 0 clamp(0.5rem, 2vmin, 0.9rem)
  border: var(--cm-edge) solid var(--cm-warn)
  border-radius: 999px
  background: rgba(21, 12, 43, 0.6)
  color: var(--cm-warn)
  font-size: var(--cm-fs-m)
  font-variant-numeric: tabular-nums
  span
    color: var(--cm-text)
  :deep(svg)
    width: 1.3em
    height: 1.3em
  &.cores
    border-color: var(--cm-cyan)
    color: var(--cm-cyan)
  &.bp
    border-color: var(--cm-pink)
    color: var(--cm-pink-hi)
    .of
      color: var(--cm-text)

// The medal drops into place and flares; nothing is resized.
@keyframes medal-pop
  from
    translate: 0 -0.7em
    filter: brightness(2.4) drop-shadow(0 0 0.9rem rgba(255, 210, 63, 1))
  to
    translate: 0 0

@media (prefers-reduced-motion: reduce)
  .medal.shown.won .medal-icon
    animation: none
</style>
