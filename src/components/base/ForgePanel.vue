<template lang="pug">
  //- The Forge: a weapon's next tier, built at once from its blueprints and
  //- scrap (#75: the smithy's waits are gone; the furnace now melts each
  //- raid's haul on the rewards screen). Every weapon is the mech's from the
  //- start; a tier is more damage. The ⓘ explains the row's signs (R74).
  div.forge
    div.forge-head
      span.lead {{ t('forge.lead') }}
      FHudButton.info(
        icon="info"
        tone="cyan"
        :aria-label="t('forge.infoOpen')"
        data-testid="forge-info"
        @click="info = true"
      )
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
            //- What the next tier brings, said plainly (R74).
            span.gain(data-testid="forge-gain") {{ t('forge.gain', { n: GAIN }) }}
        span.top(v-if="tier(w) >= TIER_MAX")
          GameIcon(name="check")
          | {{ t('forge.top') }}
        div.pay(v-else)
          //- The scrap paid with a rewarded video instead (#182), once the blueprints are in.
          VideoOfferButton(
            v-if="(videoOffer || videoSpent) && canForgeByVideo(w)"
            :label="t('forge.watch', { name: t(`options.actions.weapon${i + 1}`) })"
            :testid="`forge-video-${w}`"
            :spent="!videoOffer"
            @watch="watch(w)"
          )
          FButton(
            type="primary"
            size="sm"
            icon="forge"
            :is-disabled="!canForge(w)"
            :aria-label="`${t('forge.build')}: ${t(`options.actions.weapon${i + 1}`)}`"
            :data-testid="`forge-build-${w}`"
            @click="build(w)"
          ) {{ t('forge.build') }}
    //- What the Forge is for, and what each sign in a row means (R74).
    FModal(v-model="info" :title="t('forge.infoTitle')" data-testid="forge-info-modal")
      div.info-body
        p.info-lead {{ t('forge.info.lead') }}
        dl.info-list
          div.info-row
            dt
              span.tiers.demo(aria-hidden="true")
                span.tier.on
                span.tier
                span.tier
            dd {{ t('forge.info.tiers', { max: TIER_MAX }) }}
          div.info-row
            dt
              GameIcon(name="blueprint")
              span.demo-num 1/2
            dd {{ t('forge.info.blueprints') }}
          div.info-row
            dt
              GameIcon(name="scrap")
            dd {{ t('forge.info.scrap') }}
          div.info-row
            dt
              GameIcon(name="forge")
            dd {{ t('forge.info.build', { n: GAIN }) }}
      template(#footer)
        FButton(size="md" data-testid="forge-info-close" @click="info = false") {{ t('ok') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import VideoOfferButton from '@/components/atoms/VideoOfferButton.vue'
import FHudButton from '@/components/atoms/FHudButton.vue'
import FModal from '@/components/molecules/FModal.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { WEAPON_IDS, type WeaponId } from '@/game/data/ids'
import { TIER_DAMAGE_STEP, TIER_MAX, tierBlueprints, tierScrap } from '@/game/data/upgrades'
import { profile } from '@/game/state/profile'
import { buildTier, canForge, canForgeByVideo } from '@/game/state/progress'
import { canOffer, offerSpent, offerTick, watchFor } from '@/use/useRewardedOffers'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'

const emit = defineEmits<{ (e: 'focus', weapon: WeaponId): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
const tier = (w: WeaponId): number => profile.arsenal.tiers[w]
/** What one more tier is worth, in per cent of the weapon's damage. */
const GAIN = Math.round(TIER_DAMAGE_STEP * 100)
/** The Forge's explanation is open. */
const info = ref(false)

const build = (w: WeaponId): void => {
  if (!buildTier(w)) return
  sfx('forgeDone')
  haptic('reward')
  emit('focus', w)
}
/** The video instead of the scrap; the tier only once it has played to the end. */
const watch = async (w: WeaponId): Promise<void> => {
  if (!await watchFor('upgrade', () => { buildTier(w, true) })) return
  sfx('forgeDone')
  haptic('reward')
  emit('focus', w)
}

// The offer is re-read each second (the grace and the provider's readiness move on their own).
const clock = ref(0)
let timer = 0
onMounted(() => { timer = window.setInterval(() => { clock.value++ }, 1000) })
onUnmounted(() => { window.clearInterval(timer) })
const videoOffer = computed(() => { void clock.value; void offerTick.value; return canOffer('upgrade') })
const videoSpent = computed(() => { void clock.value; void offerTick.value; return offerSpent('upgrade') })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.forge
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.5vmin, 0.6rem)
.forge-head
  display: flex
  align-items: center
  justify-content: space-between
  gap: 0.6rem
.lead
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
  line-height: 1.25
.info
  flex: none
// The video and the build button side by side.
.pay
  display: flex
  align-items: center
  gap: 0.3rem
.gain
  color: var(--cm-ok)
  font-size: var(--cm-fs-xs)
  line-height: 1
  font-variant-numeric: tabular-nums
.info-body
  display: flex
  flex-direction: column
  gap: 0.8rem
  max-width: 34rem
.info-lead
  margin: 0
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.35
.info-list
  margin: 0
  display: flex
  flex-direction: column
  gap: 0.6rem
.info-row
  display: grid
  grid-template-columns: 4.2rem minmax(0, 1fr)
  align-items: center
  gap: 0.7rem
  dt
    display: inline-flex
    align-items: center
    justify-content: center
    gap: 0.25em
    color: var(--cm-cyan-hi)
    :deep(svg)
      width: 1.5rem
      height: 1.5rem
  dd
    margin: 0
    color: var(--cm-text)
    font-size: var(--cm-fs-s)
    line-height: 1.3
.demo-num
  font-size: var(--cm-fs-s)
  font-variant-numeric: tabular-nums
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
  +tech-plate(rgba(154, 120, 255, 0.6), tech-fill(var(--cm-violet), 10%), 0.5rem, var(--cm-edge))
.w-icon
  box-sizing: border-box
  width: clamp(2rem, 8vmin, 2.9rem)
  height: clamp(2rem, 8vmin, 2.9rem)
  padding: 0.38em
  // A hex socket (the icon's own box) with its rim on all six sides; the padding keeps the glyph well inside it.
  +tech-hex(rgba(77, 232, 255, 0.85), radial-gradient(circle at 50% 40%, rgba(168, 245, 255, 0.3), rgba(77, 232, 255, 0.1) 55%, rgba(21, 12, 43, 0.75)))
  padding: 0.5em 0.48em
  color: var(--cm-cyan-hi)
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
