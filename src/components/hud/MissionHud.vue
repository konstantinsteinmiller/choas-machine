<template lang="pug">
  div.mission-hud
    HitFlash
    Reticle
    Joystick
    AimHold
    ThreatArcs
    SpeechBubbles
    QuipBubble
    HealthBars
    UplinkRings
    ObjectiveMarker
    WorldPrompt
    DemoPop
    TrainingShout
    TrainingNudge(v-if="hud.training.on")
    ControlHints

    //- CM-07's unit frame (#145): portrait, health, the weapon in hand, the
    //- base's alert and its alarm.
    div.top-left
      UnitFrame
      //- The training ground's rooms, under the frame like a quest's steps.
      TrainingHud

    div.top-centre
      //- The boss that was hit: its health, in ten plates. A shield glyph when
      //- it carries one (go round it).
      div.boss-bar(
        v-if="hud.bossKind"
        :class="hud.bossKind"
        role="img"
        :aria-label="t('hud.boss', { n: Math.round(hud.bossHp * 100) })"
        data-testid="boss-bar"
      )
        GameIcon(:name="hud.bossKind === 'warden' ? 'skull' : 'warning'")
        div.plates
          span.plate(v-for="n in 10" :key="n" :class="{ on: n <= Math.ceil(hud.bossHp * 10) }")
        GameIcon.shield(v-if="hud.bossShield" name="shield")
        //- No blade takes a boss: the mark says so.
        span.no-blade(role="img" :aria-label="t('hud.noBlade')")
          GameIcon(name="blade")
      //- What each round took off the boss: numbers that pop and float away.
      div.boss-pops(v-if="hud.bossKind" aria-hidden="true")
        span.pop(v-for="p in pops" :key="p.id") −{{ p.amount }}

    div.top-right
      //- The lessons, back on request.
      FHudButton(icon="help" tone="violet" :hotkey="kb('help')" :aria-label="t('hint.help')" data-testid="btn-help" @click="busEmit('help', {})")
      FHudButton(icon="pause" :hotkey="kb('pause')" :aria-label="t('ui.pause')" data-testid="btn-pause" @click="emit('pause')")

    //- The quick quest log (#145): just above the right thumb's column,
    //- wherever that column ends (`questStyle`).
    div.quest(v-if="!hud.training.on" :style="questStyle")
      QuestLog

    //- The blade's offer: big, pink and under the right thumb's reach. A tap
    //- anywhere on the right does the same; this is the picture of it.
    div.strike(v-if="hud.strike")
      FHudButton(
        icon="blade"
        :tone="LOOK.strike.tone"
        attention
        :aria-label="t('hud.strike')"
        :hotkey="kb('act')"
        :shape="LOOK.strike.shape"
        data-testid="btn-strike"
        @click="input.actQueued = true"
      )

    //- An alarm beacon within reach, nobody looking: the same tap sabotages it.
    div.strike.sabotage(v-if="(hud.sabotage || hud.sabotaging > 0) && !hud.strike")
      FHudButton(
        :icon="hud.sabotage === 'generator' || hud.sabotage === 'servo' ? 'bolt' : 'siren'"
        :tone="LOOK.sabotage.tone"
        :attention="hud.sabotaging === 0"
        :aria-label="t(hud.sabotage === 'generator' ? 'hud.cutPower' : hud.sabotage === 'servo' ? 'hud.jamServo' : hud.sabotage === 'alarm' ? 'hud.silence' : 'hud.sabotage')"
        :hotkey="kb('act')"
        :shape="LOOK.sabotage.shape"
        data-testid="btn-sabotage"
        @click="input.actQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.sabotaging > 0" tone="warn") {{ Math.round(hud.sabotaging * 100) }}%

    //- A pile within reach: the same tap that strikes strips it. The ring
    //- fills while the mech works.
    div.strike.loot(v-if="(hud.loot || hud.looting > 0) && !hud.strike")
      FHudButton(
        icon="scrap"
        :tone="LOOK.loot.tone"
        :attention="hud.looting === 0 || teaching('loot')"
        :aria-label="t('hud.loot')"
        :hotkey="kb('act')"
        :shape="LOOK.loot.shape"
        data-testid="btn-loot"
        @click="input.actQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.looting > 0" tone="warn") {{ Math.round(hud.looting * 100) }}%

    //- A body within reach: the same tap grabs it; in tow, the tap lets go
    //- (into a container, if one is at hand).
    //- Beside the flame chip when a body could be burned as well (#99: E burns, F drags).
    div.strike.drag(v-if="hud.drag && !hud.strike && !hud.loot && !hud.sabotage" :class="{ beside: hud.burn }")
      FHudButton(
        :icon="hud.drag === 'grab' ? 'skull' : 'box'"
        :tone="LOOK.drag.tone"
        :attention="hud.drag === 'grab'"
        :aria-label="t(hud.drag === 'grab' ? 'hud.dragBody' : 'hud.dropBody')"
        :hotkey="kb('drag')"
        :shape="LOOK.drag.shape"
        data-testid="btn-drag"
        @click="input.dragQueued = true"
      )

    //- The hook's offer at the foot of a wall; once it is out, the same
    //- place takes it back (red while somebody up there is wondering).
    div.strike.grapple(v-if="(hud.grapple || hud.grappling === 'up') && !hud.strike")
      FHudButton(
        :icon="hud.grappling ? 'close' : 'hook'"
        :tone="hud.grappling ? (hud.grappleHeard > 0 ? 'danger' : 'violet') : LOOK.grapple.tone"
        :attention="!hud.grappling || hud.grappleHeard > 0"
        :aria-label="hud.grappling ? t('hud.grappleRecall') : t('hud.grapple')"
        :hotkey="kb('grapple')"
        :shape="LOOK.grapple.shape"
        data-testid="btn-grapple"
        @click="input.grappleQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.grappling && hud.grappleHeard > 0" tone="warn") {{ hud.grappleHeard }}

    //- The flamethrower (#99): a body or a wreck at the mech's feet, to ash.
    div.strike.burn(v-if="(hud.burn || hud.burning > 0) && !hud.strike && !hud.loot && !hud.sabotage")
      FHudButton(
        icon="flame"
        :tone="LOOK.burn.tone"
        :attention="hud.burning === 0"
        :hotkey="kb('act')"
        :aria-label="t('hud.burn')"
        :shape="LOOK.burn.shape"
        data-testid="btn-burn"
        @click="input.burnQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.burning > 0" tone="warn") {{ Math.round(hud.burning * 100) }}%

    //- The rope gun (#94): somewhere to shoot a line to, from up high.
    div.strike.rope(v-if="hud.rope && !hud.strike && !hud.loot && !hud.sabotage && !hud.drag")
      FHudButton(
        icon="rope"
        :tone="LOOK.rope.tone"
        attention
        :hotkey="kb('rope')"
        :aria-label="t('hud.rope')"
        :shape="LOOK.rope.shape"
        data-testid="btn-rope"
        @click="input.ropeQueued = true"
      )
        template(#badge)
          FHudBadge(tone="cyan") {{ hud.ropes }}

    //- The right thumb's column, above where it rests.
    div.actions(ref="actionsEl")
      //- On touch, on the scope: a chip that zooms a notch (and round again).
      FHudButton(
        v-if="hud.scoped && hud.device === 'touch'"
        icon="scope"
        :tone="LOOK.zoom.tone"
        :aria-label="t('hud.zoom')"
        data-testid="btn-zoom"
        @click="busEmit('zoom', {})"
      )
        template(#badge)
          FHudBadge(tone="cyan") ×{{ hud.zoom }}
      //- On touch, while aiming: a button that fires (letting go of the screen does too).
      FHudButton(
        v-if="hud.aiming && hud.device === 'touch'"
        :icon="hud.weapon"
        tone="pink"
        :aria-label="t('hint.fire')"
        data-testid="btn-fire"
        @click="input.firePressed = true"
      )
      FHudButton(
        v-if="hud.aiming && hud.device === 'touch'"
        icon="close"
        :tone="LOOK.cancel.tone"
        :aria-label="t('hud.cancel')"
        data-testid="btn-cancel"
        @click="cancelAim(input)"
      )
      //- The weapons (#161): each one drawn side on, in its colour, with no
      //- chip round it. On touch all three side by side, a switch to tap: the
      //- one in hand big and lit. On a desktop the one in hand, with the wheel
      //- and Tab that turn it; a click fans out the other two.
      div.weapons(:class="{ spread: spread }")
        template(v-if="spread")
          button.weapon(
            v-for="(w, n) in WEAPON_IDS"
            :key="w"
            type="button"
            :class="[`w-${w}`, { held: hud.weapon === w, 'is-attention': flare || (teaching('weapon') && hud.weapon !== w) }]"
            :aria-label="t(`options.actions.weapon${n + 1}`)"
            :aria-pressed="hud.weapon === w"
            :data-testid="`btn-weapon-${w}`"
            @click="pick(n)"
          )
            WeaponArt(:weapon="w")
            span.key(v-if="hud.device === 'mouse'" aria-hidden="true") {{ weaponKeyText(n) }}
        button.weapon.held(
          v-else
          type="button"
          :class="`w-${hud.weapon}`"
          :aria-label="t('hud.weapons')"
          data-testid="btn-weapons"
          @click="wheelOpen = true"
        )
          WeaponArt(:weapon="hud.weapon")
          span.key.wide(v-if="hud.device === 'mouse'" aria-hidden="true")
            svg.wheel(viewBox="0 0 12 16")
              rect(x="1" y="1" width="10" height="14" rx="5")
              rect.lit(x="5" y="3" width="2" height="4" rx="1")
            span.or /
            | {{ cycleKeyText }}
      FHudButton(
        icon="decoy"
        :tone="LOOK.decoy.tone"
        :attention="teaching('decoy')"
        :is-disabled="hud.decoys <= 0 || hud.mode !== 'ground'"
        :aria-label="t('hud.decoy')"
        :hotkey="kb('decoy')"
        :shape="LOOK.decoy.shape"
        data-testid="btn-decoy"
        @click="input.decoyQueued = true"
      )
        //- The next decoy in N seconds (#114); nothing on the chip when one is ready.
        template(#badge v-if="hud.decoyCool > 0")
          FHudBadge(tone="cyan") {{ hud.decoyCool }}
      //- The hide box: down over the mech, and off again.
      FHudButton(
        icon="box"
        :tone="LOOK.hide.tone"
        :active="hud.boxed"
        :pressed="hud.boxed"
        :is-disabled="hud.mode !== 'ground'"
        :attention="teaching('hide')"
        :aria-label="t('hud.hide')"
        :hotkey="kb('hide')"
        :shape="LOOK.hide.shape"
        data-testid="btn-hide"
        @click="input.hideQueued = true"
      )
      //- A thumb has no Shift key: sprint is a switch here. It lets go by
      //- itself when the stick does.
      FHudButton(
        v-if="hud.device === 'touch'"
        icon="sprint"
        :tone="LOOK.sprint.tone"
        :active="hud.sprinting || input.sprintHeld"
        :pressed="input.sprintHeld"
        :is-disabled="hud.mode !== 'ground'"
        :attention="teaching('sprint')"
        :aria-label="t('hud.sprint')"
        :shape="LOOK.sprint.shape"
        data-testid="btn-sprint"
        @click="input.sprintHeld = !input.sprintHeld"
      )
      //- A thumb has no space bar: the jump has its chip (#95).
      FHudButton(
        v-if="hud.device === 'touch'"
        icon="up"
        :tone="LOOK.jump.tone"
        :attention="teaching('jump')"
        :is-disabled="hud.mode !== 'ground'"
        :aria-label="t('hud.jump')"
        :shape="LOOK.jump.shape"
        data-testid="btn-jump"
        @click="input.jumpQueued = true"
      )
      FHudButton(
        :icon="hud.crouched ? 'stand' : 'crouch'"
        :tone="LOOK.crouch.tone"
        :attention="teaching('crouch')"
        :active="hud.crouched"
        :pressed="hud.crouched"
        :is-disabled="hud.mode !== 'ground'"
        :aria-label="hud.crouched ? t('hud.stand') : t('hud.crouch')"
        :hotkey="kb('crouch')"
        :shape="LOOK.crouch.shape"
        data-testid="btn-crouch"
        @click="input.crouchQueued = true"
      )
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FHudButton from '@/components/atoms/FHudButton.vue'
import WeaponArt from '@/components/hud/WeaponArt.vue'
import { sfx } from '@/game/audio/sfx'
import { primaryCode } from '@/game/engine/keyBindings'
import { keyLabel } from '@/game/engine/keyLabels'
import { BUTTON_LOOK as LOOK } from '@/components/hud/touchLook'
import HealthBars from '@/components/hud/HealthBars.vue'
import UplinkRings from '@/components/hud/UplinkRings.vue'
import WorldPrompt from '@/components/hud/WorldPrompt.vue'
import DemoPop from '@/components/hud/DemoPop.vue'
import TrainingShout from '@/components/hud/TrainingShout.vue'
import TrainingNudge from '@/components/hud/TrainingNudge.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import FHudBadge from '@/components/atoms/FHudBadge.vue'
import Joystick from '@/components/hud/Joystick.vue'
import AimHold from '@/components/hud/AimHold.vue'
import ThreatArcs from '@/components/hud/ThreatArcs.vue'
import ObjectiveMarker from '@/components/hud/ObjectiveMarker.vue'
import SpeechBubbles from '@/components/hud/SpeechBubbles.vue'
import QuipBubble from '@/components/hud/QuipBubble.vue'
import TrainingHud from '@/components/hud/TrainingHud.vue'
import ControlHints from '@/components/hud/ControlHints.vue'
import { emit as busEmit, on } from '@/game/bus'
import type { Action } from '@/game/engine/keyBindings'
import Reticle from '@/components/hud/Reticle.vue'
import UnitFrame from '@/components/hud/UnitFrame.vue'
import QuestLog from '@/components/hud/QuestLog.vue'
import HitFlash from '@/components/hud/HitFlash.vue'
import { hud } from '@/game/state/hud'
import { input } from '@/game/engine/inputState'
import { cancelAim } from '@/game/engine/input'
import { WEAPON_IDS, type WeaponId } from '@/game/data/ids'
import type { HintId } from '@/game/sim/coach'

/**
 * The mission's HUD. The layer lets every press through to the scene under
 * it; each control takes its own pointers back. Controls sit in the corners,
 * inside the safe area, clear of the two thumbs' zones: the stick's ring low
 * on the left, the look-and-aim half on the right.
 */
const emit = defineEmits<{ (e: 'pause'): void }>()
const { t } = useI18n()


/** A control lesson is on for this chip: it pulses until it has been used. */
/** On a desktop every chip shows the key that works it (the mouse is captured, so the chip cannot be clicked, #82). */
const kb = (a: Action): Action | undefined => (hud.device === 'mouse' ? a : undefined)
const WEAPON_KEYS: readonly Action[] = ['weapon1', 'weapon2', 'weapon3']
const teaching = (id: HintId): boolean => hud.device === 'touch' && hud.hints.some(h => h.id === id)

// ── The quest log sits on the action column (#145) ──
// The column's height changes with the device and with what is on offer, so
// it is measured: the log stands a gap above the column's top.
const actionsEl = ref<HTMLElement | null>(null)
const questStyle = ref<Record<string, string>>({})
let ro: ResizeObserver | null = null
const placeQuest = (): void => {
  const el = actionsEl.value
  const host = el?.offsetParent as HTMLElement | null
  if (!el || !host) return
  const fromBottom = host.clientHeight - el.offsetTop
  questStyle.value = { bottom: `calc(${fromBottom}px + var(--gap))` }
}
onMounted(() => {
  placeQuest()
  if (typeof ResizeObserver !== 'undefined' && actionsEl.value) {
    ro = new ResizeObserver(placeQuest)
    ro.observe(actionsEl.value)
  }
  window.addEventListener('resize', placeQuest)
})
onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', placeQuest)
})

// ── Boss damage: a number pops for each round that landed ──
const pops = ref<Array<{ id: number; amount: number }>>([])
let popId = 0
const offBoss = on('bossHit', ({ amount }) => {
  if (amount <= 0) return
  const id = ++popId
  pops.value = [...pops.value.slice(-3), { id, amount }]
  window.setTimeout(() => { pops.value = pops.value.filter(p => p.id !== id) }, 900)
})
onUnmounted(offBoss)

// ── The weapon wheel ──
const wheelOpen = ref(false)
// The first time the base goes loud, the wheel fans open with every chip
// pulsing: the moment the other guns are for.
const flare = ref(false)
let flared = false
const offChaos = on('chaos', () => {
  if (flared) return
  flared = true
  flare.value = true
  wheelOpen.value = true
  window.setTimeout(() => { flare.value = false }, 3500)
})
onUnmounted(offChaos)
let closeTimer = 0
const pick = (n: number): void => {
  sfx('uiClick')
  input.weaponQueued = (n + 1) as 1 | 2 | 3
  wheelOpen.value = false
}
/** All three out (#161): always on touch, a switch to tap; on a desktop while the wheel is open. */
const spread = computed(() => hud.device === 'touch' || wheelOpen.value)
/** The keys lettered on the weapons: 1, 2, 3, and the one that turns through them. */
const weaponKeyText = (n: number): string => keyLabel(primaryCode(WEAPON_KEYS[n] ?? 'cycle'))
const cycleKeyText = computed(() => (primaryCode('cycle') === 'Tab' ? 'Tab' : keyLabel(primaryCode('cycle'))))
// An open wheel nobody picks from folds away again.
watch(wheelOpen, (open) => {
  window.clearTimeout(closeTimer)
  if (open) closeTimer = window.setTimeout(() => { wheelOpen.value = false }, 3500)
})
onUnmounted(() => window.clearTimeout(closeTimer))
</script>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
.mission-hud
  --gap: clamp(0.4rem, 1.8vmin, 0.8rem)
  position: absolute
  inset: 0
  pointer-events: none

.no-blade
  position: relative
  display: inline-grid
  width: 1.1em
  height: 1.1em
  opacity: 0.85
  :deep(svg)
    width: 100%
    height: 100%
  &::after
    content: ''
    position: absolute
    left: -10%
    right: -10%
    top: 50%
    height: 0.14em
    background: #ff4060
    rotate: -40deg
    border-radius: 999px
.boss-pops
  position: relative
  height: 0
  .pop
    position: absolute
    left: 50%
    top: 0.2em
    color: #ffd27a
    font-family: var(--font-display, inherit)
    font-size: var(--cm-fs-m)
    text-shadow: var(--cm-text-outline)
    animation: boss-pop 0.9s ease-out forwards
    pointer-events: none
@keyframes boss-pop
  from
    opacity: 1
    translate: -50% 0
  to
    opacity: 0
    translate: -50% -1.6em
@media (prefers-reduced-motion: reduce)
  .boss-pops .pop
    animation: none
.boss-bar
  display: flex
  align-items: center
  gap: 0.35em
  margin-top: 0.35em
  padding: 0.25em 0.6em
  color: var(--cm-danger)
  pointer-events: none
  +tech-plate(var(--cm-danger), tech-fill(var(--cm-danger), 14%), 0.55rem)
  :deep(svg)
    width: 1.2em
    height: 1.2em
  .shield
    color: var(--cm-cyan-hi)
.plates
  display: flex
  gap: 0.12em
.plate
  width: clamp(0.6rem, 2.2vmin, 0.9rem)
  height: clamp(0.4rem, 1.4vmin, 0.6rem)
  background: rgba(246, 241, 255, 0.15)
  +tech-cut(0.15rem)
  &.on
    background: linear-gradient(180deg, #ff96ab, var(--cm-danger))
    box-shadow: 0 0 0.3rem rgba(255, 85, 118, 0.7)

.top-centre
  position: absolute
  top: var(--cm-safe-top)
  left: 50%
  translate: -50% 0

.top-right
  position: absolute
  top: var(--cm-safe-top)
  right: var(--cm-safe-right)
  display: flex
  gap: var(--gap)

.top-left
  position: absolute
  top: var(--cm-safe-top)
  left: var(--cm-safe-left)
  display: flex
  flex-direction: column
  align-items: flex-start
  gap: clamp(0.25rem, 1.2vmin, 0.5rem)

// Right edge, its foot a gap above the action column (`placeQuest`).
.quest
  position: absolute
  right: var(--cm-safe-right)
  bottom: calc(var(--cm-safe-bottom) + 40vh)

.actions
  position: absolute
  right: var(--cm-safe-right)
  bottom: var(--cm-safe-bottom)
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: var(--gap)

.weapons
  display: flex
  flex-direction: row-reverse
  align-items: center
  gap: var(--gap)
  &.spread
    flex-direction: row

// A weapon, drawn (#161): no plate, no border; it is the button. The one in
// hand is big and lit, the others smaller and dimmed; a bar of its colour
// under the one in hand.
.weapon
  --wt: var(--cm-cyan)
  position: relative
  display: flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  width: calc(var(--cm-chip) * 1.7)
  height: var(--cm-chip)
  min-height: 2.5rem
  padding: 0.2rem 0.15rem
  border: 0
  background: none
  cursor: pointer
  pointer-events: auto
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  opacity: 0.72
  filter: saturate(0.55) brightness(0.85)
  transition: opacity 140ms ease-out, filter 140ms ease-out, width 140ms ease-out
  &.w-minigun
    --wt: var(--cm-violet)
  &.w-rocket
    --wt: var(--cm-danger)
  &.held
    width: calc(var(--cm-chip) * 2.5)
    opacity: 1
    filter: none
    &::after
      content: ''
      position: absolute
      left: 12%
      right: 12%
      bottom: 0.05rem
      height: 0.2rem
      background: var(--wt)
      box-shadow: 0 0 0.5rem var(--wt)
      +tech-cut(0.1rem)
  &:hover
    opacity: 0.85
  &.held:hover
    opacity: 1
  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
  &.is-attention:not(.held)
    animation: weapon-call 1.2s ease-in-out infinite
@keyframes weapon-call
  50%
    opacity: 1
    filter: none
@media (prefers-reduced-motion: reduce)
  .weapon.is-attention:not(.held)
    animation: none
    opacity: 0.85
// Its key (desktop), small in the bottom-left corner, as on every chip.
.weapon .key
  position: absolute
  left: 0
  bottom: 0
  min-width: 1.15rem
  height: 1.15rem
  padding: 0 0.2rem
  box-sizing: border-box
  display: flex
  align-items: center
  justify-content: center
  color: var(--cm-text)
  font-size: 0.68rem
  line-height: 1
  text-transform: uppercase
  white-space: nowrap
  pointer-events: none
  +tech-plate(var(--cm-cyan), linear-gradient(180deg, #4a3590, #2a1a5e), 0.28rem, var(--cm-edge), false)
  &.wide
    font-size: 0.55rem
  .wheel
    width: 0.6rem
    height: 0.8rem
    flex: none
    rect
      fill: none
      stroke: currentColor
      stroke-width: 1.4
    rect.lit
      fill: currentColor
      stroke: none
  .or
    margin: 0 0.12rem
    opacity: 0.7

// Left of the action column, level with its middle: where the thumb comes
// from, and never under the column itself.
.strike
  position: absolute
  right: calc(var(--cm-safe-right) + var(--cm-chip) + var(--gap) * 2)
  bottom: calc(var(--cm-safe-bottom) + var(--cm-chip) * 1.2)
  --cm-chip: clamp(3.2rem, 14vmin, 4.6rem)
  &.beside
    right: calc(var(--cm-safe-right) + var(--cm-chip) * 2 + var(--gap) * 3)
</style>
