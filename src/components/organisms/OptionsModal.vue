<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FSelect from '@/components/atoms/FSelect.vue'
import { LANGUAGES, LANGUAGE_AUTONYMS } from '@/utils/enums'
import { bcp47For } from '@/i18n/localeTag'
import { hapticsAvailable, hapticsEnabled, setHapticsEnabled } from '@/use/useHaptics'
import { killCamsEnabled, setKillCamsEnabled } from '@/use/useKillCam'
import { lookSensitivity, setLookSensitivity, scopeSensitivity, setScopeSensitivity, LOOK_SENS_MIN, LOOK_SENS_MAX } from '@/use/useLookSensitivity'
import { touchFirst } from '@/game/engine/input'
import { ACTIONS, bindKey, bindingsChanged, isBindable, primaryCode, resetBindings, type Action } from '@/game/engine/keyBindings'
import { keyboard, keyLabel, LAYOUTS, setAutoLayout, setManualLayout, type Layout } from '@/game/engine/keyLabels'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

// Global scope so the Options UI strings resolve from the shared locale
// bundles (src/i18n/locales/*) — same source as the rest of the game.
const { t, locale }: any = useI18n({ useScope: 'global' })
const appI18n: any = (window as any).__i18n

const {
  setSettingValue,
  userLanguage,
  userSoundVolume,
  userMusicVolume
} = useUser()

const currentTab = ref('general')

// The dropdown shows the language ON SCREEN, not the stored setting: a
// first-time player on a German portal sees German text, and "English"
// selected there would be a lie. A pick is always the player's choice and
// always applied, even when it equals the stored one.
const chooseLanguage = (code: string): void => {
  setSettingValue('language', code)
  if (appI18n) void setI18nLocale(appI18n, code)
  else locale.value = code
}

watch(userLanguage, async (newValue: string) => {
  if (appI18n) {
    await setI18nLocale(appI18n, newValue)
  } else {
    locale.value = newValue
  }
})

const tabs = computed(() => {
  const list: { value: string; label: string }[] = [
    { value: 'general', label: t('options.general') },
    // Gameplay: how the game plays (kill-cams, vibration), apart from
    // language and sound.
    { value: 'gameplay', label: t('options.gameplay') }
  ]
  // Keyboard layout and rebinding: a keyboard player's tab, never a phone's.
  return touchFirst() ? list : list.concat({ value: 'controls', label: t('pause.controls') })
})

// Native-name dropdown — every option legible regardless of the active locale.
const languagesList = computed(() =>
  LANGUAGES.map(loc => ({
    value: loc,
    label: LANGUAGE_AUTONYMS[loc] ?? loc,
    lang: bcp47For(loc)
  }))
)

// ─── On / off rows ──────────────────────────────────────────────────────────
//
// `hapticsAvailable` is resolved once at module load and is false on every
// desktop and on every iPhone — `navigator.vibrate` is absent on iOS Safari
// entirely, and desktop Chrome ships it as a silent no-op. The row is therefore
// hidden rather than disabled: a settings control that provably cannot do
// anything on this device teaches the player that the settings lie.
const onOffList = computed(() => [
  { value: 'on', label: t('options.on') },
  { value: 'off', label: t('options.off') }
])

// ─── Controls: keyboard layout + key rebinding ──────────────────────────────
//
// Keys are PHYSICAL (`engine/keyBindings.ts`); the layout only decides what
// they are called (`engine/keyLabels.ts`). Auto-detect on: the detected
// layout names them; off: the one picked here does.
const layoutList = LAYOUTS.map(l => ({ value: l, label: l.toUpperCase() }))
const detectedName = computed(() => (keyboard.detected ?? 'qwerty').toUpperCase())
const pickLayout = (v: string): void => { if ((LAYOUTS as string[]).includes(v)) setManualLayout(v as Layout) }

/** The action waiting for its new key, if any. */
const capturing = ref<Action | null>(null)
const onCapture = (e: KeyboardEvent): void => {
  const a = capturing.value
  if (!a) return
  // Ours alone: the game's own key handler must not also act on this press.
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.code === 'Escape') { stopCapture(); return }
  if (!isBindable(e.code)) return
  bindKey(a, e.code)
  stopCapture()
}
const stopCapture = (): void => {
  capturing.value = null
  window.removeEventListener('keydown', onCapture, true)
}
const startCapture = (a: Action): void => {
  if (capturing.value === a) { stopCapture(); return }
  capturing.value = a
  window.addEventListener('keydown', onCapture, true)
}
watch(currentTab, stopCapture)
onUnmounted(stopCapture)
</script>

