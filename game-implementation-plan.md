# Chaos Machine — implementation plan

Resume point for every session. Method: `sequential-worker-playbook` (one
writer, research-only agents, decisions upfront, system before content, one
commit per phase). Tick a phase only when it is committed and verified.

- Game: **Chaos Machine** (id `chaos-machine`), design in `GDD.md`, look in
  `game-and-feel-reference.jpg`.
- Decision report (every decision, its default and source):
  https://claude.ai/artifact/FHpZTzoCA52ArtfjKQooRr
- Branch: `chaos-machine`. `origin` still points at the mega-droid GitHub
  repo: **never push** until the owner sets a new remote.

## Starting point (ground truth, 2026-10-02)

The repo is a copy of Mega Droid (first-person three.js room shooter). Maps of
the old tree were written by four research agents; their verdict lists decide
what Phase 0 deletes.

- **Kept as is**: engine loop (`src/game/engine/app.ts`, fixed 60 Hz step,
  interpolated render), renderer / quality tiers / DPR caps / context-loss
  handling, time slicer and loader-first boot, sliced shader precompile and GPU
  warm-up, rig kit (`models/kit.ts`, 3 draws per skinned rig, shared toon and
  outline materials), pooled particles and markers, perf probe and `?perf=`
  variants, audio engine (runtime-synthesised SFX and music), SaveManager and
  its platform strategies, platform descriptors, ad providers, i18n core with
  39 locales, pause / mute / gameplay-bracket composables, GameIcon glyph set,
  coach-glyph framework.
- **Rewritten**: the whole simulation (old `sim/mission.ts` is rooms, 2D sight
  and first person throughout), level format, AI perception, weapons, HUD, hub.
- **Not present, despite the brief**: BattlePass, Achievements, daily login,
  daily missions, TreasureChest, SettingsButton, StageBadge, CoinBadge,
  SpinnerArena.vue, Merge Idle War code, an angrybirds font file (copied from
  `../3d-world/src/assets/css/font/angrybirds-regular.ttf`), an e2e suite, the
  art sheet slicer and playground route.
- **Predecessor traps to defuse in Phase 0**: `.env` leaderboard URL + secret
  and `worker/wrangler.toml` point at Mega Droid production; Poki, Playgama,
  GameMonetize, Glitch and Wavedash ids are Mega Droid's; the Yandex cloud key
  is `spin_and_mow_blob`; `useUser.ts` sweeps other games' keys on a shared
  origin; five build scripts write a TAR named `.zip`; `isGameplayLive` and
  `whenInteractive.ts` key off the old screen and phase names.

## Persisted state

One in-memory object `cmachine_state: Record<string, any>`, saved as one blob
under the key `cmachine_state` (localStorage off-portal, the SDK cloud save on
portals) through the SaveManager. Fields are prefixed `cm_`; `cm_v` is the
schema version. Settings live in the same object. Nothing game-relevant is
stored outside it.

## Architecture (target)

```
src/game/
  engine/      loop, renderer, quality, slicer, input machinery, time scale
  bus.ts       typed event bus: sim -> HUD, sound, haptics, lessons, stats
  world/       fortress format, builder, chunked mesh, height nav, 3D sight
  models/      rig kit + mech, guard, commander, drone, enforcer, goliath, props
  sim/         player, camera, perception, alert, guards, drones, enforcer,
               goliath, weapons, blade, decoy, killcam, cinematics, mission
  meta/        economy, upgrades, forge, medals, rewards (pure, testable)
  data/        fortresses, weapons, enemies, tuning tables
  audio/       engine + Chaos Machine SFX set and the two music loops
  state/       hud mirror, profile (cm_* fields)
```

Pure logic (sight, alert, detection, scoring, economy, forge clock) has no
three.js import, so it runs in Vitest and in a balance script.

## Phases (commit after each)

- [x] **P0 Baseline and clean-up** — branch; clear predecessor ids, URLs and
  secrets; rename ids, titles, keys, zip names; delete Mega Droid content
  (stages, bosses, story, comic, voice, masters, loot, XP, skills, jobs, NG+,
  leaderboard, worker, voice tooling, rewarded UI); prune tests; the app boots
  through the loader into an empty scene; suite + type-check green.
- [ ] **P1 Foundations** — `cmachine_state` + schema version + merge score;
  event bus; global time scale; neon token layer; F-component rework (no
  collapse, FModal header/scroll/close fixes, relative units); angrybirds font;
  new glyphs; splash, logo, manifest placeholders.
- [ ] **P2 Fortress world** — level format + builder; outdoor mesh (16 m
  chunks, frustum culling, instanced props); height-aware nav and A*; 3D line
  of sight; sky, haze, island; fortress lab route.
