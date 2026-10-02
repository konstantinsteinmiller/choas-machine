<script setup lang="ts">
// Two-purpose corner banner:
//   1. Offline mode — when the strategy is in failed-retrying / failed-final,
//      tell the player their progress is saved locally but cloud is paused,
//      and offer a "Retry" button.
//   2. Conflict-merge bonus — when a hydrate detected a higher cloud save
//      and we restored it, show the bonus scrap so the loss-of-local feels
//      like a gain instead of a punishment. Auto-dismisses after a few sec.
//
// Tap-to-dismiss for both states. Mounted from App.vue.
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GameIcon from '@/components/icons/GameIcon.vue'
import {
  acknowledgeBonus,
  bonusCoinsAwarded,
  hasBonusToShow,
  isOfflineMode,
  retryInFlight,
  retrySync
} from '@/use/useSaveStatus'
import { isCrazyWeb } from '@/use/useUser'

const { t } = useI18n()

const dismissed = ref(false)

const offlineDismissed = ref(false)
watch(isOfflineMode, (on) => {
  if (!on) offlineDismissed.value = false
})

// Auto-dismiss the bonus after 6 seconds so it doesn't linger forever.
let bonusTimer: ReturnType<typeof setTimeout> | null = null
watch(bonusCoinsAwarded, (n) => {
  if (n > 0) {
    if (bonusTimer) clearTimeout(bonusTimer)
    bonusTimer = setTimeout(() => acknowledgeBonus(), 6_000)
  }
})
onUnmounted(() => {
  if (bonusTimer) clearTimeout(bonusTimer)
})

// The offline banner says "Playing offline. Your progress is saved here." —
// only TRUE for builds with a local fallback (LocalStorage / Glitch / itch /
// GamePix, all `persistToRaw: true`). CrazyGames is CLOUD-ONLY
// (`persistToRaw: false`), so there is no local save and the message would be a
// lie; the strategy also goes `failed-retrying` whenever `sdk.data` is
// unreachable — which is ALWAYS the case off-portal (localhost / preview),
// flashing a scary banner during dev. The retry ladder still heals silently
// underneath, and CG doesn't mandate an offline notice, so suppress the banner
// on CG entirely. The "cloud save restored" bonus banner is unaffected.
const showOffline = computed(() => isOfflineMode.value && !offlineDismissed.value && !isCrazyWeb)
const showBonus = computed(() => hasBonusToShow.value && !dismissed.value)

const onRetry = async (e: Event) => {
  e.stopPropagation()
  await retrySync()
}

const onDismissOffline = () => {
  offlineDismissed.value = true
}
const onDismissBonus = () => {
  acknowledgeBonus()
  dismissed.value = true
}

// Reset per-show dismiss flag so a future bonus can show again.
watch(hasBonusToShow, (on) => {
  if (on) dismissed.value = false
})
</script>

<template lang="pug">
  div.save-banner
    //- Cloud save restored, with the recovery bonus.
    button.save-banner__card.is-ok(v-if="showBonus" type="button" @click="onDismissBonus")
      GameIcon.save-banner__icon(name="check")
      span.save-banner__text
        span.save-banner__title {{ t('saveStatus.restoredTitle') }}
        span.save-banner__body {{ t('saveStatus.restoredBody', { n: bonusCoinsAwarded }) }}
      span.save-banner__hint {{ t('saveStatus.tap') }}

    //- Cloud sync paused; progress is saved on the device.
    div.save-banner__card.is-warn(v-else-if="showOffline")
      GameIcon.save-banner__icon(name="warning")
      span.save-banner__text
        span.save-banner__title {{ t('saveStatus.pausedTitle') }}
        span.save-banner__body {{ t('saveStatus.pausedBody') }}
      button.save-banner__retry(type="button" :disabled="retryInFlight" @click="onRetry") {{ retryInFlight ? '…' : t('saveStatus.retry') }}
      button.save-banner__close(type="button" :aria-label="t('saveStatus.dismiss')" @click="onDismissOffline")
        GameIcon(name="close")
</template>

<style scoped lang="sass">
.save-banner
  position: fixed
  right: var(--cm-safe-right)
  bottom: var(--cm-safe-bottom)
  left: var(--cm-safe-left)
  z-index: 40
  display: flex
  justify-content: flex-end
  pointer-events: none

.save-banner__card
  --sb-tone: var(--cm-ok)
  display: flex
  align-items: center
  gap: 0.6em
  max-width: min(100%, 26rem)
  padding: 0.5em 0.7em
  border: var(--cm-edge) solid var(--sb-tone)
  border-radius: var(--cm-radius-m)
  background: var(--cm-glass)
  color: var(--cm-text)
  font-family: var(--font-ui)
  font-size: var(--cm-fs-s)
  text-align: start
  pointer-events: auto

  &.is-warn
    --sb-tone: var(--cm-warn)

button.save-banner__card
  cursor: pointer

.save-banner__card .save-banner__icon
  flex: 0 0 auto
  width: 1.5em
  height: 1.5em
  color: var(--sb-tone)

.save-banner__text
  display: flex
  flex-direction: column
  flex: 1 1 auto
  min-width: 0

.save-banner__title
  overflow-wrap: anywhere

.save-banner__body
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
  overflow-wrap: anywhere

.save-banner__hint
  flex: 0 0 auto
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)

.save-banner__retry
  flex: 0 0 auto
  min-height: 2.5rem
  padding: 0 0.8em
  border: var(--cm-edge) solid var(--cm-warn)
  border-radius: var(--cm-radius-s)
  background: var(--cm-warn)
  color: var(--cm-ink)
  font-family: var(--font-ui)
  font-size: var(--cm-fs-s)
  cursor: pointer

  &:disabled
    opacity: 0.5

.save-banner__close
  flex: 0 0 auto
  display: grid
  place-items: center
  width: 2.5rem
  height: 2.5rem
  padding: 0.7rem
  border: 0
  background: none
  color: var(--cm-dim)
  cursor: pointer
</style>
