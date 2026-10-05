<template lang="pug">
  //- The wordless lessons: a glyph for each control, drawn where the action
  //- happens, kept until the player has done it. The simulation decides which
  //- (`sim/coach.ts`); this only draws them.
  div.control-hints(:class="hud.device")
    template(v-for="h in shown" :key="h.id")
      //- ── Desktop: cards under the crosshair, where the eyes already are ──
      div.card(v-if="hud.device === 'mouse'" :class="{ flash: flashing[h.id] }" role="img" :aria-label="label(h.id)")
        div.glyph
          template(v-if="h.id === 'move'")
            div.wasd
              KeyCap.w(action="forward")
              KeyCap(action="left")
              KeyCap(action="back")
              KeyCap(action="right")
          MouseGlyph(v-else-if="h.id === 'look'" lit="move")
          MouseGlyph(v-else-if="h.id === 'scope'" lit="right")
          MouseGlyph(v-else-if="h.id === 'fire'" lit="left")
          KeyCap(v-else-if="h.id === 'crouch'" action="crouch")
          KeyCap(v-else-if="h.id === 'blade'" action="act")
          KeyCap(v-else-if="h.id === 'decoy'" action="decoy")
          KeyCap(v-else-if="h.id === 'sprint'" action="sprint")
          KeyCap(v-else-if="h.id === 'hide'" action="hide")
          KeyCap(v-else-if="h.id === 'sabotage'" action="act")
          KeyCap(v-else-if="h.id === 'grapple'" action="grapple")
          KeyCap(v-else-if="h.id === 'loot'" action="act")
          KeyCap(v-else-if="h.id === 'jump'" action="jump")
          KeyCap(v-else-if="h.id === 'rope'" action="rope")
          KeyCap(v-else-if="h.id === 'burn'" action="burn")
          //- A supply is picked up by walking over it: the stick, and the crate.
          template(v-else-if="h.id === 'supply'")
            KeyCap(action="forward")
          //- Where to go: the marker itself, small, with the mech walking to it.
          div.mini-pin(v-else-if="h.id === 'goal'")
            GameIcon(name="scrap")
          template(v-else-if="h.id === 'weapon'")
            KeyCap(action="weapon1")
            KeyCap(action="weapon2")
            KeyCap(action="weapon3")
          template(v-else)
            KeyCap(action="forward")
        GameIcon.what(:name="ICONS[h.id]")
        div.pips
          span.pip(v-for="n in h.goal" :key="n" :class="{ on: n <= h.count }")

      //- ── Touch: the finger is drawn on the part of the screen it works on.
      //- The chips (crouch, decoy, weapons, the blade) pulse by themselves:
      //- `MissionHud` reads the same list.
      div.spot(
        v-else
        :class="[SPOTS[h.id], { flash: flashing[h.id] }]"
        role="img"
        :aria-label="label(h.id)"
      )
        FingerGlyph(:mode="FINGER[h.id] ?? 'hold'")
        div.pips
          span.pip(v-for="n in h.goal" :key="n" :class="{ on: n <= h.count }")
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import FingerGlyph from '@/components/hud/hints/FingerGlyph.vue'
import { hud } from '@/game/state/hud'
import type { HintId } from '@/game/sim/coach'

const { t } = useI18n()

/** What each control is FOR, as a picture beside its key. */
const ICONS: Readonly<Record<HintId, GameIconName>> = {
  move: 'mech', look: 'eye', scope: 'scope', fire: 'sniper', crouch: 'crouch', blade: 'blade',
  climb: 'up', cable: 'up', decoy: 'decoy', weapon: 'minigun', sprint: 'sprint', grapple: 'hook', loot: 'scrap', goal: 'mech', hide: 'box', sabotage: 'siren',
  jump: 'up', rope: 'rope', burn: 'flame', supply: 'bolt'
}
/** Touch: where on the screen a gesture's finger is drawn. */
const SPOTS: Readonly<Partial<Record<HintId, 'stick' | 'right'>>> = {
  move: 'stick', climb: 'stick', cable: 'stick', look: 'right', scope: 'right', fire: 'right', supply: 'stick'
}
const FINGER: Readonly<Partial<Record<HintId, 'drag' | 'swipe' | 'hold' | 'release' | 'push'>>> = {
  move: 'drag', climb: 'push', cable: 'push', look: 'swipe', scope: 'hold', fire: 'release', supply: 'push'
}
/** The sentence a screen reader gets: the glyphs themselves carry no words. */
const LABELS: Readonly<Record<HintId, string>> = {
  move: 'options.actions.forward', look: 'hint.look', scope: 'hint.scope', fire: 'hint.fire',
  crouch: 'hud.crouch', blade: 'hud.strike', climb: 'hint.climb', cable: 'hint.climb', decoy: 'hud.decoy', weapon: 'hud.weapons',
  sprint: 'hud.sprint', grapple: 'hud.grapple', loot: 'hud.loot', goal: 'hud.objective.salvage', hide: 'hud.hide', sabotage: 'hud.sabotage',
  jump: 'hud.jump', rope: 'hud.rope', burn: 'hud.burn', supply: 'hud.ammo'
}
const label = (id: HintId): string => t(LABELS[id])

