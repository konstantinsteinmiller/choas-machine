<template lang="pug">
  //- The tally after an extraction: what the run was, what it earned.
  FModal(:model-value="open" :title="t('rewards.title')" :is-closable="false" data-testid="rewards")
    //- The furnace's game (R74) plays in the tally's own place, over its
    //- numbers, from the top: the two share one grid cell, so nothing is
    //- pushed below the fold and the panel does not jump when it ends.
    div.tally(v-if="pay && run")
      div.metrics(:class="{ covered: melting }" :aria-hidden="melting")
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
        //- Where that puts the player in the world.
        div.rank
          RankBadge(:score="campaign")
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
        //- The haul into the furnace (#75): kept in the band, it melts for a
        //- bonus. Optional: Continue keeps the haul as it is.
        div.melt(v-if="meltMax > 0 || melted")
          FButton(
            v-if="!melting && !melted"
            type="warning"
            size="md"
            icon="flame"
            icon-position="left"
            attention
            :aria-label="t('melt.start', { n: fmt(meltMax) })"
            data-testid="melt-start"
            @click="startMelt"
          ) {{ t('melt.start', { n: fmt(meltMax) }) }}
          div.melted(v-else-if="melted" data-testid="melt-result")
            div.stars(role="img" :aria-label="t('smithy.stars', { n: melted.stars })")
              GameIcon(v-for="n in 3" :key="n" :name="n <= melted.stars ? 'star' : 'star-empty'" :class="{ on: n <= melted.stars }")
            span.bonus(v-if="melted.bonus > 0")
              GameIcon(name="scrap")
              | +{{ fmt(melted.bonus) }}
      div.melt-stage(v-if="melting" ref="stage" data-testid="melt-stage")
        FurnaceGame(@done="onMelt")
    template(#footer)
      FButton(size="lg" icon="home" data-testid="btn-to-base" @click="toBase") {{ t('rewards.continue') }}
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { MEDAL_ICONS } from '@/components/base/medals'
import { MEDAL_IDS } from '@/game/data/ids'
import { flow, leaveResults } from '@/game/flow'
import { profile } from '@/game/state/profile'
import { campaignScore, haulToMelt, levelKey, meltHaul } from '@/game/state/progress'
import FurnaceGame from '@/components/base/smithy/FurnaceGame.vue'
import RankBadge from '@/components/atoms/RankBadge.vue'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount, formatClock } from '@/utils/formatAmount'

const { t, locale } = useI18n()
const open = computed(() => flow.modal === 'rewards')
const pay = computed(() => flow.result)
const run = computed(() => flow.run)
const fmt = (n: number): string => formatAmount(n, locale.value)
// Re-read when a result lands: the profile's best scores have just moved.
const campaign = computed(() => (pay.value ? campaignScore() : 0))
const isBest = computed(() => !!pay.value && pay.value.score > 0 && pay.value.score >= (profile.fortresses[levelKey(flow.level, flow.fortress)]?.bestScore ?? 0))

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

// ── The furnace (#75) ──
const melting = ref(false)
const melted = ref<{ stars: 1 | 2 | 3; bonus: number } | null>(null)
const meltMax = ref(0)
watch(open, (o) => {
  if (!o) return
  melting.value = false
  melted.value = null
  meltMax.value = haulToMelt()
}, { immediate: true })
/** The game over the tally, its top in view (the panel scrolled to it). */
const stage = ref<HTMLElement | null>(null)
const startMelt = async (): Promise<void> => {
  melting.value = true
  await nextTick()
  stage.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
const onMelt = (quality: number): void => {
  melting.value = false
  const r = meltHaul(quality)
  if (!r) return
  melted.value = r
  scrap.value += r.bonus
  sfx(r.stars === 3 ? 'forgeDone' : 'buy')
  haptic('reward')
}

const toBase = (): void => { void leaveResults('base') }
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.melt
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.4rem
.melted
  display: flex
  align-items: center
  gap: 0.8rem
  .stars
    display: flex
    gap: 0.15rem
    color: var(--cm-dim)
    :deep(svg)
      width: 1.4rem
      height: 1.4rem
    .on
      color: var(--cm-warn)
  .bonus
    display: inline-flex
    align-items: center
    gap: 0.25em
    color: var(--cm-ok)
    font-variant-numeric: tabular-nums
    :deep(svg)
      width: 1.2em
      height: 1.2em
// The numbers and the furnace's game share one cell: the game lies over the
// numbers from the top while it plays (R74), and they are back after.
.tally
  display: grid
.metrics, .melt-stage
  grid-area: 1 / 1
.metrics
  display: flex
  flex-direction: column
  gap: clamp(0.5rem, 2.2vmin, 1rem)
  &.covered
    visibility: hidden
.melt-stage
  align-self: start
  display: flex
  justify-content: center
  scroll-margin-top: 0.5rem
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
.rank
  display: flex
  justify-content: center
  // Holds its line whether or not there is a rank to show.
  min-height: clamp(1.6rem, 6vmin, 2.2rem)
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
  color: var(--cm-warn)
  font-size: var(--cm-fs-m)
  font-variant-numeric: tabular-nums
  +tech-plate(var(--cm-warn), tech-fill(var(--cm-warn), 12%), 0.5rem)
  span
    color: var(--cm-text)
  :deep(svg)
    width: 1.3em
    height: 1.3em
  &.cores
    --plate-edge: var(--cm-cyan)
    color: var(--cm-cyan)
  &.bp
    --plate-edge: var(--cm-pink)
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
