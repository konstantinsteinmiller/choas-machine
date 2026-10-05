<template lang="pug">
  //- The rifle's fortune wheel (#75): open once the rifle's damage track is at
  //- its top. Every win adds damage with no ceiling, each a little less; the
  //- odds are on the wheel, and a pity bar promises a win after a run of misses.
  section.wheel-card(:class="{ locked: !open }" data-testid="rifle-wheel")
    header.head
      GameIcon.head-icon(:name="open ? 'star' : 'lock'")
      div.title {{ t('wheel.title') }}
      div.bonus(v-if="open && w.wins > 0") +{{ pct(wheelBonus(w.wins)) }}
    p.locked-note(v-if="!open") {{ t('wheel.locked') }}
    template(v-else)
      div.stage
        div.dial(:style="{ rotate: `${angle}deg`, transition: spinning ? 'rotate 1.6s cubic-bezier(0.15, 0.9, 0.2, 1)' : 'none' }")
          svg(viewBox="-50 -50 100 100" aria-hidden="true")
            path(v-for="(s, i) in segs" :key="i" :d="s.d" :class="s.win ? 'win' : 'lose'")
            circle.hub(r="9")
        div.pointer(aria-hidden="true")
      dl.odds
        div
          dt {{ t('wheel.chance') }}
          dd {{ pct(chance) }}
        div
          dt {{ t('wheel.gain') }}
          dd +{{ pct(winGain(w.wins)) }}
      div.pity(role="meter" :aria-label="t('wheel.pity', { n: PITY - w.misses })" aria-valuemin="0" :aria-valuemax="PITY" :aria-valuenow="w.misses")
        span.p(v-for="n in PITY" :key="n" :class="{ on: n <= w.misses }")
      div.result(v-if="result" :class="result.won ? 'won' : 'miss'" role="status")
        | {{ result.won ? t('wheel.won', { n: pct(result.gain) }) : t('wheel.miss', { n: fmt(result.refund) }) }}
      div.actions
        FButton(
          type="warning"
          size="md"
          icon="scrap"
          icon-position="left"
          :is-disabled="spinning || !canSpin('scrap')"
          :aria-label="`${t('wheel.spin')}: ${fmt(cost)} ${t('base.scrap')}`"
          data-testid="wheel-spin"
          @click="spin('scrap')"
        ) {{ fmt(cost) }}
        //- A sure win: a rewarded video where one can play, a Data Core always.
        FButton(
          v-if="videoOffer"
          type="success"
          size="md"
          icon="video"
          icon-position="left"
          :is-disabled="spinning"
          :aria-label="t('wheel.watch')"
          data-testid="wheel-video"
          @click="watchAd"
        ) {{ t('wheel.sure') }}
        FButton(
          type="secondary"
          size="md"
          icon="core"
          icon-position="left"
          :is-disabled="spinning || !canSpin('core')"
          :aria-label="`${t('wheel.sure')}: ${SURE_SPIN_CORES} ${t('base.cores')}`"
          data-testid="wheel-core"
          @click="spin('core')"
        ) {{ SURE_SPIN_CORES }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { PITY, spinCost, wheelBonus, winChance, winGain } from '@/game/data/wheel'
import { profile } from '@/game/state/profile'
import { SURE_SPIN_CORES, canSpin, spinWheel, wheelOpen, type SpinPay, type SpinResult } from '@/game/state/progress'
import { canOffer, offerTick, watchFor } from '@/use/useRewardedOffers'
import { sfx } from '@/game/audio/sfx'
import { haptic } from '@/use/useHaptics'
import { formatAmount } from '@/utils/formatAmount'

const emit = defineEmits<{ (e: 'focus'): void }>()
const { t, locale } = useI18n()
const fmt = (n: number): string => formatAmount(n, locale.value)
const pct = (share: number): string => `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(share * 100)}%`

const w = computed(() => profile.arsenal.wheel)
const open = computed(() => wheelOpen())
const cost = computed(() => spinCost(w.value.wins))
const chance = computed(() => winChance(w.value.wins, w.value.misses))

/** The wheel: ten slices, as many of them winners as the chance says (at least one). */
const SLICES = 10
const segs = computed(() => {
  const wins = Math.max(1, Math.min(SLICES, Math.round(chance.value * SLICES)))
  return Array.from({ length: SLICES }, (_, i) => {
    const a0 = (i / SLICES) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 1) / SLICES) * Math.PI * 2 - Math.PI / 2
    const r = 46
    const d = `M0 0 L${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} A${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)} Z`
    return { d, win: i < wins }
  })
})

