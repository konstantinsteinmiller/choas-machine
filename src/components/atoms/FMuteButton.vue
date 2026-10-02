<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FHudButton from '@/components/atoms/FHudButton.vue'
import { gameMuted, toggleGameMute } from '@/use/useGameMute'
import { isAdShowing } from '@/use/useGamePause'

/**
 * The speaker chip: the one mute the player sees, on every screen. It is the
 * same switch as the F2 key (`useGameMute`): a phone gets the hard silence,
 * a desktop the volume mute that CrazyGames' toolbar mirrors.
 *
 * Always rendered, in every build and on every device, so it can never
 * collapse to an empty box: it is an `FHudButton` with its floors.
 */
const { t } = useI18n()

/** Not under an ad: the ad's audio gate owns the sound then, and a toggle
 *  underneath it would come back as a surprise when the ad ends. */
const onClick = (): void => {
  if (!isAdShowing.value) toggleGameMute()
}
</script>

<template lang="pug">
  FHudButton(
    :icon="gameMuted ? 'sound-off' : 'sound'"
    :tone="gameMuted ? 'pink' : 'cyan'"
    :pressed="gameMuted"
    :aria-label="gameMuted ? t('ui.unmute') : t('ui.mute')"
    data-testid="btn-mute"
    @click="onClick"
  )
</template>
