<template lang="pug">
  div.reticle-layer(aria-hidden="true")
    //- Through the scope: the lens, the hairs, and the dark round it.
    div.scope(v-show="hud.scoped")
      div.scope-ring
      div.hair.h
      div.hair.v
      div.tick(v-for="n in 4" :key="n" :class="`t${n}`")
      div.scope-dot
      //- Holding on a unit: a ring fills; full, it is tagged.
      svg.tag-ring(v-if="hud.tagging > 0" viewBox="0 0 40 40")
        circle(cx="20" cy="20" r="17" pathLength="1" :style="{ strokeDashoffset: 1 - hud.tagging }")
    //- Everywhere else: where a round would go.
    div.reticle(v-show="!hud.scoped" :class="[`w-${hud.weapon}`, { aiming: hud.aiming, hot: hud.overheated }]")
      div.spool(v-if="hud.weapon === 'minigun'" ref="spool")
    //- Reloading (#84): a ring round the aim point fills until the weapon is ready.
    svg.reload-ring(v-show="hud.reloading" viewBox="0 0 40 40" :class="`w-${hud.weapon}`")
      circle.track(cx="20" cy="20" r="17")
      circle.fill(ref="reloadArc" cx="20" cy="20" r="17" pathLength="1")
    //- A round that landed on someone, and a round that ended someone.
    div.hitmark(:class="{ show: hitFlash, kill: killFlash }")
      i
      i
      i
      i
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { addHudTicker, gun, hud } from '@/game/state/hud'
import { on } from '@/game/bus'

/**
 * The aim point. A dot for the sniper (and the scope's own hairs once it is
 * up), a ring for the minigun that closes as the barrels spool, a chevron for
 * the launcher. A hit flashes four ticks round it; a kill flashes them pink.
 */
const spool = ref<HTMLElement | null>(null)
const reloadArc = ref<SVGCircleElement | null>(null)
const hitFlash = ref(false)
const killFlash = ref(false)
let hitTimer = 0
const offs: Array<() => void> = []

const flash = (kill: boolean): void => {
  hitFlash.value = true
  killFlash.value = kill
  window.clearTimeout(hitTimer)
  hitTimer = window.setTimeout(() => { hitFlash.value = false; killFlash.value = false }, kill ? 320 : 150)
}

onMounted(() => {
  offs.push(on('hit', () => flash(false)))
  offs.push(on('kill', (e) => { if (e.by !== 'blade') flash(true) }))
  let last = -1
  let lastLoad = -1
  offs.push(addHudTicker(() => {
    const arc = reloadArc.value
    if (arc) {
      const r = Math.round(gun.reload * 60) / 60
      if (r !== lastLoad) {
        lastLoad = r
        arc.style.strokeDashoffset = String(1 - r)
      }
    }
    const el = spool.value
    if (!el) return
    const v = Math.round(gun.spool * 40) / 40
    if (v === last) return
    last = v
    // The ring closes onto the aim point as the barrels come up to speed.
    el.style.inset = `${(1 - v) * -55}%`
    el.style.opacity = String(0.25 + 0.75 * v)
  }))
})
onUnmounted(() => {
  window.clearTimeout(hitTimer)
  for (const off of offs) off()
})
</script>

<style scoped lang="sass">
.reticle-layer
  position: absolute
  inset: 0
  pointer-events: none
  overflow: hidden

.reticle
  position: absolute
  left: 50%
  top: 50%
  translate: -50% -50%
  box-sizing: border-box
  transition: opacity 120ms ease-out
  // The sniper off the scope: a dot.
  &.w-sniper
    width: clamp(0.35rem, 1.2vmin, 0.55rem)
    height: clamp(0.35rem, 1.2vmin, 0.55rem)
    border-radius: 50%
    background: var(--cm-text)
    box-shadow: 0 0 0 var(--cm-edge) rgba(21, 12, 43, 0.7)
    opacity: 0.6
  // The minigun: a ring the size of its spread.
  &.w-minigun
    width: clamp(2rem, 9vmin, 3.6rem)
    height: clamp(2rem, 9vmin, 3.6rem)
    border-radius: 50%
    border: var(--cm-edge) solid rgba(246, 241, 255, 0.5)
    &.hot
      border-color: var(--cm-danger)
  // The launcher: a square bracket.
  &.w-rocket
    width: clamp(2rem, 8vmin, 3.2rem)
    height: clamp(2rem, 8vmin, 3.2rem)
    border: var(--cm-edge) solid var(--cm-warn)
    border-radius: 18%
    opacity: 0.75
    &::after
      content: ''
      position: absolute
      left: 50%
      top: 50%
      width: 14%
      height: 14%
      translate: -50% -50%
      border-radius: 50%
      background: var(--cm-warn)
  &.aiming
    opacity: 1

.spool
  position: absolute
  inset: -55%
  border-radius: 50%
  border: var(--cm-edge) solid var(--cm-warn)

