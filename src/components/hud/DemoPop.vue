<template lang="pug">
  //- The training hologram's button press (#114): its key (on a keyboard),
  //- the mouse button, or the button's picture (on touch) pops up over the
  //- hologram's head, rises and fades. Pinned by a HUD ticker.
  div.demo-pop(ref="el" aria-hidden="true")
    div.chip(v-if="hint" :key="seq")
      template(v-if="hud.device === 'mouse'")
        MouseGlyph.mouse(v-if="MOUSE[hint]" :lit="MOUSE[hint]")
        KeyCap(v-else :action="KEYS[hint] ?? 'act'")
      GameIcon.icon(v-else :name="ICONS[hint] ?? 'mech'")
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import KeyCap from '@/components/hud/hints/KeyCap.vue'
import MouseGlyph from '@/components/hud/hints/MouseGlyph.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import type { GameIconName } from '@/components/icons/iconNames'
import type { Action } from '@/game/engine/keyBindings'
import { addHudTicker, demoPop, hud } from '@/game/state/hud'

/** The key each control is pressed with (the player's own binding is lettered by KeyCap). */
const KEYS: Readonly<Record<string, Action>> = {
  move: 'forward', climb: 'forward', supply: 'forward', crouch: 'crouch', blade: 'act', decoy: 'decoy', hide: 'hide',
  grapple: 'grapple', sabotage: 'act', loot: 'act', jump: 'jump', rope: 'rope', burn: 'act', weapon: 'cycle', sprint: 'sprint', goal: 'forward'
}
/** The ones a mouse does. */
const MOUSE: Readonly<Record<string, 'move' | 'left' | 'right'>> = { look: 'move', scope: 'right', fire: 'left' }
/** On touch: the button's own picture. */
const ICONS: Readonly<Record<string, GameIconName>> = {
  move: 'mech', look: 'eye', scope: 'scope', fire: 'sniper', crouch: 'crouch', blade: 'blade', climb: 'up', decoy: 'decoy',
  weapon: 'minigun', sprint: 'sprint', grapple: 'hook', loot: 'scrap', goal: 'mech', hide: 'box', sabotage: 'siren',
  jump: 'up', rope: 'rope', burn: 'flame', supply: 'bolt'
}

const el = ref<HTMLElement | null>(null)
const hint = ref('')
const seq = ref(0)
let off: (() => void) | null = null

onMounted(() => {
  let shown = false
  off = addHudTicker(() => {
    const e = el.value
    if (!e) return
    if (demoPop.on !== shown) {
      shown = demoPop.on
      e.style.opacity = shown ? '1' : '0'
    }
    if (demoPop.seq !== seq.value) { seq.value = demoPop.seq; hint.value = demoPop.hint }
    if (!shown) return
    e.style.left = `${(demoPop.x * 100).toFixed(2)}%`
    e.style.top = `${(demoPop.y * 100).toFixed(2)}%`
  })
})
onUnmounted(() => off?.())
</script>

<style scoped lang="sass">
.demo-pop
  position: absolute
  translate: -50% -100%
  opacity: 0
  transition: opacity 120ms ease-out
  pointer-events: none
.chip
  display: flex
  align-items: center
  justify-content: center
  min-width: 2.2rem
  min-height: 2.2rem
  padding: 0.25rem
  border: var(--cm-edge, 2px) solid var(--cm-cyan, #5fe9ff)
  border-radius: 0.7rem
  background: rgba(10, 5, 24, 0.55)
  box-shadow: 0 0 0.8rem rgba(95, 233, 255, 0.6)
  color: var(--cm-cyan, #5fe9ff)
  animation: demo-pop 1.6s ease-out forwards
.mouse
  width: 1.3rem
  height: 1.8rem
.icon
  width: 1.5rem
  height: 1.5rem
@keyframes demo-pop
  0%
    transform: translateY(0.6rem)
    opacity: 0
  12%
    opacity: 1
  70%
    opacity: 1
  100%
    transform: translateY(-2.4rem)
    opacity: 0
</style>
