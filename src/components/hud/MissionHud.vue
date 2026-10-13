<template lang="pug">
  div.mission-hud(:class="{ touch: hud.device === 'touch', aiming: hud.aiming }")
    HitFlash
    Reticle
    Joystick
    LookStick(:attention="teaching('look')")
    AimHold
    ThreatArcs
    //- Under what is said: a bar must never sit over a line of speech.
    HealthBars
    SpeechBubbles
    QuipBubble
    UplinkRings
    ObjectiveMarker
    ObjectiveMarker(v-for="(m, i) in targetMarks" :key="i" :mark="m" target)
    WorldPrompt
    DemoPop
    TrainingShout
    TrainingNudge(v-if="hud.training.on")
    RevealArrow
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
    div.strike.slot-context(v-if="hud.strike")
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
    div.strike.slot-context.sabotage(v-if="(hud.sabotage || hud.sabotaging > 0) && !hud.strike")
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
    div.strike.slot-context.loot(v-if="(hud.loot || hud.looting > 0) && !hud.strike")
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
    div.strike.drag(v-if="hud.drag && !hud.strike && !hud.loot && !hud.sabotage" :class="hud.burn ? 'beside slot-context2' : 'slot-context'")
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
    div.strike.slot-context.grapple(v-if="(hud.grapple || hud.grappling === 'up') && !hud.strike")
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
    div.strike.slot-context.burn(v-if="(hud.burn || hud.burning > 0) && !hud.strike && !hud.loot && !hud.sabotage")
      FHudButton(
        icon="flame"
        :tone="LOOK.burn.tone"
        :attention="hud.burning === 0"
        :hotkey="kb('burn')"
        :aria-label="t('hud.burn')"
        :shape="LOOK.burn.shape"
        data-testid="btn-burn"
        @click="input.burnQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.burning > 0" tone="warn") {{ Math.round(hud.burning * 100) }}%

    //- The rope gun (#94): somewhere to shoot a line to, from up high.
    div.strike.slot-context.rope(v-if="hud.rope && !hud.strike && !hud.loot && !hud.sabotage && !hud.drag")
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

    //- Touch: the scope's toggle, over the move stick. Its reticle raises
    //- the weapon and keeps it up (no finger has to stay down); up, it shows
    //- the reticle struck through, and lowers it again: nothing fired, the
    //- stealth kept. Shooting is the Shoot button, scoped or from the hip.
    div.zoom-pad(v-if="hud.device === 'touch' && hud.phase === 'play' && revealed('scope')")
      FHudButton(
        :icon="hud.aimHeld ? 'act-unscope' : LOOK.scope.icon"
        :tone="hud.aimHeld ? 'cyan' : LOOK.scope.tone"
        :shape="LOOK.scope.shape"
        :active="hud.aimHeld"
        :pressed="hud.aimHeld"
        :attention="teaching('scope')"
        :is-disabled="hud.mode !== 'ground' && !hud.aimHeld"
        :aria-label="hud.aimHeld ? t('hud.cancel') : t('hud.zoom')"
        data-testid="btn-scope"
        @click="toggleScope"
      )
    //- The right thumb's column, above where it rests.
    div.actions(ref="actionsEl")
      //- Touch: the trigger, big, beside jump. Held, the mini-gun keeps
      //- firing; off the scope it fires from the hip, as a mouse click does.
      FHudButton.slot-shoot(
        v-if="hud.device === 'touch' && revealed('shoot')"
        :icon="LOOK.shoot.icon"
        :tone="LOOK.shoot.tone"
        :shape="LOOK.shoot.shape"
        :attention="teaching('fire')"
        :is-disabled="hud.mode !== 'ground'"
        :aria-label="t('hint.fire')"
        data-testid="btn-shoot"
        @pointerdown="fireDown"
        @pointerup="fireUp"
        @pointercancel="fireUp"
        @lostpointercapture="fireUp"
      )
      //- The weapons (#161): each one drawn side on, in its colour, with no
      //- chip round it. On touch all three side by side, a switch to tap: the
      //- one in hand big and lit. On a desktop the one in hand, with the wheel
      //- and Tab that turn it; a click fans out the other two.
      //- On touch one button: the weapon in hand, a tap draws the next.
      button.weapon-swap.slot-weapon(
        v-if="hud.device === 'touch' && revealed('weapon')"
        type="button"
        :class="[`w-${hud.weapon}`, { 'is-attention': flare || teaching('weapon') || teaching('rocket') }]"
        :aria-label="t('hud.weapons')"
        data-testid="btn-weapons"
        @click="nextWeapon"
      )
        WeaponArt.swap-art(:weapon="hud.weapon")
        GameIcon.swap-glyph(name="act-swap")
        span.swap-pips
          span.swap-pip(v-for="w in WEAPON_IDS" :key="w" :class="{ on: w === hud.weapon }")
      div.weapons(v-else-if="hud.device !== 'touch'" :class="{ spread: spread }")
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
            span.key(v-if="hud.device === 'mouse'" aria-hidden="true" :data-code="primaryCode(WEAPON_KEYS[n] ?? 'cycle')" :data-action="WEAPON_KEYS[n] ?? 'cycle'") {{ weaponKeyText(n) }}
        button.weapon.held(
          v-else
          type="button"
          :class="`w-${hud.weapon}`"
          :aria-label="t('hud.weapons')"
          data-testid="btn-weapons"
          @click="wheelOpen = true"
        )
          WeaponArt(:weapon="hud.weapon")
          span.key.wide(v-if="hud.device === 'mouse'" aria-hidden="true" :data-code="primaryCode('cycle')" data-action="cycle")
            svg.wheel(viewBox="0 0 12 16")
              rect(x="1" y="1" width="10" height="14" rx="5")
              rect.lit(x="5" y="3" width="2" height="4" rx="1")
            span.or /
            | {{ cycleKeyText }}
      //- The situational three — sneak, disguise, decoy — in a row up in the
      //- top right, under the pause button; the thumb's corner keeps only
      //- jump, the trigger and the weapon switch round the look stick.
      FHudButton.slot-decoy(
        v-if="revealed('decoy')"
        :icon="LOOK.decoy.icon"
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
      FHudButton.slot-hide(
        v-if="revealed('hide')"
        :icon="LOOK.hide.icon"
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
      //- A thumb has no space bar: the jump has its chip (#95).
      FHudButton.slot-jump(
        v-if="hud.device === 'touch'"
        :icon="LOOK.jump.icon"
        :tone="LOOK.jump.tone"
        :attention="teaching('jump')"
        :is-disabled="hud.mode !== 'ground'"
        :aria-label="t('hud.jump')"
        :shape="LOOK.jump.shape"
        data-testid="btn-jump"
        @click="input.jumpQueued = true"
      )
      FHudButton.slot-crouch(
        v-if="revealed('crouch')"
        :icon="hud.crouched ? 'act-stand' : LOOK.crouch.icon"
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
import LookStick from '@/components/hud/LookStick.vue'
import RevealArrow from '@/components/hud/RevealArrow.vue'
import { revealed } from '@/components/hud/touchReveal'
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
import { hud, targetMarks } from '@/game/state/hud'
import { input } from '@/game/engine/inputState'
import { cancelAim, latchAim } from '@/game/engine/input'
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
// A lesson card for it, or the training's nudge pointing at it (#186): the button bounces.
const teaching = (id: HintId): boolean => hud.device === 'touch' && (hud.hints.some(h => h.id === id) || hud.training.nudge === id)

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
  // On touch it hangs under the pause button instead (the touch layout's CSS).
  if (hud.device === 'touch') { questStyle.value = {}; return }
  const fromBottom = host.clientHeight - el.offsetTop
  questStyle.value = { bottom: `calc(${fromBottom}px + var(--gap))` }
}
watch(() => hud.device, () => { void Promise.resolve().then(placeQuest) })
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
/** Touch, the scope's toggle: up and kept up, or down again without a shot. */
const toggleScope = (): void => {
  if (input.aimHeld) cancelAim(input)
  else latchAim(input)
}
/** Touch, Shoot: pressed is a shot (and the trigger held, for the mini-gun). */
const fireDown = (e: PointerEvent): void => {
  if (hud.mode !== 'ground') return
  try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* ignore */ }
  input.firePressed = true
  input.fireHeld = true
}
const fireUp = (): void => { input.fireHeld = false }
/** Touch: the weapon button draws the next weapon round. */
const nextWeapon = (): void => {
  sfx('uiClick')
  const n = WEAPON_IDS.indexOf(hud.weapon)
  input.weaponQueued = (((n + 1) % WEAPON_IDS.length) + 1) as 1 | 2 | 3
}
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

// ─── Touch: the thumb cluster (a mobile shooter's right hand) ────────────────
//
// Every action round one corner instead of one tall column (a landscape phone
// is ~375 px tall: the column ran off the bottom, the crouch button with it).
// Jump, big, in the corner; crouch, sprint and the hide box on the arc round
// it; the decoy and the weapon on the next arc; the hands' action (stab,
// loot, burn …) or, while aiming, the trigger, big, further in where the thumb
// rests. Positions are in button widths from the jump button's centre (x to
// the left, y up), worked out so no two buttons touch at any size; the look
// stick sits left of the cluster (above it in portrait). A gap off every edge.
=slot($x, $y, $size: var(--btn))
  position: absolute
  right: calc(var(--ax) + #{$x} * var(--btn) - #{$size} / 2)
  bottom: calc(var(--ay) + #{$y} * var(--btn) - #{$size} / 2)
  width: $size
  height: $size
  --cm-chip: #{$size}

.mission-hud.touch
  --btn: clamp(44px, 13.5vmin, 76px)
  --big: calc(var(--btn) * 1.32)
  --edge: clamp(14px, 4.5vmin, 30px)
  --stick: clamp(5.5rem, 27vmin, 8.5rem)
  // The jump button's centre, from the right and bottom edges.
  --ax: calc(var(--cm-safe-right) + var(--edge) + var(--big) / 2)
  --ay: calc(var(--cm-safe-bottom) + var(--edge) + var(--big) / 2)
  // The look stick's centre (#194): over the trigger, left of the weapon
  // switch — in the thumb's arc, where it rests between camera and trigger.
  --look-x: calc(var(--ax) + 1.55 * var(--btn))
  --look-y: calc(var(--ay) + 0.81 * var(--btn) + var(--stick) / 2)

  .actions
    position: absolute
    inset: 0
    display: block
  // The thumb's corner (the playtester's sketch): jump, the trigger beside
  // it, the weapon switch above jump and the look stick above the trigger —
  // so the camera turns while the stick walks — and the hands' action (stab,
  // loot, burn …) beside the trigger.
  .slot-jump
    +slot(0, 0, var(--big))
  .slot-shoot
    +slot(1.55, 0, var(--big))
  .slot-weapon
    +slot(-0.1, 1.5)
  // The hands' action left of the trigger (above the look stick upright, the
  // move stick being in the way down there).
  .slot-context
    +slot(3.05, 0.2, var(--big))
    @media (orientation: portrait)
      +slot(1.55, 3.9, var(--big))
  .slot-context2
    +slot(3.6, 1.8, var(--big))
    @media (orientation: portrait)
      +slot(-0.15, 3, var(--big))
  // The situational three, a row under the pause button: sneak nearest the edge.
  .slot-crouch, .slot-hide, .slot-decoy
    position: absolute
    top: calc(var(--cm-safe-top) + var(--cm-chip) + var(--gap))
    width: var(--btn)
    height: var(--btn)
    --cm-chip: var(--btn)
  .slot-crouch
    right: var(--cm-safe-right)
  .slot-hide
    right: calc(var(--cm-safe-right) + var(--btn) + var(--gap))
  .slot-decoy
    right: calc(var(--cm-safe-right) + (var(--btn) + var(--gap)) * 2)
  .strike :deep(.f-hud-button)
    width: 100%
    height: 100%
  // The quest log hangs under the situational row, clear of the cluster.
  .quest
    top: calc(var(--cm-safe-top) + var(--cm-chip) + var(--btn) + var(--gap) * 2)
    bottom: auto !important

  // The scope's toggle, up and to the right of the move stick's ring
  // (`Joystick.vue`: its centre 0.95 rings in from the corner): off the
  // diagonal, it clears the room's objective card above the stick.
  .zoom-pad
    --pad-d: calc((var(--stick) + var(--btn)) / 2 + var(--gap))
    position: absolute
    left: calc(env(safe-area-inset-left, 0px) + var(--stick) * 0.95 + var(--pad-d) * 0.71)
    bottom: calc(env(safe-area-inset-bottom, 0px) + var(--stick) * 0.95 + var(--pad-d) * 0.71)
    translate: -50% 50%
    display: flex
    gap: calc(var(--btn) * 0.25)
    --cm-chip: var(--btn)

// The weapon on touch: the one in hand, drawn, in a round key of its colour;
// a tap draws the next (the swap arrows and three pips say so).
.weapon-swap
  --wt: var(--cm-cyan)
  display: grid
  place-items: center
  padding: 0
  border: var(--cm-edge) solid var(--wt)
  border-radius: 50%
  background: radial-gradient(circle at 50% 35%, rgba(43, 27, 92, 0.85), rgba(21, 12, 43, 0.85))
  box-shadow: 0 0 0.5rem color-mix(in srgb, var(--wt) 60%, transparent)
  cursor: pointer
  pointer-events: auto
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  &.w-minigun
    --wt: var(--cm-violet)
  &.w-rocket
    --wt: var(--cm-danger)
  &:active
    filter: brightness(0.9)
  &.is-attention
    animation: weapon-call-ring 1.2s ease-in-out infinite
.swap-art
  width: 86%
  height: 50%
.swap-glyph
  position: absolute
  right: -6%
  top: -6%
  width: 38%
  height: 38%
  padding: 6%
  box-sizing: border-box
  border-radius: 50%
  color: var(--cm-ink)
  background: var(--wt)
.swap-pips
  position: absolute
  bottom: 12%
  display: flex
  gap: 0.18rem
.swap-pip
  width: 0.32rem
  height: 0.32rem
  border-radius: 50%
  background: rgba(246, 241, 255, 0.3)
  &.on
    background: var(--wt)
@keyframes weapon-call-ring
  50%
    box-shadow: 0 0 0 0.35rem rgba(255, 210, 63, 0.85)
@media (prefers-reduced-motion: reduce)
  .weapon-swap.is-attention
    animation: none
    box-shadow: 0 0 0 0.3rem rgba(255, 210, 63, 0.85)
</style>
