<template lang="pug">
  //- One station's upgrade tracks: what each is, where it stands, what the
  //- next level makes of it, and the button that buys it (at once, #75).
  ul.upgrades
    li.row(v-for="id in ids" :key="id" :class="{ maxed: level(id) >= TRACK_MAX }")
      GameIcon.icon(:name="TRACKS[id].icon")
      div.body
        div.name {{ t(`track.${id}`) }}
        //- A first level that brings a new verb says so until it is bought.
        div.verb(v-if="VERB_TRACKS.includes(id) && level(id) < 1") {{ t(`trackVerb.${id}`) }}
        div.pips(role="img" :aria-label="t('workshop.level', { n: level(id), max: TRACK_MAX })")
          span.pip(v-for="n in TRACK_MAX" :key="n" :class="{ on: n <= level(id) }")
        div.values
          span.now {{ value(id, level(id)) }}
          template(v-if="level(id) < TRACK_MAX")
            GameIcon.arrow(name="right")
            span.next {{ value(id, level(id) + 1) }}
      div.pay(v-if="level(id) < TRACK_MAX")
        //- A weapon upgrade can be paid with a rewarded video instead (the film mark).
        FButton.video(
          v-if="videoOffer && TRACKS[id].station === 'armory'"
          type="success"
          size="sm"
          icon="video"
          icon-only
          :aria-label="t('workshop.watch', { name: t(`track.${id}`) })"
          :data-testid="`video-${id}`"
          @click="watch(id)"
        )
        FButton.buy(
          type="warning"
          size="sm"
          icon="scrap"
          icon-position="left"
          :is-disabled="!canBuyTrack(id)"
          :aria-label="`${t('workshop.buy', { name: t(`track.${id}`) })}: ${fmt(trackCost(level(id)))} ${t('base.scrap')}`"
          :data-testid="`buy-${id}`"
          @click="buy(id)"
        ) {{ fmt(trackCost(level(id))) }}
      span.max(v-else)
        GameIcon(name="check")
        | {{ t('workshop.max') }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { TRACKS, TRACK_IDS, TRACK_MAX, VERB_TRACKS, trackCost, trackValue, type Station, type TrackId } from '@/game/data/upgrades'
import { buyTrack, canBuyTrack, trackLevel } from '@/game/state/progress'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'
import { canOffer, offerTick, watchFor } from '@/use/useRewardedOffers'

const props = defineProps<{ station: Station }>()
const emit = defineEmits<{ (e: 'focus', id: TrackId): void }>()
const { t, locale } = useI18n()

const ids = computed(() => TRACK_IDS.filter(id => TRACKS[id].station === props.station))
const level = (id: TrackId): number => trackLevel(id)
const fmt = (n: number): string => formatAmount(n, locale.value)

/** How each track's figure is written. The unit marks are symbols, the same
 *  in every language. */
const UNITS: Readonly<Record<TrackId, string>> = {
  sniperZoom: '×', sniperDamage: '%', sniperSilence: ' m', minigunCooling: ' s', minigunDamage: '%',
  rocketBlast: ' m', rocketAmmo: '', ammoRacks: '', armor: '', speed: '%', decoy: ' s', hook: ' m'
}
const value = (id: TrackId, lvl: number): string => {
  const v = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(trackValue(id, lvl))
  return UNITS[id] === '×' ? `×${v}` : `${v}${UNITS[id]}`
}

const buy = (id: TrackId): void => {
  if (!buyTrack(id)) return
  sfx('buy')
  haptic('reward')
  emit('focus', id)
}
/** The video instead of the scrap; the level only once it has played to the end. */
const watch = async (id: TrackId): Promise<void> => {
  if (!await watchFor('upgrade', () => { buyTrack(id, true) })) return
  sfx('buy')
  haptic('reward')
  emit('focus', id)
}

// The offer is re-read each second (the grace and the provider's readiness move on their own).
const clock = ref(0)
let timer = 0
onMounted(() => { timer = window.setInterval(() => { clock.value++ }, 1000) })
onUnmounted(() => { window.clearInterval(timer) })
const videoOffer = computed(() => { void clock.value; void offerTick.value; return canOffer('upgrade') })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.verb
  color: var(--cm-warn, #ffd27a)
  font-size: var(--cm-fs-xs, 0.75em)
.upgrades
  list-style: none
  margin: 0
  padding: 0
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.5vmin, 0.6rem)
.row
  display: grid
  grid-template-columns: auto minmax(0, 1fr) auto
  align-items: center
  gap: clamp(0.4rem, 2vmin, 0.9rem)
  padding: clamp(0.35rem, 1.5vmin, 0.6rem) clamp(0.45rem, 2vmin, 0.8rem)
  +tech-plate(rgba(154, 120, 255, 0.6), tech-fill(var(--cm-violet), 10%), 0.5rem, var(--cm-edge))
  &.maxed
    --plate-edge: rgba(77, 255, 176, 0.6)
// The glyph in a hex socket, like the weapons'.
.icon
  box-sizing: border-box
  width: clamp(2rem, 8vmin, 2.9rem)
  height: clamp(2rem, 8vmin, 2.9rem)
  padding: 0.38em
  // A hex socket (the icon's own box) with its rim on all six sides; the padding keeps the glyph well inside it.
  +tech-hex(rgba(77, 232, 255, 0.85), radial-gradient(circle at 50% 40%, rgba(168, 245, 255, 0.3), rgba(77, 232, 255, 0.1) 55%, rgba(21, 12, 43, 0.75)))
  padding: 0.5em 0.48em
  color: var(--cm-cyan-hi)
.body
  min-width: 0
  display: flex
  flex-direction: column
  gap: clamp(0.12rem, 0.6vmin, 0.25rem)
.name
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.1
  // A long name wraps under itself; it never pushes the button off the row.
  overflow-wrap: anywhere
.pips
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.pip
  width: clamp(0.7rem, 3vmin, 1.1rem)
  height: clamp(0.28rem, 1.1vmin, 0.4rem)
  background: rgba(246, 241, 255, 0.18)
  +tech-cut(0.12rem)
  &.on
    background: var(--cm-cyan)
    box-shadow: 0 0 0.3rem rgba(77, 232, 255, 0.8)
.values
  display: flex
  align-items: center
  gap: 0.3em
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
  font-variant-numeric: tabular-nums
  line-height: 1
.arrow
  width: 0.9em
  height: 0.9em
.next
  color: var(--cm-ok)
// The video and the scrap price side by side, in the row's last column.
.pay
  display: flex
  align-items: center
  gap: 0.3rem
.max
  display: inline-flex
  align-items: center
  gap: 0.3em
  color: var(--cm-ok)
  font-size: var(--cm-fs-s)
  :deep(svg)
    width: 1.1em
    height: 1.1em
</style>
