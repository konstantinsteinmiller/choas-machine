<template lang="pug">
  //- The Mobile Command Base: the wallet, the three stations and the way
  //- back into the fortress, laid round the mech on its pad.
  div.base-hud
    img.logo(src="/icons/icon.svg" :alt="t('gameName')" draggable="false")
    div.purse
      Wallet
      //- The player's place on the board, and the way to the table itself
      //- (a build that bakes a modelled board has a rank but no table).
      div.board
        RankBadge(:score="campaign")
        FHudButton(
          v-if="leaderboardEnabled && boardSize > 0"
          icon="leaderboard"
          tone="warn"
          :aria-label="t('leaderboard.title')"
          data-testid="btn-leaderboard"
          @click="showBoard = true"
        )

    div.panel
      nav.stations(:aria-label="t('gameName')")
        FButton(type="secondary" size="sm" icon="sniper" icon-position="left" :aria-label="t('base.armory')" data-testid="btn-armory" @click="openShop('armory')") {{ t('base.armory') }}
        FButton(type="secondary" size="sm" icon="mech" icon-position="left" :aria-label="t('base.chassis')" data-testid="btn-chassis" @click="openShop('chassis')") {{ t('base.chassis') }}
        FButton(
          :type="forgeReady ? 'success' : 'secondary'"
          size="sm"
          icon="forge"
          icon-position="left"
          :attention="forgeReady"
          :aria-label="t('base.forge')"
          data-testid="btn-forge"
          @click="openShop('forge')"
        ) {{ t('base.forge') }}
      DeployPanel

    SystemCorner
    LeaderboardModal(v-if="leaderboardEnabled" v-model="showBoard" :score="campaign")
    WorkshopModal(:open="shop !== null" :start="shop ?? 'armory'" @close="closeShop" @show="showWeapon" @disguise="showDisguise")
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FButton from '@/components/atoms/FButton.vue'
import Wallet from '@/components/base/Wallet.vue'
import DeployPanel from '@/components/base/DeployPanel.vue'
import WorkshopModal, { type WorkshopTab } from '@/components/base/WorkshopModal.vue'
import SystemCorner from '@/components/hud/SystemCorner.vue'
import FHudButton from '@/components/atoms/FHudButton.vue'
import RankBadge from '@/components/atoms/RankBadge.vue'
import LeaderboardModal from '@/components/organisms/LeaderboardModal.vue'
import { boardSize, ensureBoard, leaderboardEnabled } from '@/use/useLeaderboard'
import { app } from '@/game/engine/app'
import { profile } from '@/game/state/profile'
import { campaignScore, canForge } from '@/game/state/progress'
import { WEAPON_IDS } from '@/game/data/ids'
import type { WeaponId } from '@/game/data/ids'
import type { DisguiseId } from '@/game/models/disguiseIds'

const { t } = useI18n()
const shop = ref<WorkshopTab | null>(null)
const showBoard = ref(false)
const campaign = computed(() => campaignScore())

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
  showDisguise(null)
  const s = stage()
  if (s) s.present = 0
}
/** A disguise under the pointer in the Chassis Bay stands over the mech (#97). */
const showDisguise = (id: DisguiseId | null): void => {
  const m = app.mode as unknown as { disguise?: DisguiseId | null } | null
  if (m && 'disguise' in m) m.disguise = id
}
/** The mech holds up whatever was just bought or built. */
const showWeapon = (w: WeaponId): void => {
  const s = stage()
  if (s) s.weapon = w
}

onMounted(() => {
  // One read of the board per session; it never blocks the screen.
  void ensureBoard()
})
// A weapon tier can be built: the Forge button says so.
const forgeReady = computed(() => WEAPON_IDS.some(w => canForge(w)))
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
  display: flex
  flex-direction: column
  align-items: flex-end
  gap: var(--gap)
  // Never under the logo on a narrow phone.
  max-width: calc(100% - var(--cm-safe-left) - var(--cm-safe-right) - clamp(2.4rem, 10vmin, 4rem) - var(--gap))

.board
  display: flex
  align-items: center
  gap: var(--gap)

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
  // The scroll box clipped the buttons' depth plates and glows at its edges
  // (it read as cut off): room for them inside it.
  padding: 0.35rem 0.35rem 0.45rem
  box-sizing: border-box
  // A short screen (a phone on its side): the panel starts below the purse
  // (wallet and rank), never under it.
  @media (max-height: 480px) and (orientation: landscape)
    max-height: calc(100% - var(--cm-safe-bottom) - var(--cm-safe-top) - clamp(4rem, 18vmin, 5rem))
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
  // A short screen (a phone on its side): the three stations as glyphs in one
  // row (each keeps its name for a screen reader), so the deploy panel fits.
  @media (max-height: 480px)
    flex-wrap: nowrap
    > *
      min-width: 0
    :deep(.f-button__text)
      display: none
</style>
