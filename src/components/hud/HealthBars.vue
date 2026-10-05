<template lang="pug">
  //- Health over heads (#74): a riveted steel plate with a fill that runs
  //- green to amber to red, notched in tenths, a bolt at each end. Pooled and
  //- pinned by a HUD ticker; only the nearest few are drawn.
  div.bars-layer(aria-hidden="true")
    div.bar(v-for="n in MAX_BARS" :key="n" :ref="(e) => keep(n - 1, e)")
      i.bolt
      div.track
        div.fill
        div.notches
      i.bolt
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { addHudTicker, bars, MAX_BARS } from '@/game/state/hud'

const els: Array<HTMLElement | null> = []
const fills: Array<HTMLElement | null> = []
const keep = (i: number, e: unknown): void => {
  const el = (e as HTMLElement | null) ?? null
  els[i] = el
  fills[i] = el ? (el.querySelector('.fill') as HTMLElement | null) : null
}
let off: (() => void) | null = null

onMounted(() => {
  const shown: boolean[] = []
  const last: number[] = []
  const kinds: number[] = []
  off = addHudTicker(() => {
    for (let i = 0; i < MAX_BARS; i++) {
      const el = els[i]
      if (!el) continue
      const on = i < bars.n
      if (on !== shown[i]) {
        shown[i] = on
        el.style.opacity = on ? '1' : '0'
      }
      if (!on) continue
      el.style.left = `${(bars.x[i]! * 100).toFixed(2)}%`
      el.style.top = `${(bars.y[i]! * 100).toFixed(2)}%`
      el.style.setProperty('--s', bars.size[i]!.toFixed(2))
      if (kinds[i] !== bars.machine[i]) {
        kinds[i] = bars.machine[i]!
        el.classList.toggle('machine', kinds[i] === 1)
      }
      const f = Math.round(bars.frac[i]! * 100) / 100
      if (f !== last[i]) {
        last[i] = f
        const fill = fills[i]
        if (fill) {
          fill.style.transform = `scaleX(${f})`
          fill.dataset.band = f > 0.6 ? 'hi' : f > 0.3 ? 'mid' : 'lo'
        }
      }
    }
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.bars-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden
.bar
  --s: 1
  position: absolute
  display: flex
  align-items: center
  gap: calc(0.12rem * var(--s))
  width: calc(4.6rem * var(--s))
  height: calc(0.62rem * var(--s))
  padding: calc(0.1rem * var(--s)) calc(0.14rem * var(--s))
  box-sizing: border-box
  translate: -50% -100%
  opacity: 0
  transition: opacity 160ms ease-out
  border: calc(0.08rem * var(--s)) solid #0f0a24
  // Brushed steel, a highlight along the top edge.
  background: linear-gradient(180deg, #8e8aa8 0%, #5d5878 45%, #3b3654 100%)
  box-shadow: inset 0 calc(0.06rem * var(--s)) 0 rgba(255, 255, 255, 0.35), 0 calc(0.08rem * var(--s)) 0 rgba(10, 5, 24, 0.55)
  +tech-cut(calc(0.22rem * var(--s)))
  &.machine
    background: linear-gradient(180deg, #a59b7c 0%, #6f6449 45%, #45391f 100%)
.bolt
  flex: none
  width: calc(0.22rem * var(--s))
  height: calc(0.22rem * var(--s))
  border-radius: 50%
  background: radial-gradient(circle at 35% 35%, #f2eeff, #75708f 60%, #2a2540)
.track
  position: relative
  flex: 1
  height: 100%
  overflow: hidden
  background: #160f30
  box-shadow: inset 0 calc(0.05rem * var(--s)) calc(0.08rem * var(--s)) rgba(0, 0, 0, 0.7)
  +tech-cut(calc(0.12rem * var(--s)))
.fill
  position: absolute
  inset: 0
  transform-origin: left center
  background: linear-gradient(180deg, #8dffb0, #2fcf6b)
  &[data-band="mid"]
    background: linear-gradient(180deg, #ffe88a, #f2a51f)
  &[data-band="lo"]
    background: linear-gradient(180deg, #ff9aa6, #e5304f)
.notches
  position: absolute
  inset: 0
  background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(15, 10, 36, 0.75) calc(10% - 1px) 10%)
</style>
