<template lang="pug">
  div.mission-hud
    HitFlash
    Reticle
    Joystick
    AimHold
    ThreatArcs
    ObjectiveMarker
    ControlHints

    div.top-centre
      AlertMeter
      //- The raid's haul: piles stripped of those it needs. Glyph and digits only.
      div.haul(
        v-if="hud.salvageNeed > 0"
        :class="{ done: hud.salvageGot >= hud.salvageNeed }"
        role="img"
        :aria-label="t('hud.haul', { n: hud.salvageGot, need: hud.salvageNeed })"
        data-testid="haul"
      )
        GameIcon(name="scrap")
        span {{ hud.salvageGot }}/{{ hud.salvageNeed }}
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

    div.top-right
      //- The lessons, back on request.
      FHudButton(icon="help" tone="violet" :aria-label="t('hint.help')" data-testid="btn-help" @click="busEmit('help', {})")
      FHudButton(icon="pause" :aria-label="t('ui.pause')" data-testid="btn-pause" @click="emit('pause')")

    div.bottom-centre
      ArmorBar
      AmmoStrip

    //- The blade's offer: big, pink and under the right thumb's reach. A tap
    //- anywhere on the right does the same; this is the picture of it.
    div.strike(v-if="hud.strike")
      FHudButton(
        icon="blade"
        tone="pink"
        attention
        :aria-label="t('hud.strike')"
        data-testid="btn-strike"
        @click="input.actQueued = true"
      )

    //- An alarm beacon within reach, nobody looking: the same tap sabotages it.
    div.strike.sabotage(v-if="(hud.sabotage || hud.sabotaging > 0) && !hud.strike")
      FHudButton(
        icon="siren"
        tone="danger"
        :attention="hud.sabotaging === 0"
        :aria-label="t('hud.sabotage')"
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
        tone="warn"
        :attention="hud.looting === 0 || teaching('loot')"
        :aria-label="t('hud.loot')"
        data-testid="btn-loot"
        @click="input.actQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.looting > 0" tone="warn") {{ Math.round(hud.looting * 100) }}%

    //- The hook's offer at the foot of a wall; once it is out, the same
    //- place takes it back (red while somebody up there is wondering).
    div.strike.grapple(v-if="(hud.grapple || hud.grappling === 'up') && !hud.strike")
      FHudButton(
        :icon="hud.grappling ? 'close' : 'hook'"
        :tone="hud.grappling ? (hud.grappleHeard > 0 ? 'danger' : 'violet') : 'cyan'"
        :attention="!hud.grappling || hud.grappleHeard > 0"
        :aria-label="hud.grappling ? t('hud.grappleRecall') : t('hud.grapple')"
        data-testid="btn-grapple"
        @click="input.grappleQueued = true"
      )
        template(#badge)
          FHudBadge(v-if="hud.grappling && hud.grappleHeard > 0" tone="warn") {{ hud.grappleHeard }}

    //- The right thumb's column, above where it rests.
    div.actions
      FHudButton(
        v-if="hud.aiming && hud.device === 'touch'"
        icon="close"
        tone="danger"
        :aria-label="t('hud.cancel')"
        data-testid="btn-cancel"
        @click="cancelAim(input)"
      )
      div.weapons
        //- The wheel: the other weapons fan out beside the one in hand.
        template(v-if="wheelOpen")
          FHudButton(
            v-for="(w, n) in WEAPON_IDS"
            :key="w"
            :icon="w"
            :tone="TONES[w]"
            :active="hud.weapon === w"
            :aria-label="t(`options.actions.weapon${n + 1}`)"
            :data-testid="`btn-weapon-${w}`"
            @click="pick(n)"
          )
        FHudButton(
          v-else
          :icon="hud.weapon"
          :tone="TONES[hud.weapon]"
          :attention="teaching('weapon')"
          :aria-label="t('hud.weapons')"
          data-testid="btn-weapons"
          @click="wheelOpen = true"
        )
      FHudButton(
        icon="decoy"
        :attention="teaching('decoy')"
        :is-disabled="hud.decoys <= 0 || hud.mode !== 'ground'"
        :aria-label="t('hud.decoy')"
        data-testid="btn-decoy"
        @click="input.decoyQueued = true"
      )
        template(#badge)
          FHudBadge(tone="cyan") {{ hud.decoys }}
      //- The hide box: down over the mech, and off again.
      FHudButton(
        icon="box"
        tone="violet"
        :active="hud.boxed"
        :pressed="hud.boxed"
        :is-disabled="hud.mode !== 'ground'"
        :attention="teaching('hide')"
        :aria-label="t('hud.hide')"
        data-testid="btn-hide"
        @click="input.hideQueued = true"
      )
      //- A thumb has no Shift key: sprint is a switch here. It lets go by
      //- itself when the stick does.
      FHudButton(
        v-if="hud.device === 'touch'"
        icon="sprint"
        tone="warn"
        :active="hud.sprinting || input.sprintHeld"
        :pressed="input.sprintHeld"
        :is-disabled="hud.mode !== 'ground'"
        :attention="teaching('sprint')"
        :aria-label="t('hud.sprint')"
        data-testid="btn-sprint"
        @click="input.sprintHeld = !input.sprintHeld"
      )
      FHudButton(
        :icon="hud.crouched ? 'stand' : 'crouch'"
        tone="violet"
        :attention="teaching('crouch')"
        :active="hud.crouched"
        :pressed="hud.crouched"
        :is-disabled="hud.mode !== 'ground'"
        :aria-label="hud.crouched ? t('hud.stand') : t('hud.crouch')"
        data-testid="btn-crouch"
        @click="input.crouchQueued = true"
      )
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FHudButton from '@/components/atoms/FHudButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import FHudBadge from '@/components/atoms/FHudBadge.vue'
import Joystick from '@/components/hud/Joystick.vue'
import AimHold from '@/components/hud/AimHold.vue'
import AlertMeter from '@/components/hud/AlertMeter.vue'
import ThreatArcs from '@/components/hud/ThreatArcs.vue'
import ObjectiveMarker from '@/components/hud/ObjectiveMarker.vue'
import ControlHints from '@/components/hud/ControlHints.vue'
import { emit as busEmit } from '@/game/bus'
import Reticle from '@/components/hud/Reticle.vue'
import AmmoStrip from '@/components/hud/AmmoStrip.vue'
import ArmorBar from '@/components/hud/ArmorBar.vue'
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

const TONES: Record<WeaponId, 'cyan' | 'warn' | 'danger'> = { sniper: 'cyan', minigun: 'warn', rocket: 'danger' }

/** A control lesson is on for this chip: it pulses until it has been used. */
const teaching = (id: HintId): boolean => hud.device === 'touch' && hud.hints.some(h => h.id === id)

// ── The weapon wheel ──
const wheelOpen = ref(false)
let closeTimer = 0
const pick = (n: number): void => {
  input.weaponQueued = (n + 1) as 1 | 2 | 3
  wheelOpen.value = false
}
// An open wheel nobody picks from folds away again.
watch(wheelOpen, (open) => {
  window.clearTimeout(closeTimer)
  if (open) closeTimer = window.setTimeout(() => { wheelOpen.value = false }, 3500)
})
onUnmounted(() => window.clearTimeout(closeTimer))
</script>

<style scoped lang="sass">
.mission-hud
  --gap: clamp(0.4rem, 1.8vmin, 0.8rem)
  position: absolute
  inset: 0
  pointer-events: none

.haul
  display: flex
  align-items: center
  justify-content: center
  gap: 0.3em
  margin-top: 0.35em
  padding: 0.2em 0.7em
  border-radius: 999px
  background: var(--cm-gloss), var(--cm-surface-soft)
  border: var(--cm-rim-w) solid rgba(255, 177, 74, 0.85)
  box-shadow: var(--cm-sticker)
  color: #ffd27a
  font-size: var(--cm-fs-s)
  text-shadow: var(--cm-text-outline)
  pointer-events: none
  :deep(svg)
    width: 1.15em
    height: 1.15em
  &.done
    border-color: var(--cm-ok)
    color: var(--cm-ok)

.alarm
  position: relative
  display: flex
  align-items: center
  gap: 0.3em
  width: clamp(5rem, 22vmin, 8rem)
  margin-top: 0.35em
  padding: 0.25em 0.6em
  border: var(--cm-rim-w) solid var(--cm-danger)
  border-radius: 999px
  background: var(--cm-gloss), var(--cm-surface-soft)
  box-shadow: var(--cm-sticker)
  color: var(--cm-danger)
  overflow: hidden
  pointer-events: none
  :deep(svg)
    position: relative
    z-index: 1
    width: 1.3em
    height: 1.3em
  &.s1 :deep(svg)
    animation: siren-blink 0.5s steps(2) infinite
  &.s3
    background: var(--cm-danger)
    color: #fff
.alarm-fill
  position: absolute
  left: 0
  top: 0
  bottom: 0
  background: rgba(255, 85, 118, 0.45)
  transition: width 120ms linear
@keyframes siren-blink
  50%
    opacity: 0.25
@media (prefers-reduced-motion: reduce)
  .alarm.s1 :deep(svg)
    animation: none

.boss-bar
  display: flex
  align-items: center
  gap: 0.35em
  margin-top: 0.35em
  padding: 0.25em 0.6em
  border: var(--cm-rim-w) solid var(--cm-danger)
  border-radius: 999px
  background: var(--cm-gloss), var(--cm-surface-soft)
  box-shadow: var(--cm-sticker), 0 0 0.8rem rgba(255, 85, 118, 0.45)
  color: var(--cm-danger)
  pointer-events: none
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
  border-radius: 0.15rem
  background: rgba(246, 241, 255, 0.15)
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

.bottom-centre
  position: absolute
  bottom: var(--cm-safe-bottom)
  left: 50%
  translate: -50% 0
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(0.25rem, 1vmin, 0.45rem)
  // Upright, the stick's ring reaches the middle of a narrow phone: the
  // gauges stand just right of centre, between the ring and the chips.
  @media (orientation: portrait)
    left: 58%

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
  gap: var(--gap)

// Left of the action column, level with its middle: where the thumb comes
// from, and never under the column itself.
.strike
  position: absolute
  right: calc(var(--cm-safe-right) + var(--cm-chip) + var(--gap) * 2)
  bottom: calc(var(--cm-safe-bottom) + var(--cm-chip) * 1.2)
  --cm-chip: clamp(3.2rem, 14vmin, 4.6rem)
</style>
