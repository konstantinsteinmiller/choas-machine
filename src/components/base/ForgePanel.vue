<template lang="pug">
  //- The Forge: blueprints and Tech Scrap in, a better weapon out, after a
  //- wait that Data Cores can cut short. One build at a time.
  div.forge
    //- What is in the fire.
    div.job(v-if="job" :class="{ done: left <= 0 }" data-testid="forge-job")
      GameIcon.job-icon(:name="job.weapon")
      div.job-body
        div.job-name {{ t(`options.actions.weapon${WEAPON_IDS.indexOf(job.weapon) + 1}`) }} · {{ t('forge.tier', { n: job.tier }) }}
        div.bar(role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(done01 * 100)")
          div.bar-fill(:style="{ transform: `scaleX(${done01.toFixed(3)})` }")
        div.clock(v-if="left > 0")
          GameIcon(name="clock")
          span {{ formatClock(left) }}
      FButton(v-if="left <= 0" type="success" size="md" icon="check" attention data-testid="forge-claim" @click="claim") {{ t('forge.claim') }}
      FButton(
        v-else
        type="secondary"
        size="sm"
        icon="core"
        icon-position="left"
        :is-disabled="profile.cores < cost"
        :aria-label="`${t('forge.finish')}: ${cost} ${t('base.cores')}`"
        data-testid="forge-skip"
        @click="skip"
      ) {{ cost }}

    //- What could go in next.
    ul.weapons
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
              | {{ formatClock(tierBuildSeconds(tier(w) + 1)) }}
        span.top(v-if="tier(w) >= TIER_MAX")
          GameIcon(name="check")
          | {{ t('forge.top') }}
        FButton(
          v-else
          type="primary"
          size="sm"
          icon="forge"
          :is-disabled="!canForge(w)"
          :aria-label="job ? t('forge.busy') : `${t('forge.build')}: ${t(`options.actions.weapon${i + 1}`)}`"
          :data-testid="`forge-build-${w}`"
          @click="build(w)"
        ) {{ t('forge.build') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { WEAPON_IDS, type WeaponId } from '@/game/data/ids'
import { TIER_MAX, skipCost, tierBlueprints, tierBuildSeconds, tierScrap } from '@/game/data/upgrades'
import { profile } from '@/game/state/profile'
import { canForge, claimForge, forgeRemaining, settleForge, skipForge, startForge } from '@/game/state/progress'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount, formatClock } from '@/utils/formatAmount'

const emit = defineEmits<{ (e: 'focus', weapon: WeaponId): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
const tier = (w: WeaponId): number => profile.arsenal.tiers[w]

// The clock the panel reads: once a second while it is open.
const now = ref(Date.now())
let timer = 0
onMounted(() => {
  settleForge()
  timer = window.setInterval(() => { now.value = Date.now() }, 500)
})
onUnmounted(() => {
  window.clearInterval(timer)
  settleForge()
})

const job = computed(() => profile.forge)
const left = computed(() => (job.value ? forgeRemaining(job.value, now.value) : 0))
const done01 = computed(() => (job.value ? 1 - left.value / job.value.total : 0))
const cost = computed(() => skipCost(left.value))

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
const claim = (): void => {
  const w = job.value?.weapon
  if (!claimForge()) return
  sfx('forgeDone')
  haptic('reward')
  if (w) emit('focus', w)
}
</script>

<style scoped lang="sass">
.forge
  display: flex
  flex-direction: column
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
.job, .weapon
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
  padding: clamp(0.35rem, 1.5vmin, 0.6rem) clamp(0.45rem, 2vmin, 0.8rem)
  border-radius: var(--cm-radius-m)
.job
  border: var(--cm-edge) solid var(--cm-pink)
  background: rgba(255, 79, 182, 0.12)
  box-shadow: var(--cm-glow-pink)
  &.done
    border-color: var(--cm-ok)
    background: rgba(77, 255, 176, 0.12)
    box-shadow: none
.job-icon, .w-icon
  width: clamp(1.6rem, 6.5vmin, 2.4rem)
  height: clamp(1.6rem, 6.5vmin, 2.4rem)
  color: var(--cm-pink-hi)
.w-icon
  color: var(--cm-cyan)
.job-body, .w-body
  min-width: 0
  display: flex
  flex-direction: column
  gap: clamp(0.14rem, 0.7vmin, 0.3rem)
.job-name, .w-name
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.1
  overflow-wrap: anywhere
.bar
  height: clamp(0.35rem, 1.5vmin, 0.55rem)
  border-radius: 999px
  overflow: hidden
  background: rgba(246, 241, 255, 0.18)
.bar-fill
  width: 100%
  height: 100%
  background: linear-gradient(90deg, var(--cm-pink), var(--cm-warn))
  transform-origin: left center
  transition: transform 480ms linear
.clock, .need, .top
  display: inline-flex
  align-items: center
  gap: 0.25em
  font-size: var(--cm-fs-xs)
  font-variant-numeric: tabular-nums
  line-height: 1
  :deep(svg)
    width: 1.15em
    height: 1.15em
.clock
  color: var(--cm-dim)
.weapons
  list-style: none
  margin: 0
  padding: 0
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.5vmin, 0.6rem)
.weapon
  border: var(--cm-edge) solid rgba(154, 120, 255, 0.5)
  background: rgba(21, 12, 43, 0.5)
.tiers
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.tier
  width: clamp(0.7rem, 3vmin, 1.1rem)
  height: clamp(0.28rem, 1.1vmin, 0.4rem)
  border-radius: 999px
  background: rgba(246, 241, 255, 0.18)
  &.on
    background: var(--cm-pink)
    box-shadow: 0 0 0.3rem rgba(255, 79, 182, 0.8)
.needs
  display: flex
  flex-wrap: wrap
  gap: 0.2em 0.8em
.need
  color: var(--cm-dim)
  &.short
    color: var(--cm-danger)
.top
  color: var(--cm-ok)
  font-size: var(--cm-fs-s)
</style>
