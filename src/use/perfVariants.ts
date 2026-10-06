// ─── Boot-frozen performance variant flags ──────────────────────────────────
//
// The A/B seam for performance experiments. See `PERF-LEDGER.md` for the
// procedure and for every experiment this project has run.
//
// ── Why the flag is frozen at boot ──
//
// Resolved ONCE, here, at module load. A flag that re-read `localStorage` or
// parsed the URL on each access would itself land in the hot loop it is meant
// to measure, and the two arms would then differ by more than the change under
// test. Read it as a `const` at module scope; never inside a per-frame call.
//
// ── Running an experiment ──
//
//   1. Add a flag below naming the BASELINE arm — `<thing>-legacy`, not
//      `<thing>-new`. The shipping path must be what you get with no flag set,
//      so a stray query string can never turn a player's game into an
//      experiment.
//   2. Branch at the COARSEST level that isolates the change (swap the emitter,
//      not each particle) so the check never lands in an inner loop.
//   3. Keep the baseline path exactly as it was. Tidying it up while you are in
//      there contaminates the comparison.
//   4. Measure: `pnpm perf:ab --a "perf=<thing>-legacy" --b ""`.
//   5. Record the verdict in `PERF-LEDGER.md`, then DELETE the losing branch
//      and its flag. Shipping both paths forever is how a dead branch rots and
//      a flag ends up in a hot loop.
//
// Select with `?perf=<name>` on the URL, or
// `localStorage.setItem('perf', '<name>')`. Comma-separate to combine.
// With nothing set, every experiment resolves to its SHIPPING value, so this
// file costs one string read at boot and nothing else in production.

const raw = (() => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('perf')
    if (fromUrl) return fromUrl
    return localStorage.getItem('perf') ?? ''
  } catch {
    // Private mode can throw on `localStorage`, and there is no `window` under
    // SSR or in a worker. An experiment seam must never be the thing that
    // breaks a boot.
    return ''
  }
})()

const flags: ReadonlySet<string> = new Set(raw.split(',').map(s => s.trim()).filter(Boolean))

/** Whether a named baseline arm is selected. Call at MODULE scope and keep the
 *  result in a `const` — never per frame. */
export const perfFlag = (name: string): boolean => flags.has(name)

/**
 * Every flag actually parsed this boot.
 *
 * The A/B runner reads this back to assert the arm it asked for is the arm that
 * ran. A typo'd flag is silently false, which without this check produces a
 * clean, confident, completely worthless A-versus-A result.
 */
export const activeVariants = (): string[] => [...flags]

// ─── Live experiments ───────────────────────────────────────────────────────
//
/**
 * Baseline: iOS opens like any other phone (full scenery when it reports no
 * small RAM). The shipping path opens iOS at low scenery. Inherited, and not
 * yet measured on a real iPhone (PERF-LEDGER.md, open items). Resolution is no
 * longer part of it: every device draws at its own pixel ratio (renderer.ts).
 */
export const IOS_LEGACY = perfFlag('ios-legacy')

/**
 * `?perf=marker-legacy`: the objective marker reads its host's size on every
 * frame again (a forced layout), as it did before PERF-LEDGER.md entry 1.
 */
export const MARKER_LEGACY = perfFlag('marker-legacy')

/**
 * `?perf=islands-shared`: the sky's instanced islands share the level's toon
 * material again, as before PERF-LEDGER.md entry 2.
 */
export const ISLANDS_SHARED = perfFlag('islands-shared')

/**
 * `?perf=sfx-unlimited`: every rapid-fire sound is voiced every time again,
 * as before PERF-LEDGER.md entry 3.
 */
export const SFX_UNLIMITED = perfFlag('sfx-unlimited')