// ─── The scope ──────────────────────────────────────────────────────────────
.scope
  --lens: min(92vmin, 44rem)
  position: absolute
  inset: 0
  // The dark outside the lens. A gradient, not a mask: it costs one layer.
  background: radial-gradient(circle at 50% 50%, transparent calc(var(--lens) * 0.5 - 0.1rem), rgba(10, 5, 24, 0.94) calc(var(--lens) * 0.5))
.scope-ring
  position: absolute
  left: 50%
  top: 50%
  width: var(--lens)
  height: var(--lens)
  translate: -50% -50%
  box-sizing: border-box
  border-radius: 50%
  border: clamp(0.15rem, 0.7vmin, 0.3rem) solid var(--cm-ink)
  box-shadow: inset 0 0 0 var(--cm-edge) rgba(77, 232, 255, 0.55), inset 0 0 3rem rgba(21, 12, 43, 0.55)
.hair
  position: absolute
  left: 50%
  top: 50%
  background: rgba(21, 12, 43, 0.85)
  &.h
    width: var(--lens)
    height: var(--cm-edge)
    translate: -50% -50%
    // A gap at the centre, so the target's head is never under a line.
    mask-image: linear-gradient(90deg, #000 0 46%, transparent 47% 53%, #000 54%)
  &.v
    width: var(--cm-edge)
    height: var(--lens)
    translate: -50% -50%
    mask-image: linear-gradient(180deg, #000 0 46%, transparent 47% 53%, #000 54%)
.tick
  position: absolute
  left: 50%
  top: 50%
  width: clamp(0.5rem, 2vmin, 0.9rem)
  height: var(--cm-edge)
  background: rgba(21, 12, 43, 0.85)
  &.t1
    translate: -50% calc(var(--lens) * 0.08)
  &.t2
    translate: -50% calc(var(--lens) * 0.16)
  &.t3
    translate: -50% calc(var(--lens) * 0.24)
  &.t4
    translate: -50% calc(var(--lens) * 0.32)
.scope-dot
  position: absolute
  left: 50%
  top: 50%
  width: clamp(0.22rem, 0.8vmin, 0.34rem)
  height: clamp(0.22rem, 0.8vmin, 0.34rem)
  translate: -50% -50%
  border-radius: 50%
  background: var(--cm-pink)
  box-shadow: 0 0 0.35rem var(--cm-pink)

// ─── The tagging ring ───────────────────────────────────────────────────────
.tag-ring
  position: absolute
  left: 50%
  top: 50%
  width: clamp(2.4rem, 9vmin, 3.6rem)
  height: clamp(2.4rem, 9vmin, 3.6rem)
  translate: -50% -50%
  rotate: -90deg
  overflow: visible
  circle
    fill: none
    stroke: #5fe9ff
    stroke-width: 3
    stroke-dasharray: 1
    filter: drop-shadow(0 0 0.2rem rgba(95, 233, 255, 0.8))

// ─── The reload ring ────────────────────────────────────────────────────────
.reload-ring
  position: absolute
  left: 50%
  top: 50%
  width: clamp(3rem, 12vmin, 4.6rem)
  height: clamp(3rem, 12vmin, 4.6rem)
  translate: -50% -50%
  rotate: -90deg
  overflow: visible
  color: var(--cm-cyan)
  &.w-rocket
    color: #ff8a3d
  circle
    fill: none
    stroke: currentColor
    stroke-width: 3.2
  .track
    opacity: 0.22
  .fill
    stroke-dasharray: 1
    stroke-dashoffset: 1
    stroke-linecap: round
    filter: drop-shadow(0 0 0.25rem currentColor)

// ─── Hit ticks ──────────────────────────────────────────────────────────────
.hitmark
  position: absolute
  left: 50%
  top: 50%
  width: clamp(1.6rem, 6.5vmin, 2.6rem)
  height: clamp(1.6rem, 6.5vmin, 2.6rem)
  translate: -50% -50%
  rotate: 45deg
  opacity: 0
  transition: opacity 180ms ease-out
  color: var(--cm-text)
  &.show
    opacity: 1
    transition: none
  &.kill
    color: var(--cm-pink)
  i
    position: absolute
    background: currentColor
    box-shadow: 0 0 0.3rem currentColor
    border-radius: 999px
  i:nth-child(1), i:nth-child(2)
    left: 50%
    width: clamp(0.12rem, 0.5vmin, 0.2rem)
    height: 30%
    translate: -50% 0
  i:nth-child(1)
    top: 0
  i:nth-child(2)
    bottom: 0
  i:nth-child(3), i:nth-child(4)
    top: 50%
    height: clamp(0.12rem, 0.5vmin, 0.2rem)
    width: 30%
    translate: 0 -50%
  i:nth-child(3)
    left: 0
  i:nth-child(4)
    right: 0
</style>
