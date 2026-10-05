<template lang="pug">
  //- The dev cheat panel (ctrl+shift+alt+P, `game/cheats.ts`). Dev tooling:
  //- stubbed out of the clean release builds with the rest of the cheats, so
  //- its labels are plain English like the cheat shortcuts' (the scene names
  //- are the game's own).
  FModal.cheat-panel(v-model="model" title="Cheats" data-testid="cheat-panel")
    section.group
      h3.label Resources
      div.row
        FButton(type="warning" size="sm" icon="scrap" icon-position="left" data-testid="cheat-scrap" @click="addScrap") +5000 Tech Scrap
        FButton(type="secondary" size="sm" icon="core" icon-position="left" data-testid="cheat-cores" @click="addCores") +50 Data Cores
    section.group
      h3.label Progress
      div.row
        FButton(type="success" size="sm" icon="unlock" icon-position="left" data-testid="cheat-unlock" @click="unlockAll") Unlock every level
        FButton(
          :type="god.on ? 'danger' : 'secondary'"
          size="sm"
          icon="shield"
          icon-position="left"
          data-testid="cheat-god"
          :aria-pressed="god.on"
          @click="god.on = !god.on"
        ) God mode: {{ god.on ? 'ON' : 'OFF' }}
      p.note(v-if="done") {{ done }}
    section.group
      h3.label Cutscenes
      FButton(size="md" icon="replay" icon-position="left" block data-testid="cheat-intro" @click="replay('intro')") Replay intro
      div.row
        FButton(
          v-for="id in scenes"
          :key="id"
          type="ghost"
          size="sm"
          icon="play"
          icon-position="left"
          :data-testid="`cheat-scene-${id}`"
          @click="replay(id)"
        ) {{ t('cine.' + id) }}
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import { flow, playCinema } from '@/game/flow'
import { god } from '@/game/state/god'
import { fortressSave, profile, saveProfile } from '@/game/state/profile'
import { levelKey } from '@/game/state/progress'
import { FORTRESS_IDS } from '@/game/data/fortresses/registry'
import { THREAT_LEVELS } from '@/game/sim/rewards'
import { CINEMA_IDS, type CinemaId } from '@/game/story/cinemaIds'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const model = computed({ get: () => props.modelValue, set: (v: boolean) => emit('update:modelValue', v) })

const { t } = useI18n()
const done = ref('')
const scenes = CINEMA_IDS.filter(id => id !== 'intro')

const addScrap = (): void => { profile.scrap += 5000; saveProfile() }
const addCores = (): void => { profile.cores += 50; saveProfile() }

/** Every threat level of every fortress counts as cleared once: all open. */
const unlockAll = (): void => {
  for (const fort of FORTRESS_IDS) {
    for (let l = 1; l <= THREAT_LEVELS; l++) {
      const s = fortressSave(levelKey(l, fort))
      s.clears = Math.max(1, s.clears)
    }
  }
  saveProfile()
  done.value = 'Every level is open.'
}

/** Close the panel and play the scene over whatever is on screen. */
const replay = (id: CinemaId): void => {
  model.value = false
  if (flow.cinema) return
  void playCinema(id)
}
</script>

<style scoped lang="sass">
.group
  display: flex
  flex-direction: column
  gap: 0.4em
  & + .group
    margin-top: 0.9em
.label
  margin: 0
  color: var(--cm-dim)
  font-size: var(--cm-fs-s)
  text-transform: uppercase
  letter-spacing: 0.05em
.row
  display: flex
  flex-wrap: wrap
  gap: 0.4em
.note
  margin: 0
  color: var(--cm-ok)
  font-size: var(--cm-fs-s)
</style>
