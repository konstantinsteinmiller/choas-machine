<template lang="pug">
  //- The disguises (#97): what comes down over the mech when it hides. Looks
  //- only: every one keeps the box's rules. The toaster is everyone's; the
  //- rest unlock for good, with a rewarded video where one can play, or scrap.
  section.disguises(data-testid="disguises")
    header.head
      GameIcon.head-icon(name="box")
      div.title {{ t('disguise.title') }}
    ul.grid
      li.tile(
        v-for="id in DISGUISE_IDS"
        :key="id"
        :class="{ worn: profile.cosmetics.worn === id, owned: ownsDisguise(id), looking: looking === id }"
        @pointerenter="look(id)"
        @focusin="look(id)"
      )
        img.thumb(v-if="thumbs[id]" :src="thumbs[id]" alt="" aria-hidden="true")
        div.name {{ t(`disguise.${id}`) }}
        span.worn-mark(v-if="profile.cosmetics.worn === id")
          GameIcon(name="check")
        FButton(
          v-else-if="ownsDisguise(id)"
          type="secondary"
          size="sm"
          :aria-label="t('disguise.wear', { name: t(`disguise.${id}`) })"
          :data-testid="`disguise-wear-${id}`"
          @click="wear(id)"
        ) {{ t('disguise.wearShort') }}
        div.buy(v-else)
          FButton(
            v-if="videoOffer"
            type="success"
            size="sm"
            icon="video"
            icon-only
            :aria-label="t('disguise.watch', { name: t(`disguise.${id}`) })"
            :data-testid="`disguise-video-${id}`"
            @click="watch(id)"
          )
          FButton(
            type="warning"
            size="sm"
            icon="scrap"
            icon-position="left"
            :is-disabled="profile.scrap < DISGUISE_SCRAP"
            :aria-label="`${t('disguise.unlock', { name: t(`disguise.${id}`) })}: ${fmt(DISGUISE_SCRAP)} ${t('base.scrap')}`"
            :data-testid="`disguise-buy-${id}`"
            @click="buy(id)"
          ) {{ fmt(DISGUISE_SCRAP) }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { DISGUISE_IDS, DISGUISE_SCRAP, type DisguiseId } from '@/game/models/disguiseIds'
import { profile } from '@/game/state/profile'
import { ownsDisguise, unlockDisguise, wearDisguise } from '@/game/state/progress'
import { canOffer, offerTick, watchFor } from '@/use/useRewardedOffers'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'
import { disguiseThumb } from '@/game/art/disguiseThumbs'

const emit = defineEmits<{ (e: 'preview', id: DisguiseId | null): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)

/** The disguise the pointer is on: the mech in the base shows it. */
const looking = ref<DisguiseId | null>(null)
const look = (id: DisguiseId): void => { looking.value = id; emit('preview', id) }

const wear = (id: DisguiseId): void => {
  if (!wearDisguise(id)) return
  sfx('boxOn')
  look(id)
}
const buy = (id: DisguiseId): void => {
  if (!unlockDisguise(id)) return
  sfx('buy')
  haptic('reward')
  look(id)
}
const watch = async (id: DisguiseId): Promise<void> => {
  const ok = await watchFor('disguise', () => { unlockDisguise(id, true) })
  if (!ok) return
  sfx('buy')
  haptic('reward')
  look(id)
}

/** A picture of each, drawn once (the panel covers the pad the mech stands on). */
const thumbs = ref<Partial<Record<DisguiseId, string>>>({})
onMounted(() => {
  window.setTimeout(() => {
    const out: Partial<Record<DisguiseId, string>> = {}
    for (const id of DISGUISE_IDS) out[id] = disguiseThumb(id)
    thumbs.value = out
  }, 0)
})

const clock = ref(0)
let timer = 0
onMounted(() => { timer = window.setInterval(() => { clock.value++ }, 1000) })
onUnmounted(() => { window.clearInterval(timer); emit('preview', null) })
const videoOffer = computed(() => { void clock.value; void offerTick.value; return canOffer('disguise') })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.disguises
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.5vmin, 0.6rem)
  padding: clamp(0.45rem, 2vmin, 0.8rem)
.head
  display: flex
  align-items: center
  gap: 0.5em
.head-icon
  width: 1.4em
  height: 1.4em
  color: var(--cm-cyan-hi)
.title
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
.grid
  list-style: none
  margin: 0
  padding: 0
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr))
  gap: clamp(0.3rem, 1.4vmin, 0.55rem)
.tile
  display: flex
  flex-direction: column
  align-items: center
  justify-content: space-between
  gap: 0.35rem
  min-width: 0
  padding: 0.45rem
  +tech-plate(rgba(154, 120, 255, 0.6), tech-fill(var(--cm-violet), 10%), 0.5rem, var(--cm-edge))
  &.owned
    --plate-edge: rgba(77, 232, 255, 0.6)
  &.worn
    --plate-edge: var(--cm-ok)
    --plate-fill: #{tech-fill(var(--cm-ok), 16%)}
  // The one tried on: the edge lights cyan (an outer ring would be cut off by the plate's clip).
  &.looking
    --plate-edge: var(--cm-cyan)
.thumb
  width: clamp(3.4rem, 12vmin, 5rem)
  height: clamp(3.4rem, 12vmin, 5rem)
  object-fit: contain
.name
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  text-align: center
  overflow-wrap: anywhere
.worn-mark
  color: var(--cm-ok)
  :deep(svg)
    width: 1.4rem
    height: 1.4rem
.buy
  display: flex
  gap: 0.3rem
</style>
