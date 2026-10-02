/// <reference types="vite/client" />

/** Drop-in asset files present at build time (see `assetOverridesPlugin` in
 *  vite.config.ts): file names inside public/audio/sfx, public/audio/music
 *  and public/images/textures. */
declare module 'virtual:asset-overrides' {
  const overrides: { sfx: string[]; music: string[]; textures: string[] }
  export default overrides
}

/** THIS build's platform policy, inlined as a literal by `vite.config.ts`'s
 *  `define` — the result of the same `resolvePlatformPolicy` call that aliases
 *  dev tooling out of the build (`vitest.config.ts` mirrors it for tests). Read
 *  it through `platformPolicy` in `src/platforms/capabilities.ts`. */
declare const __PLATFORM_POLICY__: import('./src/platforms/policy').PlatformPolicy
