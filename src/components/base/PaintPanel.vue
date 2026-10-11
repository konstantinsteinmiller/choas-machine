<template lang="pug">
  //- The mech's paint (#M5): a slow turn of the scheme looked at, what it
  //- takes to wear it, and a tile per scheme. CM-07's lilac is everyone's; an
  //- owned scheme goes on with one tap; a locked one unlocks for good with a
  //- rewarded video or scrap, or a video lends it for the next mission (#M6).
  section.paints(data-testid="paints")
    header.head
      GameIcon.head-icon(name="paint")
      div.title {{ t('paint.title') }}
    div.stage
      img.turn(v-if="turnSrc" :src="turnSrc" alt="" aria-hidden="true" data-testid="paint-preview")
      div.info
        div.picked {{ t(`paint.${selected}`) }}
        div.status(v-if="profile.paint.equipped === selected" data-testid="paint-on")
          GameIcon(name="check")
          | {{ t('paint.equipped') }}
        FButton(
          v-else-if="ownsPaint(selected)"
          type="primary"
          size="sm"
          :aria-label="t('paint.equip', { name: t(`paint.${selected}`) })"
          data-testid="paint-equip"
          @click="equip(selected)"
        ) {{ t('paint.equipShort') }}
        template(v-else)
          div.lent(v-if="profile.paint.trial === selected" data-testid="paint-lent") {{ t('paint.lent') }}
          div.actions
            //- The film mark: unlock for good. Spent for the day, or no video ready: there, disabled, saying why.
            VideoOfferButton(
              v-if="hasVideoOffers"
              :label="t('paint.watch', { name: t(`paint.${selected}`) })"
              :spent="!videoOffer"
              :note="videoSpent ? t('offer.refresh') : t('paint.noVideo')"
              testid="paint-video"
              @watch="watchUnlock(selected)"
            )
            FButton(
              type="warning"
              size="sm"
              icon="scrap"
              icon-position="left"
              :is-disabled="profile.scrap < PAINT_SCRAP"
              :aria-label="`${t('paint.unlock', { name: t(`paint.${selected}`) })}: ${fmt(PAINT_SCRAP)} ${t('base.scrap')}`"
              data-testid="paint-buy"
              @click="buy(selected)"
            ) {{ fmt(PAINT_SCRAP) }}
          //- Or lent for one mission, for a video.
          FButton.try(
            v-if="hasVideoOffers && profile.paint.trial !== selected"
            type="success"
            size="sm"
            icon="video"
            icon-position="left"
            :is-disabled="!videoOffer"
            :aria-label="t('paint.try', { name: t(`paint.${selected}`) })"
            data-testid="paint-try"
            @click="watchTrial(selected)"
          ) {{ t('paint.tryShort') }}
          div.wait(v-if="hasVideoOffers && !videoOffer" data-testid="paint-wait") {{ videoSpent ? t('paint.back', { time: backIn }) : t('paint.noVideo') }}
    ul.grid
      li(v-for="id in PAINT_IDS" :key="id")
        button.tile(
          type="button"
          :class="{ on: profile.paint.equipped === id, owned: ownsPaint(id), picked: selected === id }"
          :aria-label="tileLabel(id)"
          :aria-pressed="selected === id"
          :data-testid="`paint-${id}`"
          @click="pick(id)"
          @pointerenter="look(id)"
          @focus="look(id)"
        )
          img.thumb(v-if="thumbs[id]" :src="thumbs[id]" alt="" aria-hidden="true")
          span.name {{ t(`paint.${id}`) }}
          span.mark(v-if="profile.paint.equipped === id")
            GameIcon(name="check")
          span.price(v-else-if="!ownsPaint(id)")
            GameIcon.film(v-if="hasVideoOffers" name="video")
            GameIcon.nut(name="scrap")
            | {{ fmt(PAINT_SCRAP) }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import VideoOfferButton from '@/components/atoms/VideoOfferButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { PAINT_IDS, PAINT_SCRAP, type PaintId } from '@/game/models/paintIds'
import { profile } from '@/game/state/profile'
import { equipPaint, lendPaint, ownsPaint, paintVideoBackAt, unlockPaint } from '@/game/state/paint'
import { canOffer, offerSpent, offerTick, watchFor } from '@/use/useRewardedOffers'
import { hasVideoOffers } from '@/use/useAdGate'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'
import { TURN_FRAMES, paintThumb, paintTurnFrame } from '@/game/art/paintThumbs'

const emit = defineEmits<{ (e: 'preview', id: PaintId | null): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)

/** The scheme looked at: the preview turns it, the mech in the base wears it. */
const selected = ref<PaintId>(profile.paint.equipped)
const look = (id: PaintId): void => { selected.value = id; emit('preview', id) }

/** One tap: an owned scheme goes on; a locked one is looked at, its prices beside it. */
const pick = (id: PaintId): void => {
  look(id)
  if (ownsPaint(id)) equip(id)
}
const equip = (id: PaintId): void => {
  if (!equipPaint(id)) return
  sfx('weapon')
  haptic('tap')
}
const won = (): void => { sfx('buy'); haptic('reward') }
const buy = (id: PaintId): void => {
  if (unlockPaint(id)) won()
}
const watchUnlock = async (id: PaintId): Promise<void> => {
  if (await watchFor('paint', () => { unlockPaint(id, true) })) won()
}
const watchTrial = async (id: PaintId): Promise<void> => {
  if (await watchFor('paint', () => { lendPaint(id) })) won()
}

const tileLabel = (id: PaintId): string => {
  const name = t(`paint.${id}`)
  if (profile.paint.equipped === id) return `${name}: ${t('paint.equipped')}`
  if (ownsPaint(id)) return t('paint.equip', { name })
  return `${t('paint.unlock', { name })}: ${fmt(PAINT_SCRAP)} ${t('base.scrap')}`
}

/** A picture of each, drawn once (the panel covers the pad the mech stands on). */
const thumbs = ref<Partial<Record<PaintId, string>>>({})
onMounted(() => {
  window.setTimeout(() => {
    const out: Partial<Record<PaintId, string>> = {}
    for (const id of PAINT_IDS) out[id] = paintThumb(id)
    thumbs.value = out
  }, 0)
})

// ── The slow turn: baked a frame a tick for the scheme looked at, then flipped through ──
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const TURN_MS = 110
const frame = ref(0)
const frames = ref<string[]>([])
watch(selected, () => { frames.value = [] })
const turnSrc = computed(() => frames.value[frame.value] || thumbs.value[selected.value] || '')
let turner = 0
onMounted(() => {
  if (calm) return
  turner = window.setInterval(() => {
    const k = (frame.value + 1) % TURN_FRAMES
    if (!frames.value[k]) {
      const next = frames.value.slice()
      next[k] = paintTurnFrame(selected.value, k)
      frames.value = next
    }
    frame.value = k
  }, TURN_MS)
})

// The offer is re-read each second (the provider's readiness and the day's cap move on their own).
const clock = ref(0)
let timer = 0
onMounted(() => { timer = window.setInterval(() => { clock.value++ }, 1000) })
onUnmounted(() => {
  window.clearInterval(timer)
  window.clearInterval(turner)
  emit('preview', null)
})
const videoOffer = computed(() => { void clock.value; void offerTick.value; return canOffer('paint') })
const videoSpent = computed(() => { void clock.value; void offerTick.value; return offerSpent('paint') })
/** When the next paint video comes back, as h:mm:ss. */
const backIn = computed(() => {
  void clock.value
  void offerTick.value
  const s = Math.max(0, Math.ceil((paintVideoBackAt() - Date.now()) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.paints
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
// The preview and what the scheme looked at takes, side by side (stacked when narrow).
.stage
  display: flex
  align-items: center
  gap: clamp(0.5rem, 2.5vmin, 1rem)
  padding: clamp(0.35rem, 1.5vmin, 0.6rem)
  +tech-plate(rgba(77, 232, 255, 0.55), radial-gradient(circle at 30% 45%, rgba(95, 233, 255, 0.16), rgba(21, 12, 43, 0.7) 70%), 0.5rem, var(--cm-edge))
.turn
  flex: none
  width: clamp(5.5rem, 22vmin, 8rem)
  height: clamp(5.5rem, 22vmin, 8rem)
  object-fit: contain
.info
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: 0.4rem
  min-width: 0
.picked
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
  overflow-wrap: anywhere
.status
  display: inline-flex
  align-items: center
  gap: 0.3em
  color: var(--cm-ok)
  font-size: var(--cm-fs-s)
  :deep(svg)
    width: 1.2rem
    height: 1.2rem
.lent
  color: var(--cm-warn, #ffd27a)
  font-size: var(--cm-fs-xs)
.actions
  display: flex
  flex-wrap: wrap
  gap: 0.3rem
.wait
  color: var(--cm-text-dim, rgba(230, 220, 255, 0.75))
  font-size: var(--cm-fs-xs)
  font-variant-numeric: tabular-nums
.grid
  list-style: none
  margin: 0
  padding: 0
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(6.4rem, 1fr))
  gap: clamp(0.3rem, 1.4vmin, 0.55rem)
.tile
  width: 100%
  display: flex
  flex-direction: column
  align-items: center
  justify-content: space-between
  gap: 0.25rem
  min-width: 0
  padding: 0.4rem 0.35rem
  font: inherit
  cursor: pointer
  +tech-plate(rgba(154, 120, 255, 0.6), tech-fill(var(--cm-violet), 10%), 0.5rem, var(--cm-edge))
  &.owned
    --plate-edge: rgba(77, 232, 255, 0.6)
  &.on
    --plate-edge: var(--cm-ok)
    --plate-fill: #{tech-fill(var(--cm-ok), 16%)}
  // The one looked at: the edge lights cyan (an outer ring would be cut off by the plate's clip).
  &.picked
    --plate-edge: var(--cm-cyan)
  &:focus-visible
    outline: 2px solid var(--cm-cyan-hi)
    outline-offset: 2px
.thumb
  width: clamp(3rem, 11vmin, 4.6rem)
  height: clamp(3rem, 11vmin, 4.6rem)
  object-fit: contain
.name
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  text-align: center
  overflow-wrap: anywhere
.mark
  color: var(--cm-ok)
  :deep(svg)
    width: 1.2rem
    height: 1.2rem
.price
  display: inline-flex
  align-items: center
  gap: 0.2em
  color: var(--cm-warn, #ffd27a)
  font-size: var(--cm-fs-xs)
  :deep(svg)
    width: 1em
    height: 1em
  .film
    color: var(--cm-ok)
    margin-right: 0.2em
@media (orientation: landscape) and (max-height: 500px)
  .turn
    width: 5rem
    height: 5rem
  .grid
    grid-template-columns: repeat(auto-fill, minmax(5.4rem, 1fr))
</style>
