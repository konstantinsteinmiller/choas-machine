// Per-project settings for `pnpm deploy:poki` — Chaos Machine.
//
// `team` and `gameId` come straight out of the P4D URL of the game's Versions
// page:
//   https://app.poki.dev/<team>/games/<gameId>/versions

export default {
  // The developer team the game lives under in P4D. Empty until the game is
  // created there.
  team: '',
  // NOT KNOWN YET, and deliberately not guessed. Until Chaos Machine exists in
  // P4D and its uuid is pasted here (or passed as `--game-id <uuid>`), every mode
  // that talks to P4D refuses to start — see lib/target.mjs. This repo was
  // forked from Mega Droid; an upload with that game's id would land in its
  // Versions list, so its id is refused outright even if it is pasted back in.
  // `--gates-only` (offline) needs no id.
  gameId: '',
  gameName: 'Chaos Machine',

  build: 'pnpm build:poki',
  dist: 'dist',
  // What `build:poki` writes (its tail is `node tools/poki-deploy/pack.mjs`).
  zip: 'dist/chaos-machine-poki.zip',

  /** Pack `dist` into `zip` with the pipeline's own zip writer instead of
   *  trusting a shell `tar -a -cf`, which silently produces a TAR named `.zip`
   *  whenever GNU tar wins the PATH. Leave this on. */
  repack: true,
  /** Extra files to keep out of the upload (backups and nested zips are
   *  already excluded). */
  zipExclude: () => false,

  /** What the version is called in P4D. Keep the version number in it — it is
   *  the only thing tying a live build back to a commit. */
  versionName: version => `Chaos Machine ${version}`,

  /** Extra hosts the gates and the runtime sweep should accept. Anything here
   *  needs a matching per-URL approval in P4D → Settings → CSP. Chaos Machine
   *  makes no external requests on Poki, so: none. */
  allowHosts: [],

  /** Strings that must never ship in a Poki release — Poki asks for a clean
   *  build, "no debug code, no dev artifacts". The release aliases this tooling
   *  to stubs (src/platforms/policy.ts → vite.config.ts); a QA twin built with
   *  `VITE_POKI_QA_TOOLS=true` keeps it and is REFUSED here, by design. */
  forbidInBundle: [
    { text: '[CHEAT]', why: 'dev cheats, src/use/useCheats.ts' },
    { text: 'ctrl+shift+alt+', why: 'cheat shortcuts, src/game/cheats.ts' },
    { text: 'cmarc', why: 'typed debug-mode toggle, src/use/useCheats.ts' },
    // NOT the hidden multi-tap interstitial (src/use/useQaAdTrigger.ts): it
    // ships in the release on purpose (src/platforms/policy.ts).
  ],

  qa: {
    playMs: 45000,          // how long the harness actually plays before judging
    // How long to wait for a commercial break. NOTE: this game requests an
    // interstitial only when the rewards screen is left, 121 s apart
    // (src/use/useAdGate.ts), so a short pass usually sees none and reports the
    // ad steps as unproven. A human can fire one on demand, on the release
    // itself, with the hidden tap trigger (src/use/useQaAdTrigger.ts).
    adWaitMs: 120000,
  },

  /** Surfaces this game actually has. They decide whether a checklist step is
   *  "not applicable" or a real question — a game WITH usernames must not have
   *  its profanity-filter step reported as n/a.
   *
   *  Chaos Machine has neither: no name entry, no leaderboard, no chat. */
  declares: {
    usernames: false,
    chat: false,
  },

  /** Expressions evaluated INSIDE the game's iframe during the QA pass. */
  hooks: {
    /** A snapshot that must survive a reload. Chaos Machine keeps ALL of its
     *  state in ONE localStorage blob, `cmachine_state`, keyed by `cm_*`
     *  fields (src/keys.ts). Only DURABLE progress is read — counters that
     *  change on a mission result, never on a mere reload — so a timestamp
     *  or a running forge clock cannot fail a save that works. `null` when
     *  there is no save yet, which the pass reports as unproven, not as a
     *  pass. */
    readProgress: `(() => {
      try {
        const raw = localStorage.getItem('cmachine_state')
        if (!raw) return null
        const s = JSON.parse(raw)
        return {
          cleared: s.cm_cleared ?? null,
          medals: s.cm_medals ?? null,
          missions: s.cm_missions ?? null,
          scrap: s.cm_scrap ?? null,
        }
      } catch (e) { return null }
    })()`,

    /** Open the game's rewarded-ad flow. Chaos Machine has no rewarded
     *  placement, so the step is not applicable. */
    triggerRewarded: null,
  },
}
