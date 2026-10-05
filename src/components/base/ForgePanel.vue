<template lang="pug">
  //- The Forge: a weapon's next tier, built at once from its blueprints and
  //- scrap (#75: the smithy's waits are gone; the furnace now melts each
  //- raid's haul on the rewards screen).
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
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { WEAPON_IDS, type WeaponId } from '@/game/data/ids'
import { TIER_MAX, tierBlueprints, tierScrap } from '@/game/data/upgrades'
import { profile } from '@/game/state/profile'
import { buildTier, canForge } from '@/game/state/progress'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'

const emit = defineEmits<{ (e: 'focus', weapon: WeaponId): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
const tier = (w: WeaponId): number => profile.arsenal.tiers[w]

const build = (w: WeaponId): void => {
  if (!buildTier(w)) return
  sfx('forgeDone')
  haptic('reward')
  emit('focus', w)
}
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
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
.w-icon
  box-sizing: border-box
  width: clamp(2rem, 8vmin, 2.9rem)
  height: clamp(2rem, 8vmin, 2.9rem)
  padding: 0.38em
  background: radial-gradient(circle at 35% 30%, rgba(168, 245, 255, 0.35), rgba(77, 232, 255, 0.12) 55%, rgba(21, 12, 43, 0.6))
  box-shadow: 0 0 0 var(--cm-outline) var(--cm-ink), inset 0 0 0 var(--cm-edge) rgba(77, 232, 255, 0.7)
  color: var(--cm-cyan-hi)
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)
.w-name
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.1
  overflow-wrap: anywhere
.w-body
  min-width: 0
  display: flex
  flex-direction: column
  gap: clamp(0.14rem, 0.7vmin, 0.3rem)
.tiers
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.tier
  width: clamp(0.7rem, 3vmin, 1.1rem)
  height: clamp(0.28rem, 1.1vmin, 0.4rem)
  background: rgba(246, 241, 255, 0.18)
  +tech-cut(0.2rem)
  &.on
    background: var(--cm-pink)
    box-shadow: 0 0 0.3rem rgba(255, 79, 182, 0.8)
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
</style>
