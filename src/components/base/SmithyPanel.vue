<template lang="pug">
  //- The smithy: whatever was bought or ordered is made here, in three short
  //- games — the furnace, the anvil, the quench — with the metal melting and
  //- then cooling in between. One job at a time.
  div.smithy
    //- Just made: how well, and the scrap a good part saved.
    div.result(v-if="result" data-testid="smith-result")
      GameIcon.made(:name="itemIcon(result.weapon, result.track)")
      div.stars(role="img" :aria-label="t('smithy.stars', { n: result.stars })")
        GameIcon(v-for="n in 3" :key="n" :name="n <= result.stars ? 'star' : 'star-empty'" :class="{ on: n <= result.stars }" :style="{ '--n': n }")
      div.refund(v-if="result.refund > 0" :title="t('base.scrap')")
        GameIcon(name="scrap")
        span +{{ fmt(result.refund) }}
      FButton(type="success" size="md" icon="check" icon-only :aria-label="t('forge.claim')" data-testid="smith-collect" @click="result = null")

    //- What is being made, and where it is.
    div.job(v-else-if="job" data-testid="forge-job")
      div.head
        GameIcon.job-icon(:name="itemIcon(job.weapon, job.track)")
        div.job-name {{ itemName(job.weapon, job.track) }}
        div.job-tier(v-if="job.track")
          span.pip(v-for="n in TRACK_MAX" :key="n" :class="{ on: n <= job.tier, new: n === job.tier }")
        div.job-tier(v-else) {{ t('forge.tier', { n: job.tier }) }}
      //- The three stations: done (with how well), now, still to come.
      ol.steps
        li.step(v-for="(s, i) in SMITH_STEPS" :key="s" :class="stepClass(i)")
          GameIcon(:name="STEP_ICON[s]")
          span.q(v-if="i < job.scores.length")
            span.qpip(v-for="n in 3" :key="n" :class="{ on: n <= starsFor(job.scores[i]) }")
      //- The wait between stations: the metal melts, then cools.
      div.wait(v-if="left > 0" :class="job.step === 'anvil' ? 'melting' : 'cooling'")
        GameIcon.wait-icon(:name="job.step === 'anvil' ? 'flame' : 'drop'")
        div.bar(role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(done01 * 100)")
          div.bar-fill(:style="{ transform: `scaleX(${done01.toFixed(3)})` }")
        span.clock {{ Math.ceil(left) }}s
        FButton(
          type="secondary"
          size="sm"
          icon="core"
          icon-position="left"
          :is-disabled="profile.cores < cost"
          :aria-label="`${t('forge.finish')}: ${cost} ${t('base.cores')}`"
          data-testid="forge-skip"
          @click="skip"
        ) {{ cost }}
      //- Ready: the station's game, started by a tap.
      template(v-else)
        component(:is="GAME[job.step]" v-if="playing" :key="job.step" @done="stepDone")
        FButton.go(
          v-else
          type="warning"
          size="lg"
          :icon="STEP_ICON[job.step]"
          icon-only
          attention
          :aria-label="t(`smithy.${job.step}`)"
          data-testid="smith-start"
          @click="play"
        )

    //- Nothing in the fire: the weapon tiers that could go in.
    ul.weapons(v-else)
      li.weapon(v-for="(w, i) in WEAPON_IDS" :key="w")
        GameIcon.w-icon(:name="w")
        div.w-body
          div.w-name {{ t(`options.actions.weapon${i + 1}`) }}
          div.tiers(role="img" :aria-label="t('forge.tier', { n: tier(w) })")
            span.tier(v-for="n in TIER_MAX" :key="n" :class="{ on: n <= tier(w) }")
          div.needs(v-if="tier(w) < TIER_MAX")
            span.need(:class="{ short: profile.arsenal.blueprints[w] < tierBlueprints(tier(w) + 1) }" :title="t('base.blueprints')")
              GameIcon(name="blueprint")
              | {{ profile.arsenal.blueprints[w] }}/{{ tierBlueprints(tier(w) + 1) }}
            span.need(:class="{ short: profile.scrap < tierScrap(tier(w) + 1) }" :title="t('base.scrap')")
              GameIcon(name="scrap")
              | {{ fmt(tierScrap(tier(w) + 1)) }}
            span.need(:title="t('rewards.time')")
              GameIcon(name="clock")
              | {{ tierWait(tier(w) + 1) * 2 }}s
        span.top(v-if="tier(w) >= TIER_MAX")
          GameIcon(name="check")
          | {{ t('forge.top') }}
        FButton(
          v-else
          type="primary"
          size="sm"
          icon="forge"
          :is-disabled="!canForge(w)"
          :aria-label="`${t('forge.build')}: ${t(`options.actions.weapon${i + 1}`)}`"
          :data-testid="`forge-build-${w}`"
          @click="build(w)"
        ) {{ t('forge.build') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'
import FurnaceGame from './smithy/FurnaceGame.vue'
import AnvilGame from './smithy/AnvilGame.vue'
import QuenchGame from './smithy/QuenchGame.vue'
import { WEAPON_IDS, type WeaponId } from '@/game/data/ids'
import { TIER_MAX, TRACKS, TRACK_MAX, skipCost, tierBlueprints, tierScrap, type TrackId } from '@/game/data/upgrades'
import { SMITH_STEPS, starsOf, tierWait, type SmithStep } from '@/game/sim/smithy'
import { profile } from '@/game/state/profile'
import { canForge, forgeRemaining, settleForge, skipForge, smithStep, startForge, type SmithResult } from '@/game/state/progress'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'

const emit = defineEmits<{ (e: 'focus', weapon: WeaponId): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
const tier = (w: WeaponId): number => profile.arsenal.tiers[w]

const STEP_ICON: Record<SmithStep, GameIconName> = { furnace: 'flame', anvil: 'hammer', quench: 'drop' }
const GAME: Record<SmithStep, Component> = { furnace: FurnaceGame, anvil: AnvilGame, quench: QuenchGame }

// The clock the panel reads, a few times a second while it is open.
const now = ref(Date.now())
let timer = 0
onMounted(() => {
  settleForge()
  timer = window.setInterval(() => { now.value = Date.now() }, 250)
})
onUnmounted(() => {
  window.clearInterval(timer)
  settleForge()
})

const job = computed(() => profile.forge)
const left = computed(() => (job.value ? forgeRemaining(job.value, now.value) : 0))
const done01 = computed(() => (job.value && job.value.total > 0 ? 1 - left.value / job.value.total : 1))
const cost = computed(() => skipCost(left.value))
const playing = ref(false)
const result = ref<SmithResult | null>(null)

const itemIcon = (w: WeaponId, track?: string): GameIconName => (track ? TRACKS[track as TrackId].icon : w)
const itemName = (w: WeaponId, track?: string): string =>
  track ? t(`track.${track}`) : t(`options.actions.weapon${WEAPON_IDS.indexOf(w) + 1}`)
const starsFor = (q: number | undefined): number => starsOf([q ?? 0])
const stepClass = (i: number): string => {
  const j = job.value
  if (!j) return ''
  const at = SMITH_STEPS.indexOf(j.step)
  return i < at ? 'done' : i === at ? (left.value > 0 ? 'next' : 'now') : 'later'
}

const play = (): void => {
  playing.value = true
  sfx('uiOpen')
}
const stepDone = (quality: number): void => {
  playing.value = false
  const r = smithStep(quality)
  now.value = Date.now()
  if (r) {
    result.value = r
    sfx('forgeDone')
    haptic('reward')
    emit('focus', r.weapon)
  } else {
    sfx('forgeStart')
  }
}
const build = (w: WeaponId): void => {
  if (!startForge(w)) return
  now.value = Date.now()
  sfx('forgeStart')
  haptic('tap')
  emit('focus', w)
}
const skip = (): void => {
  if (!skipForge()) return
  now.value = Date.now()
  sfx('uiConfirm')
}
</script>

<style scoped lang="sass">
.smithy
  display: flex
  flex-direction: column
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
.job, .result
  display: flex
  flex-direction: column
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
  padding: clamp(0.45rem, 2vmin, 0.8rem)
  border-radius: var(--cm-radius-m)
  border: var(--cm-edge) solid var(--cm-warn)
  background: rgba(255, 177, 74, 0.08)
.head
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
.job-icon, .w-icon, .made
  width: clamp(1.6rem, 6.5vmin, 2.4rem)
  height: clamp(1.6rem, 6.5vmin, 2.4rem)
  color: var(--cm-warn)
.w-icon
  color: var(--cm-cyan)
.job-name, .w-name
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.1
  overflow-wrap: anywhere
.job-tier
  display: flex
  gap: 0.2rem
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
.pip, .tier
  width: clamp(0.7rem, 3vmin, 1.1rem)
  height: clamp(0.28rem, 1.1vmin, 0.4rem)
  border-radius: 999px
  background: rgba(246, 241, 255, 0.18)
  &.on
    background: var(--cm-pink)
    box-shadow: 0 0 0.3rem rgba(255, 79, 182, 0.8)
  &.new
    background: var(--cm-warn)
    animation: blink 0.8s ease-in-out infinite alternate
.steps
  list-style: none
  margin: 0
  padding: 0
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: clamp(0.3rem, 1.5vmin, 0.6rem)
.step
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.2rem
  padding: clamp(0.25rem, 1vmin, 0.4rem)
  border-radius: var(--cm-radius-s, 0.6rem)
  background: rgba(21, 12, 43, 0.55)
  color: var(--cm-dim)
  :deep(svg)
    width: clamp(1.2rem, 5vmin, 1.7rem)
    height: clamp(1.2rem, 5vmin, 1.7rem)
  &.done
    color: var(--cm-ok)
  &.now
    color: var(--cm-warn)
    box-shadow: inset 0 0 0 var(--cm-edge) var(--cm-warn), 0 0 0.8rem rgba(255, 177, 74, 0.5)
  &.next
    color: var(--cm-text)
    box-shadow: inset 0 0 0 var(--cm-edge) rgba(246, 241, 255, 0.3)
  &.later
    opacity: 0.5
.q
  display: flex
  gap: 0.15rem
.qpip
  width: 0.4rem
  height: 0.4rem
  border-radius: 50%
  background: rgba(246, 241, 255, 0.2)
  &.on
    background: var(--cm-warn)
.wait
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto auto
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.8rem)
.wait-icon
  width: clamp(1.4rem, 5.5vmin, 2rem)
  height: clamp(1.4rem, 5.5vmin, 2rem)
  animation: breathe 1.1s ease-in-out infinite alternate
  .melting &
    color: #ff8a3a
  .cooling &
    color: var(--cm-cyan)
.bar
  height: clamp(0.45rem, 1.8vmin, 0.65rem)
  border-radius: 999px
  overflow: hidden
  background: rgba(246, 241, 255, 0.18)
.bar-fill
  width: 100%
  height: 100%
  transform-origin: left center
  transition: transform 240ms linear
  .melting &
    background: linear-gradient(90deg, #ff4f2a, #ffd27a)
  .cooling &
    background: linear-gradient(90deg, #ffb14a, var(--cm-cyan))
.clock
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
  font-variant-numeric: tabular-nums
.go
  align-self: center
.result
  align-items: center
  border-color: var(--cm-ok)
  background: rgba(77, 255, 176, 0.08)
.stars
  display: flex
  gap: clamp(0.2rem, 1vmin, 0.5rem)
  :deep(svg)
    width: clamp(2rem, 9vmin, 3rem)
    height: clamp(2rem, 9vmin, 3rem)
    color: rgba(246, 241, 255, 0.25)
    animation: pop 0.45s cubic-bezier(.2, 1.6, .4, 1) backwards
    animation-delay: calc(var(--n) * 0.18s)
  :deep(svg.on)
    color: #ffd27a
    filter: drop-shadow(0 0 0.4rem rgba(255, 210, 122, 0.8))
.refund
  display: inline-flex
  align-items: center
  gap: 0.3em
  color: #ffd27a
  font-size: var(--cm-fs-m, 1.1rem)
  :deep(svg)
    width: 1.2em
    height: 1.2em
.weapons
  list-style: none
  margin: 0
  padding: 0
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.5vmin, 0.6rem)
.weapon
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
  padding: clamp(0.35rem, 1.5vmin, 0.6rem) clamp(0.45rem, 2vmin, 0.8rem)
  border-radius: var(--cm-radius-m)
  border: var(--cm-edge) solid rgba(154, 120, 255, 0.5)
  background: rgba(21, 12, 43, 0.5)
.w-body
  min-width: 0
  display: flex
  flex-direction: column
  gap: clamp(0.14rem, 0.7vmin, 0.3rem)
.tiers
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.needs
  display: flex
  flex-wrap: wrap
  gap: 0.2em 0.8em
.need, .top
  display: inline-flex
  align-items: center
  gap: 0.25em
  font-size: var(--cm-fs-xs)
  font-variant-numeric: tabular-nums
  line-height: 1
  color: var(--cm-dim)
  :deep(svg)
    width: 1.15em
    height: 1.15em
  &.short
    color: var(--cm-danger)
.top
  color: var(--cm-ok)
  font-size: var(--cm-fs-s)
@keyframes blink
  from
    opacity: 0.55
  to
    opacity: 1
@keyframes breathe
  from
    opacity: 0.6
  to
    opacity: 1
@keyframes pop
  from
    opacity: 0
    translate: 0 -0.8rem
@media (prefers-reduced-motion: reduce)
  .pip.new, .wait-icon, .stars :deep(svg)
    animation: none
</style>
