<template lang="pug">
  //- The three stations of the Command Base behind one door: the Armory, the
  //- Chassis Bay and the Forge are tabs of the same workshop. Whatever is
  //- bought is the mech's at once (#75); the rifle's wheel opens in the Armory.
  FModal(
    :model-value="open"
    :tabs="tabs"
    v-model:activeTab="tab"
    data-testid="workshop"
    @update:model-value="emit('close')"
  )
    div.workshop
      div.purse
        Wallet
      template(v-if="tab === 'armory'")
        UpgradeList(station="armory" @focus="shown")
        RifleWheel(@focus="emit('show', 'sniper')")
      template(v-else-if="tab === 'chassis'")
        UpgradeList(station="chassis" @focus="shown")
        DisguisePanel(@preview="emit('disguise', $event)")
        PaintPanel(@preview="emit('paint', $event)")
      ForgePanel(v-else @focus="emit('show', $event)")
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import type { TabOption } from '@/components/atoms/FTabs.vue'
import Wallet from '@/components/base/Wallet.vue'
import UpgradeList from '@/components/base/UpgradeList.vue'
import ForgePanel from '@/components/base/ForgePanel.vue'
import RifleWheel from '@/components/base/RifleWheel.vue'
import DisguisePanel from '@/components/base/DisguisePanel.vue'
import PaintPanel from '@/components/base/PaintPanel.vue'
import type { DisguiseId } from '@/game/models/disguiseIds'
import type { PaintId } from '@/game/models/paintIds'
import { TRACKS, type TrackId } from '@/game/data/upgrades'
import type { WeaponId } from '@/game/data/ids'

export type WorkshopTab = 'armory' | 'chassis' | 'forge'

const props = defineProps<{ open: boolean; start: WorkshopTab }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'show', weapon: WeaponId): void; (e: 'disguise', id: DisguiseId | null): void; (e: 'paint', id: PaintId | null): void }>()
const { t } = useI18n()

const tab = ref<WorkshopTab>(props.start)
// Each opening lands on the station whose button was pressed.
watch(() => props.open, (o) => { if (o) tab.value = props.start })

/** Bought: the mech holds up the weapon it is for. */
const shown = (id: TrackId): void => emit('show', TRACKS[id].weapon ?? 'sniper')

const tabs = computed<TabOption[]>(() => [
  { label: t('base.armory'), value: 'armory', icon: 'sniper' },
  { label: t('base.chassis'), value: 'chassis', icon: 'mech' },
  { label: t('base.forge'), value: 'forge', icon: 'forge' }
])
</script>

<style scoped lang="sass">
.workshop
  display: flex
  flex-direction: column
  gap: clamp(0.4rem, 1.8vmin, 0.8rem)
.purse
  display: flex
  justify-content: flex-end
</style>