<template lang="pug">
  FModal(
    :model-value="isOpen"
    :is-closable="true"
    :title="t('options.title')"
    :tabs="tabs"
    v-model:activeTab="currentTab"
    @update:model-value="emit('close')"
  )
    //- One auto-fitting grid for every tab: a single column on a portrait
    //- phone, two on a landscape phone or anything wider, with no breakpoint
    //- to keep in step with the modal's own width.
    div.options-grid(v-if="currentTab === 'general'")
      FSelect(
        :label="t('options.language')"
        :options="languagesList"
        :model-value="locale"
        @update:model-value="chooseLanguage($event)"
      )
      FSlider(
        :label="t('options.soundEffects')"
        :model-value="userSoundVolume"
        :min="0" :max="1" :step="0.01"
        @update:model-value="setSettingValue('sound', $event)"
      )
      FSlider(
        :label="t('options.music')"
        :model-value="userMusicVolume"
        :min="0" :max="1" :step="0.01"
        @update:model-value="setSettingValue('music', $event)"
      )

    div.options-grid(v-else-if="currentTab === 'gameplay'")
      //- How far a drag or a mouse move turns the camera.
      FSlider(
        :label="t('options.sensitivity')"
        :model-value="lookSensitivity"
        :min="LOOK_SENS_MIN" :max="LOOK_SENS_MAX" :step="0.05"
        @update:model-value="setLookSensitivity($event)"
      )
      //- Through the scope: how far the same move turns the steadied view.
      FSlider(
        :label="t('options.scopeSensitivity')"
        :model-value="scopeSensitivity"
        :min="LOOK_SENS_MIN" :max="LOOK_SENS_MAX" :step="0.05"
        @update:model-value="setScopeSensitivity($event)"
      )
      //- The kill-cam: on by default; a player who switched it off from inside
      //- one turns it back on here.
      FSelect(
        :label="t('options.killCams')"
        :options="onOffList"
        :model-value="killCamsEnabled ? 'on' : 'off'"
        @update:model-value="setKillCamsEnabled($event === 'on')"
      )
      //- Vibration: phones only (hidden where there is no motor).
      FSelect(
        v-if="hapticsAvailable"
        :label="t('options.haptics')"
        :options="onOffList"
        :model-value="hapticsEnabled ? 'on' : 'off'"
        @update:model-value="setHapticsEnabled($event === 'on')"
      )

    div.options-controls(v-else-if="currentTab === 'controls'")
      div.options-grid
        div.options-field
          FSelect(
            :label="t('options.keyboard.auto')"
            :options="onOffList"
            :model-value="keyboard.auto ? 'on' : 'off'"
            @update:model-value="setAutoLayout($event === 'on')"
          )
          p.options-hint(v-if="keyboard.auto") {{ t('options.keyboard.detected', { layout: detectedName }) }}
        FSelect(
          v-if="!keyboard.auto"
          :label="t('options.keyboard.layout')"
          :options="layoutList"
          :model-value="keyboard.manual"
          @update:model-value="pickLayout"
        )
      div.options-bind-head
        span.options-bind-title {{ t('options.keyboard.bindings') }}
        FButton(size="sm" type="ghost" :is-disabled="!bindingsChanged()" @click="resetBindings()") {{ t('options.keyboard.reset') }}
      p.options-hint(v-if="capturing") {{ t('options.keyboard.press') }}
      ul.bindings
        li.bind-row(v-for="a in ACTIONS" :key="a")
          span.bind-name {{ t(`options.actions.${a}`) }}
          button.bind-key(type="button" :class="{ waiting: capturing === a }" @click="startCapture(a)") {{ capturing === a ? '…' : keyLabel(primaryCode(a)) }}

    template(#footer)
      FButton(type="secondary" @click="emit('close')") {{ t('options.close') }}
</template>

<style lang="sass" scoped>
@use '@/assets/css/tech' as *
.options-grid
  display: grid
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr))
  gap: clamp(0.6rem, 2.6vmin, 1.2rem) clamp(0.8rem, 3vmin, 1.6rem)
  align-items: start

.options-controls
  display: flex
  flex-direction: column
  gap: clamp(0.5rem, 2vmin, 1rem)

.options-field
  display: flex
  flex-direction: column
  gap: 0.3em
  min-width: 0

.options-hint
  margin: 0
  color: var(--cm-dim)
  font-size: var(--cm-fs-xs)
  line-height: 1.3

.options-bind-head
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: space-between
  gap: 0.5rem
  padding-top: clamp(0.4rem, 1.6vmin, 0.8rem)
  border-top: var(--cm-edge) solid rgba(77, 232, 255, 0.25)

.options-bind-title
  color: var(--cm-dim)
  font-size: var(--cm-fs-s)
  text-transform: uppercase
  letter-spacing: 0.05em

.bindings
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr))
  gap: 0.3rem 0.8rem
  margin: 0
  padding: 0
  list-style: none

.bind-row
  display: flex
  align-items: center
  justify-content: space-between
  gap: 0.5rem
  min-height: 2.5rem
  padding: 0.2rem 0.5rem

.bind-name
  min-width: 0
  color: var(--cm-text)
  font-size: var(--cm-fs-s)
  line-height: 1.2
  overflow-wrap: anywhere

.bind-key
  flex: 0 0 auto
  min-width: 2.6em
  min-height: 2em
  padding: 0 0.5em
  color: var(--cm-cyan-hi)
  font-family: var(--font-ui)
  font-size: var(--cm-fs-s)
  cursor: pointer
  +tech-plate(var(--cm-cyan), linear-gradient(180deg, #4a3590, #2a1a5e), 0.32rem, var(--cm-edge), false)

  &:focus-visible
    outline: var(--cm-edge) solid var(--cm-text)
    outline-offset: 0.15em

  &.waiting
    border-color: var(--cm-pink)
    color: var(--cm-pink-hi)
    animation: key-wait 0.9s ease-in-out infinite

@keyframes key-wait
  50%
    opacity: 0.45

@media (prefers-reduced-motion: reduce)
  .bind-key.waiting
    animation: none
</style>
