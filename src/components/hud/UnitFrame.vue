<template lang="pug">
  //- CM-07's unit frame (#145), top left like an action-RPG's: the portrait
  //- in its hex socket, the threat level under it, and beside it the health,
  //- the weapon in hand and the base's alert with its alarm, all in one
  //- machined plate. Compact (#169): a portrait a quarter smaller, the rows
  //- close together, no name printed over them.
  div.unit-frame(data-testid="unit-frame")
    div.portrait(aria-hidden="true")
      div.socket
        img.face(v-if="face" :src="face" alt="" draggable="false")
        GameIcon.face-glyph(v-else name="mech")
      span.level(v-if="!hud.training.on") {{ roman }}
    //- No name over the bars (#169): the portrait says who it is.
    div.rows
      ArmorBar
      AmmoStrip
      div.alert-row
        AlertMeter
        //- The alarm: a guard runs for a beacon (a siren, blinking), cranks it
        //- (the ring fills), and it is lit (the whole base is coming).
        div.alarm(
          v-if="hud.alarm > 0"
          :class="['s' + hud.alarm]"
          role="img"
          :aria-label="t(hud.alarm === 3 ? 'hud.alarmLit' : 'hud.alarmRunner')"
          data-testid="alarm"
        )
          GameIcon(name="siren")
          div.alarm-fill(:style="{ width: `${Math.round((hud.alarm === 3 ? 1 : hud.alarmLit) * 100)}%` }")
    //- Three cooling vents cut into the frame's far corner.
    div.vents(aria-hidden="true")
      span
      span
      span
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import ArmorBar from '@/components/hud/ArmorBar.vue'
import AmmoStrip from '@/components/hud/AmmoStrip.vue'
import AlertMeter from '@/components/hud/AlertMeter.vue'
import { hud } from '@/game/state/hud'
import { flow } from '@/game/flow'
import { mechPortrait } from '@/game/art/mechPortrait'

const { t } = useI18n()
const face = ref('')
const ROMAN = ['I', 'II', 'III', 'IV', 'V']
const roman = computed(() => ROMAN[Math.max(0, Math.min(ROMAN.length, flow.level) - 1)])
// Drawn once with the game's renderer (it is up: the mission is), then kept.
onMounted(() => { face.value = mechPortrait() })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
// The frame: a wide plate, its cut and edge in the mech's violet, a second
// hairline inside it, the portrait's socket breaking out of its left side.
.unit-frame
  // A quarter smaller than it was (#169: 3.2rem, 15vmin, 4.9rem).
  --face: clamp(2.4rem, 11.25vmin, 3.675rem)
  position: relative
  display: flex
  align-items: center
  gap: clamp(0.4rem, 1.6vmin, 0.7rem)
  padding: clamp(0.3rem, 1.2vmin, 0.5rem) clamp(0.6rem, 2.4vmin, 1rem) clamp(0.3rem, 1.2vmin, 0.5rem) clamp(0.3rem, 1.2vmin, 0.5rem)
  pointer-events: none
  +tech-plate(var(--cm-violet), tech-fill(var(--cm-violet), 16%), 0.9rem)
// The portrait: a hexagonal socket, the head looking out of it.
.portrait
  position: relative
  flex: none
  width: calc(var(--face) * 1.1)
  height: var(--face)
.socket
  position: absolute
  inset: 0
  display: grid
  place-items: center
  overflow: hidden
  +tech-hex(var(--cm-cyan), radial-gradient(circle at 50% 38%, #4a3696 0%, #24145a 62%, #150c2b 100%), 2px)
.face
  width: 108%
  height: 108%
  object-fit: cover
  translate: 0 4%
.face-glyph
  width: 62%
  height: 62%
  color: var(--cm-lilac)
// The threat level, in a small plate across the socket's foot.
.level
  position: absolute
  left: 50%
  bottom: -0.35em
  translate: -50% 0
  min-width: 1.9em
  padding: 0.05em 0.45em
  color: #ffe9a8
  font-family: var(--font-ui)
  font-weight: 700
  font-size: var(--cm-fs-xs, 0.7rem)
  line-height: 1.2
  text-align: center
  letter-spacing: 0.06em
  +tech-plate(var(--cm-warn), tech-fill(var(--cm-warn), 26%), 0.3rem, 1px, false)
.vents
  position: absolute
  right: 0.55em
  bottom: 0.5em
  display: flex
  gap: 0.18em
  span
    width: 0.16em
    height: 0.7em
    background: color-mix(in srgb, var(--cm-violet) 70%, #fff)
    opacity: 0.55
    skew: -25deg 0deg
.rows
  display: flex
  flex-direction: column
  gap: clamp(0.08rem, 0.4vmin, 0.16rem)
  min-width: 0
.alert-row
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.2vmin, 0.5rem)

.alarm
  position: relative
  display: flex
  align-items: center
  gap: 0.3em
  width: clamp(3.6rem, 15vmin, 6rem)
  padding: 0.12em 0.5em
  color: var(--cm-danger)
  overflow: hidden
  +tech-plate(var(--cm-danger), tech-fill(var(--cm-danger), 22%), 0.4rem, var(--cm-rim-w), false)
  :deep(svg)
    position: relative
    z-index: 1
    width: 1.15em
    height: 1.15em
  &.s1 :deep(svg)
    animation: siren-blink 0.5s steps(2) infinite
  &.s3
    --plate-fill: linear-gradient(var(--cm-danger), var(--cm-danger))
    color: #fff
.alarm-fill
  position: absolute
  left: 0
  top: 0
  bottom: 0
  background: rgba(255, 85, 118, 0.45)
  transition: width 120ms linear
  // Clear of the plate's cut strokes.
  +tech-inner-cut(0.4rem, var(--cm-rim-w))
@keyframes siren-blink
  50%
    opacity: 0.25
@media (prefers-reduced-motion: reduce)
  .alarm.s1 :deep(svg)
    animation: none
</style>
