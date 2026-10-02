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
