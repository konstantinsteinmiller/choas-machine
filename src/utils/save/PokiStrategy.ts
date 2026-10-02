import type { HydrateState, LocalStorageAccessor, SaveStrategy } from './types'

// ─── Poki save strategy ─────────────────────────────────────────────────────
//
// Poki has NO cloud-save API — and doesn't need one. For a logged-in player the
// Poki wrapper mirrors the game iframe's ENTIRE localStorage + IndexedDB across
// devices by itself, with no game code involved. So this strategy is local-only:
// the browser has already hydrated localStorage before we boot, and every write
// SaveManager makes is picked up by the wrapper automatically.
//
// Implemented as its own class rather than just selecting `LocalStorageStrategy`
// at the bootstrap site so:
//   - `SaveManager.strategyName` reports `poki` in logs / telemetry, making it
//     possible to slice metrics by platform (and to confirm the right strategy
//     is live from the browser console during Poki QA);
//   - if Poki ever ships an explicit API, this class is the single seam.
//
// `hydrateState` is hardcoded `success-with-data`: there is no remote that could
// be in a failed state, so SaveManager's flush guard never engages and no
// background retries are scheduled. Mirrors `GameMonetizeStrategy` /
// `GameDistributionStrategy`.
//
// THREE PLATFORM RULES THIS FILE DOES NOT ENFORCE — they live in SaveManager /
// the storage accessor, and each fails silently on real players:
//
//   1. **< 1 MB after gzip.** Poki switches cloud gamesave OFF for a player
//      whose payload exceeds it, with no warning and nothing the game can
//      detect. The `cmachine_state` blob is well inside that today
//      (single-digit KB), but anything that starts caching per-wave history or
//      replay data would need a `poki_ignore`-prefixed key so the wrapper skips
//      it.
//
//   2. **Never use the `poki_` key prefix.** Reserved and in active use by the
//      SDK: poki_events_user_id, poki_pbf, poki_uid*, poki_session, poki_source,
//      poki_pubcid, poki_no_ads, poki_url. This project's keys are `cmachine_state`
//      / `ts_*` / `__save_*`, so there is no collision — keep it that way.
//
//   3. **Incognito restricts localStorage — every access needs try/catch.** An
//      explicit Poki hard requirement and a real crash: incognito sessions can
//      have a zero quota. SaveManager's accessor already guards its reads and
//      writes; that is what satisfies this, not anything here.
//
// Unlike CrazyGames, Poki builds run in NORMAL (persistToRaw) mode: the raw
// localStorage entries ARE the cloud save, so scrubbing them (as the CG arm in
// `main.ts` does) would delete the player's progress.

export class PokiStrategy implements SaveStrategy {
  readonly name = 'poki'
  // Local-only — there is no remote that could be in any non-success state.
  readonly hydrateState: HydrateState = 'success-with-data'

  async hydrate(_local: LocalStorageAccessor): Promise<void> {
    // noop — the browser (and, for logged-in players, Poki's wrapper) already
    // populated localStorage before this bundle evaluated.
  }

  onLocalSet(_key: string, _value: string): void {
    // noop — no remote backend. Poki's wrapper observes localStorage itself.
  }

  onLocalRemove(_key: string): void {
    // noop — no remote backend.
  }
}
