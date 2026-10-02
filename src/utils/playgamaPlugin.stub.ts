// ─── playgamaPlugin no-op stub (non-Playgama builds only) ───────────────────
//
// Replaces `@/utils/playgamaPlugin` on every build that is not Playgama, via
// `resolve.alias` in `vite.config.ts`. Every call site already sits behind the
// `VITE_APP_PLAYGAMA` literal, so the real plugin never RUNS elsewhere — but
// each `await import('@/utils/playgamaPlugin')` is a chunk, and a chunk ships
// whether or not anything calls it. Without this alias every CrazyGames, Poki
// and web archive carried a `playgamaPlugin-*.js` next to its own portal's
// code: exactly the other-portal evidence a reviewer finds in the network
// panel or the file list.
//
// Matches the real module's FULL export surface (every name imported anywhere),
// so no import resolves to `undefined`.

import { ref } from 'vue'
import type { Ref } from 'vue'
import type { SaveStrategy } from '@/utils/save/types'

export const isPlaygamaSdkActive: Ref<boolean> = ref(false)
export const isPlaygamaAdsBlocked: Ref<boolean> = ref(false)
export const playgamaLocale: Ref<string | null> = ref(null)
export const playgamaDetectedId: Ref<string | null> = ref(null)
export const isPlaygamaInterstitialSupported: Ref<boolean> = ref(false)
export const isPlaygamaRewardedSupported: Ref<boolean> = ref(false)

export const getPlaygamaBridge = (): null => null
export const normalizePlaygamaLanguage = (_raw: unknown): string | null => null
export const __stopPlaygamaLanguageWatch = (): void => {}
export const playgamaPlugin = async (): Promise<void> => {}
export const playgamaLoadingStart = (): void => {}
export const playgamaGameLoadingStop = (): void => {}
export const playgamaGameplayStart = (): void => {}
export const playgamaGameplayStop = (): void => {}
export const showInterstitialPG = async (_onImpression?: () => void): Promise<void> => {}
export const showRewardedPG = async (_onImpression?: () => void): Promise<boolean> => false
export const createPlaygamaSaveStrategy = async (): Promise<SaveStrategy> => {
  throw new Error('[playgama] save strategy requested on a non-Playgama build')
}
