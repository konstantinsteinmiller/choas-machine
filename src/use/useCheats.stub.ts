// ─── useCheats no-op stub (Poki release build) ───────────────────────────────
//
// Replaces `@/use/useCheats` via `resolve.alias` in `vite.config.ts` whenever
// `platformPolicy.devTools` is false — today, the Poki release. Poki's hard
// requirements ask for a clean build: "no debug code, no dev artifacts"
// (integrate-poki REQUIREMENTS §1 row 10). A guard inside the real module would
// only remove the CALLS; the cheat table, its labels and the typed "cmarc" debug
// toggle would still ride in the bundle. Aliasing removes the code itself, the
// same mechanism as `pokiPlugin.stub.ts`.
//
// Must mirror the real module's export surface (App.vue imports the default and
// `installDebugUnlock`; `@/game/cheats` imports `registerCheat`).

import { ref } from 'vue'

export const registerCheat = (_shortcut: string, _label: string, _fn: () => void): void => {}

export const installDebugUnlock = (): void => {}

export const installCheatUnlock = (): void => {}

const useCheats = () => ({ isCheat: ref(false) })

export default useCheats
