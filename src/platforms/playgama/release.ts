// ─── Where the Playgama release is written ──────────────────────────────────
//
// Pure constants — no `@/` imports, no `import.meta.env`, no types — read by
// `vite.config.ts` (the build's output directory and chunk naming) and by the
// Node release tooling in `tools/playgama-release/` (pack + gates), which
// imports this file directly under Node's type stripping. One source of truth,
// so the build, the packer and the gates can never look in different places.
//
// NEVER `dist/`. That folder belongs to the other portal builds — the Poki
// archive awaiting upload sits in it — and Vite empties its outDir on every
// build: a Playgama build pointed there would silently delete another portal's
// release. The Playgama build gets its own folder, and the archive is written
// NEXT TO the build output rather than inside it, so no size audit of the
// build folder ever counts the zip and no re-pack can swallow it.

/** Everything the Playgama release produces lives under this folder. */
export const PLAYGAMA_RELEASE_DIR = 'dist-playgama'

/** Vite's outDir for the Playgama mode: exactly the archive's contents. */
export const PLAYGAMA_OUT_DIR = 'dist-playgama/game'

/** The upload for developer.playgama.com — a real PKZIP of `PLAYGAMA_OUT_DIR`,
 *  `index.html` at its root. Also the YouTube Playables submission. */
export const PLAYGAMA_ZIP = 'dist-playgama/chaos-machine-playgama.zip'

/**
 * The chunk the vendored Bridge SDK (`@playgama/bridge`, npm) is pinned into.
 *
 * The npm build carries every portal adapter Bridge supports as dead code — the
 * package Playgama prescribes for self-contained / Playables builds — so it
 * names other portals by design. The purity gate exempts exactly this chunk,
 * which is only safe because `manualChunks` puts nothing but that package in
 * it: game code can never hide inside the exemption.
 */
export const PLAYGAMA_BRIDGE_CHUNK = 'playgama-bridge'