- [ ] **P3 Rigs** — mech (blade arm, sniper, minigun, launcher, weapon tiers),
  guard, Commander, drone, Enforcer, Goliath Tank; model lab entries.
- [ ] **P4 The mech in play** — third-person controller and camera, crouch,
  cover, ladders, cables, drops, vault; touch + desktop action set, rebinding.
- [ ] **P5 Stealth** — patrol routes, vision cones, detection meter,
  suspicious / alarmed states, body discovery, drones, base-wide Alert Level,
  HUD meter and detection markers.
- [ ] **P6 Arsenal** — scope (first person, zoom, sway), hit-scan with head
  zones, magazine and reload; blade backstab and drop assassination prompts;
  decoys; minigun spool and heat; rockets and splash; weapon wheel; haptics.
- [ ] **P7 Chaos phase** — full alert switch, reinforcement waves, Enforcers
  power up, suppressive fire, armor and defeat, Goliath Tank fight.
- [ ] **P8 Cinematics and juice** — kill-cam director (bullet follow, x-ray,
  blade angles, 50 % / 20 % rates), drop-in intro, extraction outro with tally,
  effects pass (muzzle, tracers, explosions, hologram shaders, screen FX).
- [ ] **P9 Loop and Command Base** — objectives, score, medals, rewards
  screen, Tech Scrap / Data Cores / Blueprints, holomap, Armory, Chassis Bay,
  Forge timers; first-launch flow; balance sim as a test.
- [ ] **P10 Fortresses** — one sub-phase each:
  - [ ] 10.1 Training Outpost (wordless lessons: move, look, scope, headshot,
    crouch, blade, climb, cable, drop)
  - [ ] 10.2 small — decoy lesson
  - [ ] 10.3 small — forced alert, minigun lesson
  - [ ] 10.4 small — first Enforcer, rocket lesson
  - [ ] 10.5 – 10.8 medium, Commander targets
  - [ ] 10.9, 10.10 large, Goliath Tank
- [ ] **P11 Sound** — synthesised SFX set, stealth and chaos music loops with
  crossfade, loudness gate, `sound-todo.md`.
- [ ] **P12 Locales** — all new keys in the 39 shipped locales (agent drafts),
  parity test, RTL and CJK screenshots.
- [ ] **P13 Platform and release checks** — ads without rewarded placements,
  gameplay bracket, mute / pause / language signals, forced-dark guard, cloud
  hydration reload proof, Playwright e2e suite, every platform build.
- [ ] **P14 Pipelines** — art sheets + slicer + playground, compression,
  preview-video scenarios and capture seams, `deploy:poki` reset to this game.
- [ ] **P15 Performance and layout sweep** — throttled A/B into
  `PERF-LEDGER.md`, boot timeline, 320×658 portrait and 764×385 landscape.
- [ ] **P16 Documents** — `roadmap.md` (15+ items), `description.md`,
  `README.md`, `art-todo.md`, final report.

## Decisions (short form; the report has sources and options)

| ID | Default in force |
| --- | --- |
| C1 | Branch `chaos-machine`, Mega Droid WIP dropped, no push |
| C2 | Leaderboard + `worker/` removed, roadmap item |
| C3 | Voice files, tooling and `vo-src` removed |
| C4 | XP, skills, loot, jobs, NG+, boss weapons, comic, story removed |
| C5 | No rewarded placement; interstitial after rewards; first-load ad on GameMonetize / GamePix only |
| C6 | GameDistribution build dropped; real zip writer |
| C7 | 39 locales kept |
| C8 | angrybirds only, system fallbacks per script |
| A1 | New sim on the kept engine |
| A2 | Fortress = data on a 2 m height grid; ladders and cables are links |
| A3 | 16 m chunks, frustum culling, instancing, haze 140–220 m, blob shadows |
| A4 | No physics lib; 3D ray march for sight and shots |
| A5 | One global time scale |
| A6 | Typed event bus |
| A7 | `cmachine_state`, `cm_*`, `cm_v` |
| G1 | Third person; right side: drag looks, tap assassinates, hold scopes, release fires; sniper first person, minigun and rockets over the shoulder |
| G2 | No jump; context traversal; crouch toggle |
| G3 | Alert Level, 5 segments, drains when calm, full alert final |
| G4 | Silent mech; 110° cone to ~22 m; detection meter |
| G5 | 10 fortresses; small = clear all, medium = Commander, large = Goliath |
| G6 | Bodies stay, no carrying |
| G7 | Drone sighting raises alert and wakes one Enforcer |
| G8 | Tech Scrap, Blueprints, Data Cores (earned only) |
| G9 | Sniper 5-round magazine; minigun heat; rockets limited per mission |
| G10 | Decoy at fortress 2, minigun at 3, rockets at 4 |
| G11 | Kill-cam 50 % / 20 %, first headshot and final kill always, 5 s gap, skippable, off switch |
| G12 | Intro 5 s (3 s on replays), outro with tally |
| G13 | Medals: Ghost, Marksman, Swift |
| G14 | Armory / Chassis Bay / Forge tracks per GDD 3.2 |
| G15 | Forge: 1 min, 10 min, 1 h, 4 h; one slot; clock-change guard |
| G16 | Armor regenerates; defeat keeps 30 % scrap; no revive |
| G17 | First launch drops into fortress 1; returning players open the base |
| G18 | Wordless glyph lessons, retired by use, "?" recall |
| G19 | Haptics with an Options toggle |
| G20 | Goliath: armored front, rear vents, decoy + flank + rockets |
| G21 | Synthesised SFX; stealth and chaos loops |
| G22 | Flat-shaded low poly in lilac / pink / cyan; neon hologram UI |

