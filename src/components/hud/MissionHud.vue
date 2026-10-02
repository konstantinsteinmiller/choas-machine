<template lang="pug">
  div.mission-hud(:class="{ scoped: hud.scoped }")
    Joystick
    AimHold
    ThreatArcs
    //- The aim point: where a shot goes. A dot while walking, hidden through
    //- the scope (the scope overlay draws its own reticle).
    div.reticle(v-show="!hud.scoped" :class="{ aiming: hud.aiming }" aria-hidden="true")

    div.top-centre
      AlertMeter

    div.top-right
      FHudButton(icon="pause" :aria-label="t('ui.pause')" data-testid="btn-pause" @click="emit('pause')")

    //- The right thumb's cluster, above where it rests.
    div.actions
      FHudButton(
        v-if="hud.aiming && hud.device === 'touch'"
        icon="close"
        tone="danger"
        :aria-label="t('hud.cancel')"
        data-testid="btn-cancel"
        @click="cancelAim(input)"
      )
      FHudButton(
        :icon="hud.crouched ? 'stand' : 'crouch'"
        tone="violet"
        :active="hud.crouched"
        :pressed="hud.crouched"
        :is-disabled="hud.mode !== 'ground'"
        :aria-label="hud.crouched ? t('hud.stand') : t('hud.crouch')"
        data-testid="btn-crouch"
        @click="input.crouchQueued = true"
      )
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FHudButton from '@/components/atoms/FHudButton.vue'
import Joystick from '@/components/hud/Joystick.vue'
import AimHold from '@/components/hud/AimHold.vue'
import AlertMeter from '@/components/hud/AlertMeter.vue'
import ThreatArcs from '@/components/hud/ThreatArcs.vue'
import { hud } from '@/game/state/hud'
import { input } from '@/game/engine/inputState'
import { cancelAim } from '@/game/engine/input'

/**
 * The mission's HUD. The layer lets every press through to the scene under
 * it; each control takes its own pointers back. Controls sit in the corners,
 * inside the safe area, clear of the two thumbs' zones: the stick's ring low
 * on the left, the look-and-aim half on the right.
 */
const emit = defineEmits<{ (e: 'pause'): void }>()
const { t } = useI18n()
</script>

<style scoped lang="sass">
.mission-hud
  position: absolute
  inset: 0
  pointer-events: none

.reticle
  position: absolute
  left: 50%
  top: 50%
  width: clamp(0.35rem, 1.2vmin, 0.55rem)
  height: clamp(0.35rem, 1.2vmin, 0.55rem)
  translate: -50% -50%
  border-radius: 50%
  background: var(--cm-text)
  box-shadow: 0 0 0 var(--cm-edge) rgba(21, 12, 43, 0.7)
  opacity: 0.55
  transition: opacity 120ms ease-out, background-color 120ms ease-out
  &.aiming
    opacity: 1
    background: var(--cm-pink)

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
  gap: clamp(0.3rem, 1.4vmin, 0.6rem)

.actions
  position: absolute
  right: var(--cm-safe-right)
  bottom: var(--cm-safe-bottom)
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
</style>
