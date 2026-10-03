<template lang="pug">
  //- Who is noticing the mech, and from where (Assassin's Creed: Odyssey's
  //- ring): an arc round the aim point for each defender, pointing at it. It
  //- fills white while it notices, refills yellow while it comes to look, and
  //- goes red when it is sure.
  div.threat-arcs(aria-hidden="true")
    div.arc(v-for="n in MAX_THREATS" :key="n" :ref="(el) => setArc(el, n - 1)")
      svg(viewBox="0 0 100 100")
        path.track(:d="ARC")
        path.fill(:d="ARC")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, type ComponentPublicInstance } from 'vue'
import { addHudTicker, threats, MAX_THREATS } from '@/game/state/hud'

/**
 * Written straight to the DOM by a HUD ticker (the bearings change every
 * frame the camera turns).
 */
// 40° of a circle of radius 46, centred on straight ahead.
const ARC = 'M 34.27 6.77 A 46 46 0 0 1 65.73 6.77'
const LEN = 46 * ((40 * Math.PI) / 180)

const arcs: Array<HTMLElement | null> = []
const fills: Array<SVGPathElement | null> = []
const shown: boolean[] = []
const setArc = (el: Element | ComponentPublicInstance | null, i: number): void => {
  const node = el as HTMLElement | null
  arcs[i] = node
  fills[i] = node ? node.querySelector<SVGPathElement>('.fill') : null
}

let off: (() => void) | null = null
onMounted(() => {
  off = addHudTicker(() => {
    for (let i = 0; i < MAX_THREATS; i++) {
      const el = arcs[i]
      const fill = fills[i]
      if (!el || !fill) continue
      const on = i < threats.n
      if (on !== shown[i]) {
        shown[i] = on
        el.style.opacity = on ? '1' : '0'
      }
      if (!on) continue
      const level = Math.min(1, threats.level[i]!)
      // A bearing to the left is a turn anticlockwise on screen.
      el.style.rotate = `${-threats.angle[i]!}rad`
      const len = LEN * level
      fill.style.strokeDasharray = `${len} ${LEN}`
      fill.style.strokeDashoffset = String(-(LEN - len) / 2)
      const stage = threats.stage[i]!
      fill.style.stroke = stage === 2 ? 'var(--cm-danger)' : stage === 1 ? 'var(--cm-warn)' : 'var(--cm-text)'
      el.classList.toggle('looking', stage === 1)
      el.classList.toggle('sure', stage === 2)
    }
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.threat-arcs
  position: absolute
  left: 50%
  top: 50%
  width: clamp(9rem, 50vmin, 20rem)
  height: clamp(9rem, 50vmin, 20rem)
  translate: -50% -50%
  pointer-events: none
.arc
  position: absolute
  inset: 0
  opacity: 0
  transition: opacity 160ms ease-out
  svg
    display: block
    width: 100%
    height: 100%
    overflow: visible
  path
    fill: none
    stroke-linecap: round
  .track
    stroke: rgba(21, 12, 43, 0.55)
    stroke-width: 4.6
  // Looking: the white it filled stays as the track, the yellow fills over it.
  &.looking .track
    stroke: rgba(246, 241, 255, 0.75)
  &.sure .fill
    stroke-width: 3.6
  .fill
    stroke-width: 2.8
    filter: drop-shadow(0 0 0.25rem currentColor)
</style>