const angle = ref(0)
const spinning = ref(false)
const result = ref<SpinResult | null>(null)

/** Turn the dial so the slice under the pointer says what was decided. */
const land = (won: boolean): Promise<void> => new Promise((done) => {
  const wins = segs.value.filter(s => s.win).length
  const pick = won ? Math.floor(Math.random() * wins) : wins + Math.floor(Math.random() * (SLICES - wins))
  // Slice `pick` sits under the pointer (at the top) when the dial has turned back by its middle.
  const mid = ((pick + 0.5) / SLICES) * 360
  const base = Math.ceil(angle.value / 360) * 360 + 360 * 4
  spinning.value = true
  angle.value = base - mid
  window.setTimeout(() => { spinning.value = false; done() }, 1650)
})

const spin = async (pay: SpinPay): Promise<void> => {
  if (spinning.value) return
  // Decided before the dial turns: what it lands on is what happened.
  const r = spinWheel(pay, Math.random())
  if (!r) return
  result.value = null
  sfx('uiClick')
  await land(r.won)
  result.value = r
  if (r.won) { sfx('forgeDone'); haptic('reward'); emit('focus') } else sfx('denied')
}

const watchAd = async (): Promise<void> => {
  if (spinning.value) return
  let r: SpinResult | null = null
  await watchFor('wheel', () => { r = spinWheel('ad', 0) })
  if (!r) return
  result.value = null
  await land(true)
  result.value = r
  sfx('forgeDone')
  haptic('reward')
  emit('focus')
}

// The offer depends on the clock (no videos in a session's first minutes): re-read it now and then.
const clock = ref(0)
let timer = 0
onMounted(() => { timer = window.setInterval(() => { clock.value++ }, 1000) })
onUnmounted(() => window.clearInterval(timer))
const videoOffer = computed(() => { void clock.value; void offerTick.value; return canOffer('wheel') })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.wheel-card
  display: flex
  flex-direction: column
  gap: clamp(0.35rem, 1.5vmin, 0.6rem)
  padding: clamp(0.45rem, 2vmin, 0.8rem)
  &.locked
    --plate-edge: rgba(154, 120, 255, 0.5)
    --plate-fill: linear-gradient(rgba(21, 12, 43, 0.6), rgba(21, 12, 43, 0.6))
.head
  display: flex
  align-items: center
  gap: 0.5em
.head-icon
  width: 1.4em
  height: 1.4em
  color: #ffe98f
.title
  flex: 1
  color: var(--cm-text)
  font-size: var(--cm-fs-m)
.bonus
  color: var(--cm-ok)
  font-variant-numeric: tabular-nums
.locked-note
  margin: 0
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
.stage
  position: relative
  align-self: center
  width: clamp(7rem, 30vmin, 10rem)
  aspect-ratio: 1
  max-width: 100%
.dial
  position: absolute
  inset: 0
  svg
    width: 100%
    height: 100%
  .win
    fill: #ffd23f
    stroke: #241848
    stroke-width: 1.2
  .lose
    fill: #4a4482
    stroke: #241848
    stroke-width: 1.2
  .hub
    fill: #241848
    stroke: #ffe98f
    stroke-width: 2
.pointer
  position: absolute
  left: 50%
  top: -0.2rem
  translate: -50% 0
  width: 0
  height: 0
  border-left: 0.5rem solid transparent
  border-right: 0.5rem solid transparent
  border-top: 0.9rem solid var(--cm-pink)
  filter: drop-shadow(0 0 0.2rem var(--cm-pink))
.odds
  display: flex
  justify-content: space-around
  margin: 0
  dt
    color: var(--cm-dim)
    font-size: var(--cm-fs-xs)
  dd
    margin: 0
    color: var(--cm-text)
    font-variant-numeric: tabular-nums
    text-align: center
.pity
  display: flex
  justify-content: center
  gap: 0.25rem
  .p
    width: 1.2rem
    height: 0.35rem
    +tech-cut(0.1rem)
    background: rgba(246, 241, 255, 0.18)
    &.on
      background: var(--cm-warn)
.result
  text-align: center
  font-size: var(--cm-fs-s)
  &.won
    color: var(--cm-ok)
  &.miss
    color: var(--cm-dim)
.actions
  display: flex
  flex-wrap: wrap
  justify-content: center
  gap: 0.5rem
@media (prefers-reduced-motion: reduce)
  .dial
    transition: none !important
</style>
