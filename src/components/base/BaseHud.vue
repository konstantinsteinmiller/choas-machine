<template lang="pug">
  //- The Mobile Command Base: the wallet, the three stations and the way
  //- back into the fortress, laid round the mech on its pad.
  div.base-hud
    img.logo(src="/icons/icon.svg" :alt="t('gameName')" draggable="false")
    div.purse
      Wallet

    div.panel
      nav.stations(:aria-label="t('gameName')")
        FButton(type="secondary" size="sm" icon="sniper" icon-position="left" data-testid="btn-armory" @click="openShop('armory')") {{ t('base.armory') }}
        FButton(type="secondary" size="sm" icon="mech" icon-position="left" data-testid="btn-chassis" @click="openShop('chassis')") {{ t('base.chassis') }}
        FButton(
          :type="forgeReady ? 'success' : 'secondary'"
          size="sm"
          icon="forge"
          icon-position="left"
          :attention="forgeReady"
          data-testid="btn-forge"
          @click="openShop('forge')"
        ) {{ t('base.forge') }}
      DeployPanel

    SystemCorner
    WorkshopModal(:open="shop !== null" :start="shop ?? 'armory'" @close="closeShop" @show="showWeapon")
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import Wallet from '@/components/base/Wallet.vue'
import DeployPanel from '@/components/base/DeployPanel.vue'
import WorkshopModal, { type WorkshopTab } from '@/components/base/WorkshopModal.vue'
import SystemCorner from '@/components/hud/SystemCorner.vue'
import { app } from '@/game/engine/app'
import { profile } from '@/game/state/profile'
import { forgeRemaining, settleForge } from '@/game/state/progress'
import type { WeaponId } from '@/game/data/ids'

const { t } = useI18n()
const shop = ref<WorkshopTab | null>(null)

/** The scene behind this screen, when it is the Command Base. */
const stage = (): { weapon: WeaponId; present: number } | null => {
  const m = app.mode as unknown as { weapon?: WeaponId; present?: number } | null
  return m && typeof m.present === 'number' ? (m as { weapon: WeaponId; present: number }) : null
}
const openShop = (tab: WorkshopTab): void => {
  shop.value = tab
  const s = stage()
  if (s) s.present = 1
}
const closeShop = (): void => {
  shop.value = null
  const s = stage()
  if (s) s.present = 0
}
/** The mech holds up whatever was just bought or built. */
const showWeapon = (w: WeaponId): void => {
  const s = stage()
  if (s) s.weapon = w
}

// A finished build waits to be collected: the Forge button says so.
const now = ref(Date.now())
let timer = 0
onMounted(() => {
  settleForge()
  timer = window.setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => window.clearInterval(timer))
const forgeReady = computed(() => !!profile.forge && forgeRemaining(profile.forge, now.value) <= 0)
</script>

<style scoped lang="sass">
.base-hud
  --gap: clamp(0.4rem, 1.8vmin, 0.8rem)
  position: absolute
  inset: 0
  pointer-events: none
  // Every direct child takes its own pointers back.
  > *
    pointer-events: auto

.logo
  position: absolute
  top: var(--cm-safe-top)
  left: var(--cm-safe-left)
  width: clamp(2.4rem, 10vmin, 4rem)
  height: clamp(2.4rem, 10vmin, 4rem)
  pointer-events: none
  user-select: none
  -webkit-user-drag: none

.purse
  position: absolute
  top: var(--cm-safe-top)
  right: var(--cm-safe-right)
  // Never under the logo on a narrow phone.
  max-width: calc(100% - var(--cm-safe-left) - var(--cm-safe-right) - clamp(2.4rem, 10vmin, 4rem) - var(--gap))

// Landscape: a column down the right, the mech to its left.
.panel
  position: absolute
  right: var(--cm-safe-right)
  bottom: var(--cm-safe-bottom)
  width: min(46%, 25rem)
  max-height: calc(100% - var(--cm-safe-top) - var(--cm-safe-bottom) - clamp(1.7rem, 6.4vmin, 2.4rem) - var(--gap))
  display: flex
  flex-direction: column
  gap: var(--gap)
  overflow-y: auto
  scrollbar-width: none
  // Portrait: a sheet along the bottom, the mech above it. It starts right
  // of the system corner (mute over settings), which keeps the bottom-left.
  @media (orientation: portrait)
    left: calc(var(--cm-safe-left) + var(--cm-chip) + var(--gap))
    width: auto

.stations
  display: flex
  flex-wrap: wrap
  gap: var(--gap)
  // Three across where they fit; a long language wraps to a second row
  // rather than shrinking the captions.
  > *
    flex: 1 1 auto
</style>
