// ─── playgama-bridge-config.json ───────────────────────────────────────────
//
// Pure function over the loaded env, imported by `vite.config.ts` — so no `@/`
// imports and no `import.meta.env` in here. Emitted ONLY in Playgama mode, by the
// build and by the dev server (see the `emit-playgama-bridge-config` plugin for
// why never from `public/`).

export const buildPlaygamaBridgeConfig = (): Record<string, unknown> => ({
  advertisement: { minimumDelayBetweenInterstitial: 120 }
})