Answered by the owner: none yet.

## Deferred

(nothing cut yet)

## Carried forward (owed by a later phase)

- **P1**: restyle the splash grid and bar (still navy and amber) in both
  copies; the top bar with mute and help (the old `TopStatus` test went with
  it); glyph set clean-up (`iconPaths.ts` still carries Mega Droid gear).
- **P3**: `models/gait.ts` + `motion.ts`, `props`, `exitDrone` are salvaged
  from `../mega-droid/src/game/models` (or `git show a10992d:<path>`) when the
  rigs are built.
- **P4**: `engine/input.ts` and `keyBindings.ts` still carry Mega Droid's
  action set (slide, block, tank, beam, weapon 1–3); `options.actions.*`
  follows them. The coach glyph components (`InputGlyph`, `KeyCap`,
  `CoachRing`, `Joystick`) come back from the predecessor with the new HUD.
- **P8**: `FreezeOverlay`, `ExitSkip`, `BigBanner`, `ScreenFx`,
  `DamageMarkers`, `FloatingText`, `cineCam`, `freezeCam`, `killCam` are
  salvaged the same way.
- **P11**: `audio/synth.ts` and `songs.ts` are Mega Droid's recipes and songs;
  `useSound.ts` keeps a fixed `theme.ogg` drop-in name.
- **P12**: `saveStatus.restoredBody` still says "bonus bolts" in 39 locales;
  a font-coverage test for the per-language fallback list in `fonts.sass`;
  a few stray keys (`hud.bolts`, `interact.chest`, `hub.tab.workshop`,
  `combat.slide`) go with their last users.
- **P13 / P15**: `scripts/perf-mission.mjs`, `xbrowser.mjs`, `portal-qa.mjs`,
  `perf-builds.mjs` still drive Mega Droid's first mission.
- **P14**: `tools/preview-video` is still configured for a third game
  (title, port 2067); `tools/art-desk` has no slicer or sheets yet.
- GameDistribution: build script and env file removed; the dormant provider
  arm stays in the platform layer behind its flag (never set).
- `.env` keeps an unused `VITE_GEMINI_API_KEY`; a `VITE_`-prefixed secret is
  inlined if anything ever reads `import.meta.env` dynamically. Owner's call.

## Status log

- 2026-10-02 Step 0 done: maps, decision report, this plan.
- 2026-10-02 P0 done. Deleted: old sim, world, story, data, HUD, hub, modals,
  voice files and tooling, comic, masters, leaderboard stack and `worker/`,
  rewarded UI, about 125 content tests. Re-keyed the save layer to
  `cmachine_state` / `cm_*` (merge score: cleared × 5000 + medals × 1000 +
  missions × 40 + scrap / 100; Yandex cloud key `cmachine_blob`). Portal ids,
  tokens and leaderboard URLs blanked; Mega Droid's Poki id added to the
  refusal list. New lockup, app icons, AngryBirds font, 39 locales pruned to
  the 63 keys still used, dev port 2196, real zip writer for portal archives.
  Gate: type-check 0 errors, 69 test files / 681 tests green, production build
  OK, browser pass at 1280×720, 320×658, 764×385 with no console errors and
  one storage key.

## Resume notes

- Dev server: `pnpm dev`. Check the served `<title>` ("Chaos Machine") before
  trusting a browser test; other games' servers run on this machine.
- Every finite parallel job goes through
  `node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- <command>`.
- Browser checks run on a private headless Chrome (own `--user-data-dir`, own
  port); stop the server and the browser after each check.
- Layout checks: 320×658 portrait and 764×385 landscape, touch UA.
