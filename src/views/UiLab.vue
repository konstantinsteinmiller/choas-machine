<script setup lang="ts">
import { ref } from 'vue'
import FButton from '@/components/atoms/FButton.vue'
import FHudButton from '@/components/atoms/FHudButton.vue'
import FHudBadge from '@/components/atoms/FHudBadge.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FTabs from '@/components/atoms/FTabs.vue'
import FModal from '@/components/molecules/FModal.vue'
import SettingsButton from '@/components/organisms/SettingsButton.vue'
import GameIcon from '@/components/icons/GameIcon.vue'
import { GAME_ICON_NAMES } from '@/components/icons/iconNames'

/**
 * DEV ONLY (`#/ui`): every piece of the UI kit on one page, for checking the
 * look and the layout floors at phone and desktop sizes. The copy here is
 * bench filler, not game text, so it is not translated; `?modal=1` opens the
 * modal with the long content at once.
 */
const tab = ref('one')
const choice = ref('b')
const level = ref(0.6)
const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
const modalOpen = ref(query.has('modal'))
const tabbed = ref(query.get('modal') === 'tabs')
const tabs = [
  { value: 'one', label: 'Armory', icon: 'sniper' as const },
  { value: 'two', label: 'Chassis Bay', icon: 'armor' as const },
  { value: 'three', label: 'Forge', icon: 'forge' as const },
  { value: 'four', label: 'Holomap', icon: 'map' as const }
]
const options = [
  { value: 'a', label: 'Sniper rifle' },
  { value: 'b', label: 'Mini-gun' },
  { value: 'c', label: 'Rocket launcher' },
  { value: 'd', label: 'Raketenwerfer mit sehr langem Namen' }
]
const types = ['primary', 'secondary', 'success', 'warning', 'danger', 'ghost'] as const
const sizes = ['sm', 'md', 'lg', 'xl'] as const
</script>

<template lang="pug">
  div.ui-lab
    section
      h2 FButton
      div.row
        FButton(v-for="ty in types" :key="ty" :type="ty") {{ ty }}
      div.row
        FButton(v-for="s in sizes" :key="s" :size="s" icon="play") {{ s }}
      div.row
        FButton(icon-only icon="replay" aria-label="Replay")
        FButton(icon-only icon="home" type="secondary" aria-label="Home")
        FButton(icon-only icon="skip-forward" type="success" :emphasis="1.25" aria-label="Next")
        FButton(is-disabled) Disabled
        FButton(attention type="warning") Attention
      div.row.narrow
        FButton(block) Ausrüstung in der Schmiede verbessern
    section
      h2 FHudButton, FHudBadge, FMuteButton, SettingsButton
      div.row
        FHudButton(icon="pause" aria-label="Pause")
        FHudButton(icon="crouch" tone="violet" aria-label="Crouch")
        FHudButton(icon="crouch" tone="violet" active aria-label="Crouch")
        FHudButton(icon="decoy" tone="pink" attention aria-label="Decoy")
          template(#badge)
            FHudBadge 2
        FHudButton(icon="forge" tone="warn" aria-label="Forge")
          template(#badge)
            FHudBadge(tone="warn") 4:59
        FHudButton(icon="lock" is-disabled aria-label="Locked")
        FMuteButton
        SettingsButton
    section
      h2 FTabs
      FTabs(v-model="tab" :options="tabs")
    section
      h2 FSelect, FSlider
      div.grid
        FSelect(label="Weapon" v-model="choice" :options="options")
        FSlider(label="Music" v-model="level" :min="0" :max="1" :step="0.01")
    section
      h2 FModal
      div.row
        FButton(type="secondary" @click="tabbed = false; modalOpen = true") Title modal
        FButton(type="secondary" @click="tabbed = true; modalOpen = true") Tab modal
    section
      h2 Glyphs
      div.glyphs
        span.glyph(v-for="n in GAME_ICON_NAMES" :key="n" :title="n")
          GameIcon(:name="n")

    FModal(
      v-model="modalOpen"
      :title="tabbed ? undefined : 'Upgrade: Armory'"
      :tabs="tabbed ? tabs : []"
      v-model:activeTab="tab"
    )
      p(v-for="i in 14" :key="i") Line {{ i }}: modified and upgraded to the next tier. The content scrolls under a fixed header and above a fixed footer.
      FSelect(label="Inside the modal" v-model="choice" :options="options")
      template(#footer)
        FButton(type="ghost" @click="modalOpen = false") Back
        FButton(@click="modalOpen = false") Upgrade
</template>

<style scoped lang="sass">
.ui-lab
  position: fixed
  inset: 0
  overflow-y: auto
  touch-action: pan-y
  display: flex
  flex-direction: column
  gap: 1.2rem
  padding: var(--cm-safe-top) var(--cm-safe-right) var(--cm-safe-bottom) var(--cm-safe-left)
  background: linear-gradient(var(--cm-night), var(--cm-ink))
  color: var(--cm-text)

h2
  margin: 0 0 0.5rem
  color: var(--cm-cyan)
  font-size: var(--cm-fs-s)
  font-weight: 400
  text-transform: uppercase
  letter-spacing: 0.08em

p
  margin: 0 0 0.6em

.row
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 0.7rem
  margin-bottom: 0.7rem

.narrow
  max-width: 11rem

.grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr))
  gap: 1rem

.glyphs
  display: flex
  flex-wrap: wrap
  gap: 0.4rem

.glyph
  width: 2rem
  height: 2rem
  padding: 0.3rem
  border-radius: var(--cm-radius-s)
  background: var(--cm-panel)
  color: var(--cm-cyan-hi)
</style>