/** On touch, one finger per spot: two gestures drawn on the stick at once
 *  would be neither. The list is already in order of urgency. */
const shown = computed(() => {
  if (hud.device !== 'touch') return hud.hints
  const taken = new Set<string>()
  return hud.hints.filter((h) => {
    const spot = SPOTS[h.id]
    if (!spot) return false
    if (taken.has(spot)) return false
    taken.add(spot)
    return true
  })
})

// A success flashes its glyph green for a moment.
const flashing = reactive<Partial<Record<HintId, boolean>>>({})
const seen: Partial<Record<HintId, number>> = {}
const timers: Partial<Record<HintId, number>> = {}
watch(() => hud.hints, (list) => {
  for (const h of list) {
    const before = seen[h.id]
    seen[h.id] = h.flash
    if (before === undefined || h.flash === before) continue
    flashing[h.id] = true
    window.clearTimeout(timers[h.id])
    timers[h.id] = window.setTimeout(() => { flashing[h.id] = false }, 380)
  }
})
onUnmounted(() => { for (const id of Object.values(timers)) window.clearTimeout(id) })
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
// The objective marker in miniature, for the lesson that says "go there".
.mini-pin
  display: grid
  place-items: center
  box-sizing: border-box
  width: clamp(1.7rem, 6.4vmin, 2.5rem)
  height: clamp(1.7rem, 6.4vmin, 2.5rem)
  border: var(--cm-edge) solid var(--cm-pink)
  border-radius: 50%
  background: var(--cm-glass)
  color: var(--cm-pink-hi)
  box-shadow: 0 0 0.6rem var(--cm-pink)
  animation: mini-pin 1.2s ease-in-out infinite alternate
  :deep(svg)
    width: 60%
    height: 60%
@keyframes mini-pin
  from
    translate: 0 0
  to
    translate: 0 -0.25rem
@media (prefers-reduced-motion: reduce)
  .mini-pin
    animation: none
.control-hints
  position: absolute
  inset: 0
  pointer-events: none
  // Desktop: the cards stack in the bottom-left corner, which a mouse player
  // has free (no stick there), so the middle of the view, where the mech
  // stands and whoever shoots at it, stays clear.
  &.mouse
    display: flex
    flex-direction: column-reverse
    align-items: flex-start
    justify-content: flex-start
    gap: clamp(0.4rem, 1.8vmin, 0.9rem)
    padding: 0 0 calc(var(--cm-safe-bottom) + clamp(4.2rem, 14vmin, 6rem)) var(--cm-safe-left)

.card
  display: flex
  align-items: center
  gap: clamp(0.3rem, 1.4vmin, 0.6rem)
  position: relative
  padding: clamp(0.3rem, 1.3vmin, 0.55rem) clamp(0.45rem, 1.8vmin, 0.8rem) clamp(0.55rem, 2.2vmin, 0.9rem)
  transition: border-color 160ms ease-out, background-color 160ms ease-out
  +tech-plate(var(--cm-cyan), tech-fill(var(--cm-cyan), 12%), 0.55rem)
  &.flash
    border-color: var(--cm-ok)
    background: rgba(77, 255, 176, 0.25)
.glyph
  display: flex
  align-items: center
  gap: clamp(0.15rem, 0.7vmin, 0.3rem)
// W over A S D.
.wasd
  display: grid
  grid-template-columns: repeat(3, auto)
  gap: clamp(0.12rem, 0.5vmin, 0.22rem)
  .w
    grid-column: 2
    grid-row: 1
  > :not(.w)
    grid-row: 2
.what
  width: clamp(1.2rem, 4.8vmin, 1.9rem)
  height: clamp(1.2rem, 4.8vmin, 1.9rem)
  color: var(--cm-pink-hi)
.pips
  position: absolute
  left: 50%
  bottom: clamp(0.14rem, 0.6vmin, 0.26rem)
  translate: -50% 0
  display: flex
  gap: clamp(0.12rem, 0.5vmin, 0.2rem)
.pip
  width: clamp(0.5rem, 2vmin, 0.8rem)
  height: clamp(0.16rem, 0.6vmin, 0.24rem)
  background: rgba(246, 241, 255, 0.25)
  +tech-cut(0.1rem)
  &.on
    background: var(--cm-ok)

// ── Touch spots ──
.spot
  position: absolute
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.15rem, 0.8vmin, 0.3rem)
  border-radius: 50%
  transition: filter 160ms ease-out
  .pips
    position: static
    translate: none
  &.flash
    filter: drop-shadow(0 0 0.6rem var(--cm-ok)) brightness(1.2)
  // Over the resting stick (the same place `Joystick.vue` draws it).
  &.stick
    --joy-size: clamp(5.5rem, 27vmin, 8.5rem)
    left: calc(env(safe-area-inset-left, 0px) + var(--joy-size) * 0.95)
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--joy-size) * 0.95)
    translate: -50% 50%
  // The middle of the right half: where the look-and-aim thumb works.
  &.right
    left: 74%
    top: 46%
    translate: -50% -50%
</style>
