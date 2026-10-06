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
- [x] **P1 Foundations** — `cmachine_state` + schema version + merge score;
  event bus; global time scale; neon token layer; F-component rework (no
  collapse, FModal header/scroll/close fixes, relative units); angrybirds font;
  new glyphs; splash, logo, manifest placeholders.
- [x] **P2 Fortress world** — level format + builder; outdoor mesh (16 m
  chunks, frustum culling, instanced props); height-aware nav and A*; 3D line
  of sight; sky, haze, island; fortress lab route.
- [x] **P3 Rigs** — mech (blade arm, sniper, minigun, launcher, weapon tiers),
  guard, Commander, drone, Enforcer, Goliath Tank; model lab entries.
- [x] **P4 The mech in play** — third-person controller and camera, crouch,
  cover, ladders, cables, drops, vault; touch + desktop action set, rebinding.
- [x] **P5 Stealth** — patrol routes, vision cones, detection meter,
  suspicious / alarmed states, body discovery, drones, base-wide Alert Level,
  HUD meter and detection markers.
- [x] **P6 Arsenal** — scope (first person, zoom, sway), hit-scan with head
  zones, magazine and reload; blade backstab and drop assassination prompts;
  decoys; minigun spool and heat; rockets and splash; weapon wheel; haptics.
- [x] **P7 Chaos phase** — full alert switch, reinforcement waves, Enforcers
  power up, suppressive fire, armor and defeat, Goliath Tank fight.
- [x] **P8 Cinematics and juice** — kill-cam director (bullet follow, x-ray,
  blade angles, 50 % / 20 % rates), drop-in intro, extraction outro with tally,
  effects pass (muzzle, tracers, explosions, hologram shaders, screen FX).
- [x] **P9 Loop and Command Base** — objectives, score, medals, rewards
  screen, Tech Scrap / Data Cores / Blueprints, holomap, Armory, Chassis Bay,
  Forge timers; first-launch flow; balance sim as a test.
- [x] **P10 The fortress** — ONE large base to start with (owner,
  2026-10-02: "start with one fortress, we will add more later if the concept
  works out and is fun"). It carries every mechanic of the GDD in one mission:
  - [x] 10.1 layout: perch, curtain wall, towers, cables, keep, garrison
    (guards, sentries, drones, dormant Enforcers), the Commander, and the
    Goliath Tank that wakes for the finale
  - [x] 10.2 the wordless lessons on a first run: move, look, scope, headshot,
    crouch, blade, climb, cable, drop, decoy, weapon wheel
  - [x] 10.3 threat levels I–V of the same base (garrison size and toughness),
    so the Armory, Chassis Bay and Forge have something to be used against
- [x] **P11 Sound** — synthesised SFX set, stealth and chaos music loops with
  crossfade, loudness gate, `sound-todo.md`.
- [x] **P12 Locales** — all new keys in the 39 shipped locales (agent drafts),
  parity test, RTL and CJK screenshots.
- [x] **P12b Leaderboard** (client + baked board done; **the live Worker is NOT deployed**, see the status log) — a Chaos Machine board on a NEW Worker and D1
  database (`leaderboard-badge` skill; the owner is logged into wrangler). The
  predecessor's Worker and ids are gone and must not be reused.
- [x] **P13 Platform and release checks** (the full build matrix moves to P15) — ads without rewarded placements,
  gameplay bracket, mute / pause / language signals, forced-dark guard, cloud
  hydration reload proof, Playwright e2e suite, every platform build.
- [x] **P14 Pipelines** — art sheets + slicer + playground, compression,
  preview-video scenarios and capture seams, `deploy:poki` reset to this game.
- [x] **P15 Performance and layout sweep** — throttled A/B into
  `PERF-LEDGER.md`, boot timeline, 320×658 portrait and 764×385 landscape.
- [x] **P16 Documents** — `roadmap.md` (15+ items), `description.md`,
  `README.md`, `art-todo.md`, final report.

## Decisions (short form; the report has sources and options)

| ID | Default in force |
| --- | --- |
| C1 | Branch `chaos-machine`, Mega Droid WIP dropped. **Answered:** `origin` now points at the new repo |
| C2 | Predecessor leaderboard removed. **Answered:** the owner logged into wrangler, so a new board is built in P12b |
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
| G5 | **Answered:** one fortress to start. Target: the Commander, then the Goliath Tank; five threat levels of the same base |
| G6 | Bodies stay, no carrying |
| G7 | Drone sighting raises alert and wakes one Enforcer |
| G8 | Tech Scrap, Blueprints, Data Cores (earned only) |
| G9 | Sniper 5-round magazine; minigun heat; rockets limited per mission |
| G10 | With one fortress: all gear from the start, each taught by its own lesson on first use |
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

Answered by the owner (2026-10-02): G5 (one fortress), C1 (new remote), C2 (wrangler login for a new board).

## Deferred

(nothing cut yet)

## Carried forward (owed by a later phase)

- **P9**: the docked game logo and the currency badges in the Command Base's
  top bar (the chaos-arena arrangement: logo top-left, wallet top-right, mute
  over settings bottom-left; the last one is `hud/SystemCorner.vue` already).
- **P3**: `models/gait.ts` + `motion.ts`, `props`, `exitDrone` are salvaged
  from `../mega-droid/src/game/models` (or `git show a10992d:<path>`) when the
  rigs are built.
- **P10**: the coach glyph components (`InputGlyph`, `KeyCap`, `CoachRing`)
  come back from the predecessor with the lessons.
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
- 2026-10-02 P1 done. State: the in-memory object is `cmachine_state`
  (`useGameState.ts`); `state/profile.ts` holds the typed profile (schema
  version `cm_v`, defensive load, copies in and out, re-load on a cloud
  hydrate). `game/bus.ts` is the typed event bus; `engine/clock.ts` the
  fixed-step clock with a time scale (`app.setTimeScale`). UI kit: tokens in
  `assets/css/tokens.sass` (+ Tailwind `cm-*`), FButton / FHudButton /
  FHudBadge / FTabs / FSelect (menu teleported, never clipped) / FSlider /
  FModal (three-row grid: header and close in the flow, only the content
  scrolls, footer wraps) / FMuteButton / SettingsButton, all sized in `vmin`
  with hard floors and no scale transforms. 60 glyphs (13 new). Dev kit page:
  `#/ui`. Gate: 73 test files / 760 tests, type-check clean, build OK, browser
  pass of `#/ui`, the modal and the base screen at 1280×720, 320×658, 764×385.
- 2026-10-02 P2 done. `world/grid.ts` (pure): 2 m height cells, circle
  movement with sliding, ray casting with face normals, 3D line of sight,
  8-way A* and path smoothing. `world/fortress.ts`: the builder (island,
  walls, gates, towers, cover, stairs, ladders, cables, posts, dressing) and
  `world/validate.ts` (patrol loops walkable, ways up valid, extraction
  reachable). `world/fortressMesh.ts`: flat-shaded vertex-coloured blocks in
  16 m chunks with baked corner and foot shading, neon trims, ladders and
  cables; `world/sky.ts`: gradient dome, haze 70–260 m, instanced far islands
  and clouds; `world/decor.ts`: all props in two meshes. The proving ground
  (`data/fortresses/proving.ts`) renders at 40 draw calls and 7.7k triangles
  with the whole base in view, 22 calls through a narrow lens. The game boots
  into `scenes/fortressView.ts` (`?view=az,el,dist[,fov]` pins the camera).
  Gate: suite, type-check, build, browser pass at three sizes.
- 2026-10-02 P3 done. `models/mech.ts`: the mech (2.5 m; blade arm; sniper,
  minigun and launcher all in the rig, the holstered ones scaled away) with a
  blended pose function (walk, crouch, aim, recoil, stab, climb, cable, air).
  `models/garrison.ts`: guard and Commander (headshot zone constants), drone,
  Enforcer (dormant slump, glowing joints), Goliath Tank (turret, cannon, rear
  vents). Each is one skinned mesh plus an outline. Cover is 1.8 m and the
  crouched mech tops out at 1.65 m (tested). Bench: `?bench=models&m=…&pose=…`.
- 2026-10-02 P4 done. `engine/input.ts` rewritten for this game: left stick
  moves; right side decides by what the finger does (travels = look, lifts
  fast = act, stays put = the weapon comes up, then moving aims and lifting
  fires); desktop captures the mouse (move looks, right aims, left fires),
  rebindable keys (crouch, act, decoy, reload, weapons, next weapon).
  `sim/player.ts` (pure): walk, crouch (will not step off a high ledge),
  ladders, cables, mantle onto low blocks, drops. `sim/camera.ts` (pure):
  follow arm with wall collision, scope in the mech's eye, over-the-shoulder
  for the loud weapons, look rate scaled by zoom. `sim/mission.ts` is the game
  mode; the game boots straight into it on the proving ground. HUD: Joystick,
  AimHold ring, MissionHud (pause, crouch, cancel), PauseModal. Browser pass
  with real keyboard, mouse and touch input at 1280×720, 764×385, 320×658.
  Not yet: the Command Base (a turntable stands in for it), any enemy.
- 2026-10-02 P5 done. `sim/perception.ts` (cone + two rays: head and chest,
  so cover hides a crouched mech), `sim/alert.ts` (one meter for the base,
  five HUD segments, full alert is permanent), `sim/garrison.ts` (pure:
  patrol → suspicious → search → combat; body discovery; drones with a
  searchlight; `noiseAt`, `lureTo`, `killUnit`, `damageUnit` for the weapons;
  events queued on `gar.events`). One witness raises the alert by 35 and it
  climbs 16/s while any defender still sees the mech; a second witness adds 8.
  `sim/garrisonView.ts` draws the rigs, the cones (one mesh, draped on the
  ground, dark behind cover), the searchlights and the ?/! marks. HUD:
  AlertMeter, ThreatArcs. Guards do not shoot yet (P7); the simulation runs
  under the loader until P8 gives the mission an intro phase.
  Scratch probe: `probe.mjs <url> <out> <desktop|touch|touch-portrait> <scenario.mjs>`.
- 2026-10-02 P6 done. Pure modules: `sim/hitscan.ts` (ray vs grid and vs each
  defender's zones: head/body, Enforcer joints, Goliath vents), `sim/damage.ts`
  (the weapon × kind × zone table, `blast`), `sim/weapons.ts` (sniper: 5
  rounds, bolt, reload; minigun: spool-up, heat, lockout; rockets: 6 per
  mission, self-reloading), `sim/melee.ts` (backstab / drop / strike offer;
  decoys: 3 per mission, 9 s, thrown up to 12 m), `sim/rockets.ts`.
  `fx/combatFx.ts`: flashes, tracers, impacts, explosions, rockets in flight,
  decoy holograms (one particle draw call). `useHaptics` rewritten with a cue
  per weapon. HUD: Reticle (per weapon, scope lens, hit ticks), AmmoStrip,
  weapon wheel, decoy and strike chips. Touch fires on release / while held;
  a mouse has its own trigger. A sniper miss near a guard is heard; the
  minigun and rockets send the base to full alert. Zooms scale with the base
  field of view, so portrait and landscape magnify alike.
  Deferred to P8: scope glint/zoom-in sound, kill-cam. To P9: the look
  sensitivity slider in Options (the mission already reads the setting).
  `hud.armor` is translated in `scratchpad/i18n/p6.json`, waiting for P7.
- 2026-10-02 P7 done. Full alert wakes the dormant machines (1.6 s power-up)
  and brings reserve guards in by waves (8 s, 24 s, 42 s; `b.reserve()` in a
  layout). A drone's report wakes the nearest Enforcer on its own (G7).
  `sim/chaos.ts`: guards fire bursts (hit chance by range, the mech's speed
  and crouch; seeded, so a fight replays), Enforcers hose long bursts, the
  Goliath calls a shell onto a marked point (1.15 s warning, 4.2 m), prefers
  a decoy to the mech, and turns its turret 2.4× faster than its hull.
  `sim/armor.ts`: 100 armor, mends after 4 s out of the fire; at 0 the mech is
  down → DefeatModal → retry. HUD: ArmorBar, HitFlash (edge flush + bearing).
  `flow.swap` freezes the scene being left and shows LoadingVeil.
  Scratch probe `sc-layout.mjs` measures every HUD control for overlaps:
  none at 320×658, 764×385, 1280×720.
  Not yet seen in a browser: the Goliath (the proving ground has none; the
  P10 fortress brings it). Balance (9 s to go down standing still in the yard)
  is tuned in P10 with the threat levels.
- 2026-10-02 P8 done. `sim/killcam.ts` (pure director: first headshot and the
  objective kill always, 50 % of headshots, 20 % of the rest, 5 s apart,
  honours the Options switch). `sim/cine.ts` (pure camera moves: bullet chase,
  orbit, drop-in, extraction). In the mission: a sniper round that will kill
  can be held back and ridden in by the camera (the world frozen), then the
  x-ray plate and a slow orbit at 0.16× time; blade and objective kills get
  the orbit; bursts and blasts only the slow beat. The drop-in (5 s, 3 s once
  seen; dropship, fall, landing) runs in phase `intro`, the extraction (line
  down from the dropship) in `outro`, then phase `done` and bus `extracted`.
  Objective: the Commander / Goliath dead → the pad's beacon lights → stand on
  it. Any press skips a scripted shot. `flow.curtain` holds everything
  scripted until the boot loader has left. CineBars: letterbox + skip glyph.
  Scratch probes: `intro.mjs`, `sc-cine.mjs`.
- **Probe rule (owner, 2026-10-02):** headless Chrome takes the REAL pointer
  lock and grabbed the owner's mouse. Every probe page now runs
  `scratchpad/nolock.mjs` (an in-page stand-in for the lock) through
  `page.addInitScript`. The P13 Playwright fixtures must do the same.
- **`roadmap.md` is the owner's file** (it appeared on 2026-10-02 with their
  item #1: Gemini-painted cover images in every portal size, with and without
  the logo). Never stage it: commits use
  `git add -A -- . ':!.claude/settings.local.json' ':!roadmap.md'`.
  P14 takes item #1 into the art pipeline; P16 APPENDS the retention roadmap
  to that file as items #2…, leaving #1 as written.
- 2026-10-02 P9 done. `data/upgrades.ts` (10 tracks: 3 sniper, 2 minigun, 2
  rocket, 3 chassis; 5 levels each, 60 → 395 scrap; Forge tiers 2–5 from
  blueprints + scrap in 1 min / 10 min / 1 h / 4 h; `loadoutOf` turns the
  save into the numbers a mission plays with). `sim/rewards.ts` (score,
  Ghost / Marksman / Swift, scrap, cores, blueprints, 30 % kept on defeat).
  `state/progress.ts` (bank a mission or a defeat, buy a track, run the
  Forge; the Forge's stamp never moves back, so winding the clock back and
  forward finishes nothing). `flow.ts`: `level`, `result`, `finishMission`,
  `failMission`; a fresh profile boots into the fortress, a returning one
  into the base; scene swaps are shader-precompiled. Screens: BaseHud
  (logo, Wallet, stations, DeployPanel with the five threat chips),
  WorkshopModal (Armory / Chassis Bay / Forge), RewardsModal, DefeatModal,
  ObjectiveMarker (edge-clamped waypoint), look sensitivity in Options.
  `scenes/commandBase.ts`: the mech on its pad. Economy test: a careful
  player tops every track in 15–70 missions, a loud one in under 110.
  Browser: the whole loop including a reload (one key, `cmachine_state`,
  restores scrap, cores, blueprints, upgrades and the running build).
  Small buttons were 36 px tall: now 40. Scratch probes: `sc-loop.mjs`,
  `base.mjs` (seeds a returning save; measures overlaps).
  Still to do in P10: the five threat levels all play the same garrison.
  In P13: the interstitial goes BEFORE the rewards screen (playbook).
- 2026-10-02 P10 done. `data/fortresses/bastion.ts`: one 104 × 112 m base
  (south ward, inner wall with main gate and postern, keep with the
  Commander on its roof, tank park, perch with a cable in), built per level:
  I a night watch; II sentries, a second drone, Enforcers; III the Goliath,
  which wakes 2 s after the Commander dies and must be destroyed too; IV, V
  more patrols and reinforcements. `garrison.threatOf(level)` scales health,
  damage and how fast the base notices (level I is gentler than baseline).
  The Goliath holds its ground (wider than a gate) and turns its hull slowly.
  `sim/coach.ts` (pure): ten wordless lessons (move, look, scope, fire,
  crouch, blade, climb, cable, decoy, weapon), two at a time, retired by use
  per input family and saved in `cm_lessons`; they come back when the player
  is stuck and on the "?" chip. ControlHints draws key caps (in the player's
  own layout), a mouse with a button lit, and finger gestures on the part of
  the screen they work on; HUD chips pulse for their own lesson.
  Dev URL: `?level=3`, `?fort=proving`, `?view=az,el,dist`.
  Draw calls at the perch: 124 (71k triangles) — P15's first target.
  Not yet seen in a browser: a full no-cheat playthrough by hand.
- 2026-10-02 P11 done. `audio/sfx.ts` + the recipes in `audio/synth.ts` are
  this game's own set (61 names: the mech, the three weapons, the blade and
  decoy, what a round does, the base, mission beats, the interface); the
  predecessor's list is gone. `minigunHum` is one voice pitched by the
  barrels. `audio/gameSounds.ts` is the only place events become sounds and
  the music follows the place (`stealth` → `chaos` on full alert → `base`).
  `audio/songs.ts`: the chiptune composer, the lo-fi song and the
  predecessor's intro score are gone (1,544 → 1,036 lines); "Night Watch"
  (stealth, 76 BPM, no drums) is new; "Overload" is the chaos theme, "Neon
  Drift" the base's. Each loops; a change hands over with a 2.5 s tail.
  Loudness (offline render, scratch `loudness.mjs`): stealth −23 dB, base
  −19.9, chaos −19.5 (its peak was over 0 dBFS; trimmed). `sound-todo.md`
  lists every name and how a recording replaces it.
  Not verified by ear: this machine's probes are headless and muted. Not done:
  positional pan / muffle (the synth supports both).
- 2026-10-02 P12 done. Every key added in P4–P11 is in all 39 locale files
  (merged per phase by `i18n-apply.mjs`, which also checks placeholders;
  `tests/i18nParity.test.ts` holds it). New `tests/ui/fontCoverage.test.ts`
  reads the font's character map: each language set in AngryBirds has every
  letter it uses in the font, and each language moved to a system face is
  there because it has letters the font lacks. Browser: base, workshop and
  Forge measured in ar, ja, vi, fi, ru, de at 320×658 and 764×385 (no
  overlaps, nothing off screen); rewards screen at 320×658.
  As shipped by the predecessor: Arabic text runs right-to-left inside a
  left-to-right layout (the HUD does not mirror).
- 2026-10-02 P12b: client done, Worker blocked. From the `leaderboard-badge`
  templates: `worker/` (name `chaos-machine-leaderboard`, `MAX_SCORE` 500 000,
  its own toolchain installed), `use/useLeaderboard.ts`, `usePlayerIdentity`,
  `usePortalLeaderboard` (inert), RankBadge, LeaderboardModal, the snapshot
  Vite plugin, CSP entry, 8 save keys, the suites (all green), 12 strings in
  39 locales.
  **Score = the campaign score** (sum of the best mission score at each threat
  level; only ever grows). **Flair = highest level cleared.**
  `scripts/leaderboard-seed.mjs` → `data/leaderboard-seed.json`: a MODELLED
  board (2 400 players, a histogram, NO rows, so no invented names) baked
  into every build that has no endpoint. With it the rank badge works
  ("#1,322 of 2,400 players") on the rewards screen and in the base; the
  table button only appears when a board has real rows.
  **BLOCKED: `wrangler d1 create chaos-machine-leaderboard` → "System limit
  reached: databases per account (10)".** Nothing was created on the account.
  To finish once a slot is free (owner's call which database goes, or a paid
  plan): `cd worker`, `npx wrangler d1 create chaos-machine-leaderboard`, put
  the id in `wrangler.toml`, `npm run db:init`, `npm run deploy`,
  `npx wrangler secret put SCORE_SECRET`, then `VITE_LEADERBOARD_URL` and
  `VITE_LEADERBOARD_SECRET` in `.env` (keep them EMPTY in `.env.poki.local`,
  `.env.yandex.local`, `.env.playgama`), `pnpm leaderboard:snapshot`, commit
  the snapshot once the board has rows. `worker/SETUP.md` has every step.
  Not started: Playgama's own hosted board (the skill's Phase 8 needs the
  board created on the Playgama dashboard and its token: owner's action).
- 2026-10-02 P13 done. Ads: the one break is on the way OFF a result screen
  (`flow.leaveResults`: close the screen, interstitial if the pacing clock
  allows, then the next scene), never on top of it; no rewarded placement
  anywhere (a test greps the screens). `tests/platforms/resultAdOrder.test.ts`.
  `scripts/portal-qa.mjs` adapted to this game (and given the pointer-lock
  stand-in): **12/12 on the built GamePix bundle** (muted at boot → no music;
  unmute → music; tab away freezes world and audio; menu freezes the world;
  first-load interstitial requested).
  **`pnpm test:e2e`** (new: `e2e/`, `vitest.e2e.config.ts`, playwright-core on
  the system Chrome, its own dev server on a free port with hot reload off):
  8 tests, all green: first launch (no menu, skippable drop-in), wordless
  lessons and no overlapping controls at 320×658 and 764×385, stick and
  look by touch, a silent scoped headshot, blade then minigun to full alert,
  defeat and retry, the whole loop with a RELOAD (everything back from the one
  `cmachine_state` key, opens in the base, next mission at the new level with
  the upgrade fitted), the base and workshop in German on three screens.
  Forced-dark guard: `color-scheme: dark only` is in place.
  Not run here: the other portals' built bundles through portal-qa, and the
  full platform build matrix (the machine's worker budget was taken by other
  sessions most of the day): P15.
  `scripts/boot-timeline.mjs` no longer waits on the predecessor's intro;
  `perf-mission.mjs` and `xbrowser.mjs` still drive Mega Droid (P15).
- 2026-10-02 P14 done.
  **The seam.** `src/game/preview.ts` publishes `window.__preview` on a dev
  server under `?preview=1` (one dynamic import inside a DEV branch: a
  production bundle does not contain the module; a test pins that, and the
  built bundle was grepped). It moves the mech, finds a vantage with the
  shot's own ray-cast, tracks a head with the camera, holds the trigger, pins
  defenders, replaces the camera, and reports state. It decides no outcome.
  **Clips.** `tools/preview-video`: config for this game (port 2197, own
  Vite cache via `VITE_CACHE_DIR`, pretend pointer lock) and four scenarios
  (success, fail, success-30s, fail-30s) on `_drive.mjs`. All 14 clips
  recorded at full quality in `preview-videos/` (not committed): 10 s and
  30 s in both orientations, CrazyGames 16 s (16:9 and 2:3), Poki 5 s square
  at 60 fps. Upload copies 1.9 to 13.1 MB. Verdicts read from the log: every
  success clip ends "objective extract", every fail clip "phase dead" except
  Poki's 5 s fail (armor 6 %, still standing: too short to die in).
  Two traps found on the way: a strike keeps moving the mech for a moment
  after the kill, so restaging must wait for `busy` to clear; and the guards'
  line of sight sees over walls a round does not, so a vantage is checked
  with `castShot`.
  **Covers (roadmap #1).** `src/game/art/promotionSheet.ts` +
  `tools/art-promotion.mjs` (`pnpm art:promotion`): plates are screenshots of
  the game's own models (director's camera, pinned defenders, interface
  hidden); four scenarios painted once each at 1:1 through the Art Desk's
  Gemini window and compared at 250 px; `ambush` ships (`COVER_PICK`), `scope`
  is the runner-up. All seven aspect families of `ambush` painted: 19 cover
  files (every size in the roadmap item, with / without logo, the formats it
  names) + `logo-512.png` in `src/assets/promotion/`, 3.1 MB → 1.1 MB after
  compression. 15 generations in all (4 scenarios, 6 families, 5 re-rolls:
  the Commander painted as the victim, a logo over a face, a framed poster
  twice, a junk foreground). The tool now cuts a painted frame off and says
  so. The pick is a judgement against a checklist, not a measured CTR.
  **Drop-in art.** `src/game/art/artSheet.ts` (the two detail maps),
  `pnpm art:prompts [--references]`, `pnpm slice-sheets` (refuses a wrong
  shape or an unknown name, parks a painting whose reference was redrawn),
  `?art=off`. The slicer was exercised on all four cases. Nothing painted:
  the fortress keeps its procedural maps.
  **Compression** and **deploy:poki** were already this game's (no ids).
  Not done: a flag to hide the "?" / "!" marks in a clip; `scope` in the
  other six aspects; painted detail maps.
- 2026-10-02 P15 done. Numbers, method and open items: `PERF-LEDGER.md`.
  At 4x CPU on the built bundle: stealth holds 60 fps (work p50 9-11 ms),
  the loud phase holds 30 with a tail (work p95 up to 100 ms, not yet
  explained: open item 1). Boot: playable after 3.9-4.6 s, longest task
  0.44-0.74 s. Three changes, each behind a `?perf=` flag for its A/B:
  the objective marker no longer forces a layout every frame (8.5 % of CPU
  in the profile; p95 better in 3/3 pairs), the sky's instanced islands no
  longer share a material with plain meshes (5 % in program lookups; better
  in 4/4 pairs, median 7 %), rapid-fire sounds are voiced once per 50-80 ms
  (weak evidence, kept, nobody has listened). The machine was shared while
  measuring; loud-phase runs spread widely.
  `scripts/perf-mission.mjs` drives this game (`--stealth`, `--profile`),
  `scripts/xbrowser.mjs` plays to the rewards screen and back to the base
  through a new dev cheat (Ctrl+Shift+Alt+O): **PASS on Chrome, Edge, Firefox
  and WebKit**, zero page errors (WebKit never takes the mouse capture).
  Release checks from the final tree: all eight portal builds exit 0
  (crazy-web, gamepix, gamemonetize, yandex, itch, glitch, poki, playgama);
  portal QA **12/12 on GamePix**; on GameMonetize 10/12 as shipped, because
  the game id is empty and the SDK is never asked, and **15/15 with a
  placeholder id** (the wiring is right; it needs the real id);
  **Poki's offline gates all pass** (`pnpm deploy:poki --gates-only`:
  no CSP meta, no foreign SDK, no dev tooling, 1.14 MB initial, 1.76 MB
  total). Layout: the e2e suite checks the HUD at 320x658 and 764x385 and
  the base and workshop in German on three screens. Suite: 98 files / 1198
  unit tests, 8 e2e, type-check clean.
  Not done: a phone has not been measured; draw calls (about 124 from the
  perch) were not reduced; wavedash was not built (its script pushes).
- 2026-10-02 P16 done. `README.md` rewritten for this game; `description.md`
  (short 139 / 150, description 482 / 500, how to play, controls);
  `art-todo.md`, `sound-todo.md`; `PERF-LEDGER.md`; `roadmap.md` (the
  owner's file, not committed): #1 ticked with its deferred note, retention
  items #2-#20 appended.

## Round 2: the first playtest (2026-10-02)

Thirteen asks, in `roadmap.md` as #21 to #33. Same rules as round 1: one
writer, a gate and one commit per phase, systems before the content that uses
them. Tick the roadmap item when its phase is committed.

- [x] **R1 Controls** (#21 #22 #23): the crouch stands on the floor; sprint on
  Shift (hold) and on the stick's rim; sprint is heard; the rebinding tab
  gets the new actions and its loose ends fixed.
- [x] **R2 Animation engine** (#26): human gait and idles, blended states;
  machines move like machines with weight.
- [x] **R3 Deaths and wreckage** (#27): staged deaths per kind and for the
  mech; machines can burst into pieces that stay and are found.
- [x] **R4 The blade, choreographed** (#28): close-up, blade through, held
  until it is pulled out, its own kill cam.
- [x] **R5 Grappling hook** (#25): over a wall from below; landing noise,
  2 s of wondering, inspect; cancel to stay unnoticed.
- [x] **R6 The scrapyard fortress** (#24): bevelled level geometry, metal
  plating, props kit, sweeping searchlights on towers, Bastion rebuilt.
- [x] **R7 Salvage and the way out** (#29 #30): salvage piles are the
  objective; the robo dog that becomes a jet board.
- [x] **R8 Furnace and smithing** (#31): the upgrade minigame and its economy.
- [x] **R9 Interface look** (#32): futuristic and cute.
- [x] **R10 Lessons** (#33): wordless teaching for everything, old and new.
- [x] **R12 Drone weak point** (#37): only the eye kills a drone outright, and only with enough power; a hit elsewhere damages it and makes it suspicious of where the shot came from.
- [x] **R13 Bodies are found; a box to hide in** (#38): patrols walk past the places the dead lie and raise the alarm when they see them; a cardboard box / metal shield the mech can duck under and stay unseen while still.
- [x] **R14 The rope walk** (#39, second half; the jump off the robo dog landed in R7): the mech goes hand over hand along a cable instead of sliding.
- [x] **R15 Bosses** (#40): one or two per level that a sniper cannot drop in one shot, varied by level; a hit on one alarms the whole fortress, so the weak ones are cleared first.
- [x] **R11 Regression** (moved after R12-R15 so it is done once): translations of every new key into the 38 locales, e2e, clips re-recorded, perf, documents.

### Decisions (defaults taken; nobody was asked)

| ID | Decision |
| --- | --- |
| D1 | Sprint: hold Shift (either). 1.45x run speed, not while aiming; it stands a crouched mech up. Touch: a sprint switch in the thumb's column that lets go with the stick (the rim of a floating stick is hit by accident too often for something this loud). A sprinting mech is HEARD within 9 m (guards turn to look, no alert raised by sound alone). Shift stops being the second crouch key. |
| D2 | Rebinding already exists (Options, Controls; reachable from the pause menu). Round 2 adds sprint and grapple, makes pause (P) rebindable, and removes the dead help modal state. |
| D3 | Wreckage: every machine kill bursts into rounded cubes (the Goliath always, Enforcers and drones 60 %); pieces stay for the mission and count as a body for patrols. Human bodies stay as before. |
| D4 | Blade kill: about 2.4 s of choreography in slow time; the mech is safe during it (as during a kill cam today). A frontal strike on an alerted guard stays a quick strike without the close-up. |
| D5 | Grapple: key G / a HUD chip that appears at the foot of a climbable wall (up to 9 m). The hook's landing is heard within 10 m: listeners wonder for 2 s, then walk to the spot. Pressing again within those 2 s recalls the hook and they shrug it off. |
| D6 | Look: the game keeps its lilac / pink / cyan night; the fortress adds gunmetal, rust orange and hazard yellow. Searchlights are their own fixture on towers, sweeping between authored points; being lit works like a drone's spot. |
| D7 | Objective: collect the salvage (3 of the 5 piles at level I, more per level), then extract. The Commander guards the mother lode on the keep; killing him is no longer required but still pays a bonus and the finale at level III+. |
| D8 | Extraction: the beacon calls the robo dog; it runs in, folds into a jet board, the mech steps on and rides out. The dropship stays for the drop-in. |
| D9 | Smithing: salvage becomes ingots in the furnace (hold the heat in the band), ingots become an upgrade at the anvil (hit the glowing marks in rhythm), quench. 8 to 20 s of waiting between steps, never more. Quality (1 to 3 stars) refunds ingots; a bad run never loses the upgrade. Replaces the Forge's hour-long timers and the buy buttons. |
| D10 | UI: thicker rounded panels with cut corners, soft inner glow, sticker-like icons, small idle motion; still tokens, clamp sizing, no scale transforms. |
- 2026-10-03 R1 done. The crouch: the hips are no longer lowered by a guessed number; each leg's reach is computed from its own angles and the hips sit where the longer leg meets the floor, so a foot is on the ground crouched, striding and between (tests sweep crouch x stride x speed). The squat is deeper (thigh 1.6, knee 2.65), the sole flat, the lowered rifle carried forward instead of trailing through the floor. Sprint: `sprint` action on Shift (held), 8.1 m/s against 5.6, stands a crouched mech up, off while aiming; a touch switch chip; a sprinting footfall is heard within 9 m (`hearAt`: listeners go to look, the alert meter does not move). Bindings: crouch keeps C only, `pause` (P) is an action now and rebindable, the dead help modal state is gone. Rebinding itself existed already (Options, Controls, also from the pause menu); the new actions appear in it. English strings only for now: the other 38 locales carry the English text until the R11 translation pass. Verified: 99 files / 1208 unit tests, 8 e2e, type-check clean, side-on screenshots of stand / crouch / crouch-walk / sprint.
- 2026-10-03 R2 done. Guards: the boot is its own bone and rolls heel to toe; the pelvis drops onto the stepping foot, turns with the stride and the chest turns against it; the hips ride where the legs reach the floor (same grounding as the mech); the gait is whole at a WALK (it used to scale with speed, so a patrol at 40 % shuffled); standing, they shift their weight, breathe, and now and then look at their boots, roll their shoulders or scratch under the helmet; each has its own stride and timing from a seed; wary, they crouch into a creep with the rifle at the ready; startled, they rear back; the Commander struts with a hand behind his back. Drones bob, drift, bank into turns, look down their beam and shake when alarmed. Enforcers land each step, roll over the carrying leg, swing their guns late and shudder as they wake. The Goliath rides its suspension and rocks back when it fires. Seen in the model bench (`?bench=models&m=guard&pose=walk|run|idle|wary|search|startle`, `seed=`); tests/game/gait.test.ts pins the foot on the ground, the stride length at a walk, the heel-toe roll, the counter-rotation, the fidgets.
- 2026-10-03 R3 done. People fall four ways, chosen by what hit them (`KillHow` on `killUnit` / `damageUnit`): `back` (a round from the front: head snaps, heels leave the ground), `front` (from behind or the blade: knees give, a beat on the heels, onto the face), `spin` (a minigun burst turns it and drops it on its side), `thrown` (a blast: off its feet, over, down two metres away). Each is staged (reaction, giving way, landing with a bounce, limbs settling), blends in from whatever the guard was doing, and is still after `DEATH_SECONDS`. Machines: `burst` into rounded cubes in their own colours (`fx/wreckage.ts`: one instanced mesh, pieces bounce off the floor and walls, come to rest and stay all mission; capacity 260, resting pieces cost nothing). The Goliath always bursts, an explosion always bursts, otherwise 60 % by the machine's own seed; the rest `slump` (an Enforcer topples onto its guns, lights stuttering out) or `crash` (a drone tumbles down whole and sheds a few parts where it lands). Wrecked drones are now evidence too: a patrol that sees one raises the alert like for a body. The mech: knees, a beat with its lights stuttering, forward onto its face, a few plates knocked off, then the defeat screen. Verified: tests/game/deaths.test.ts (22 tests), bench strips of the four falls, in-game shots of a Goliath and an Enforcer coming apart and of the mech going down; 101 files / 1238 unit tests, 8 e2e.
- 2026-10-03 R4 done. `sim/takedown.ts` (pure): from behind or from above, with kill-cams on, the blade is a takedown of about 2.2 s: the mech closes to 0.72 m square behind the target, the free hand goes over its shoulder, the blade arm cocks and the blade springs out of the forearm (hidden until then), the arm goes through (the kill; time drops to 0.3x), the target hangs on the blade going limp, the blade comes out, the body is let go and only then falls (`Unit.hold`; a body on the blade is not found by anyone). The target is `gripped` from the first frame: it cannot turn round. The mech cannot be seen or hurt while it lasts. Its own camera: beside the two until the stab, then a cut to the front of the target, low, pushing in on the blade's tip at the stomach, easing back as the body drops; pulled in if a wall is in the way; any press after 0.7 s skips to the end. With kill-cams off, or face to face, it is the old quick strike. A test builds both rigs and checks the blade's line passes through the middle of the target's torso and its tip is 20 cm clear of the front. Seen in the bench (`m=takedown&t=`) and in the mission.
- 2026-10-03 R5 done. `sim/grapple.ts` (pure): at the foot of a wall too high to pull up onto (over 2 m) and within the line's 9.5 m, facing it, the hook is on offer (G, or the chip that appears; rebindable). It flies up the face (0.28 s), BITES (the noise), the line goes taut (0.4 s), the mech is reeled up (0.8 to 1.7 s by height) and swings over the edge. The bite is heard within 10 m (`wonderAt`): listeners stop and wonder for 2 s, looking about where they stand, and only then walk to the spot; nobody raises the alarm over a noise. Pressing again while the hook can still be taken back (until the mech goes over the edge) recalls it: the mech drops to the foot of the wall and whoever was still wondering shrugs it off (`voidNoise`); too late, and they are already coming. The chip turns into the recall button, red with a count when somebody heard. New sounds (throw, bite, reel, recall) and a hook glyph. Verified: tests/game/grapple.test.ts (15 tests: where it can go, all four faces, the climb never dips or passes through the wall, recall, the two seconds, the shrug), and in the mission (climbed the inner wall, recalled a second throw). 103 files / 1265 unit tests.
- 2026-10-03 R6 done. The level mesh is a scrapyard fortress now (`world/fortressMesh.ts` rewritten): every structure's top edge is chamfered (14 cm; caps close the chamfer where it meets a taller or non-continuing neighbour), walls are welded from 2 m steel plates in two greys with 11 % rust, tall walls carry stiffening ribs and a row of leaning scrap spikes along the lip (outside the walkable cell), cover is corrugated shipping containers one colour per run, the ground varies per cell with the odd stain, and decking (`deck()`, hazard paint at the gates) is laid along the roads. One detail atlas (`textures.ts`: floor plate, riveted wall plate, container side, blank; the art pipeline's drop-ins still replace floor and wall) is multiplied over the vertex colours: still one draw call per chunk; in Node the plain material is used. Props (`world/decor.ts`, all from the kit's rounded solids): scrap heaps (solid cover via `heap()`), a gantry crane, generators, fuel tanks, cable drums (solid via `solid()`), pipes, tyres, girders, vent stacks with furnace glow, cones, floodlights. Searchlights are a new defender kind on masts (`searchlight()`): the beam sweeps between authored points holding at each, sees like a drone's spot, wakes a machine and raises the alert, swings onto suspicions and hunts in a circle; it can be shot out (bursts; whoever is near wonders). Bastion: 1 light at level I, 2 at II, 3 at III, 5 at IV+; 9 heaps, the crane over the yard. Scene at level IV: fortress 12 k triangles, props 30 k, garrison 92 k (unchanged rigs); about 157 draw calls in a wide view. Verified: tests (fortress mesh: pillar exact count, no inner faces; searchlight sweep / sight / shot out; heap and deck; Bastion valid at every level), screenshots of six views, 103 files / 1278 unit tests, 8 e2e.
Salvage piles (8 in the Bastion, 3+ needed by level, one big one on the keep) are the objective: E strips a pile in 1.15 s with a little noise, HUD haul counter, waypoint to the nearest pile, payout counts what was carried (+60 for the Commander). Robo dog: the mech rides in on the jet board and jumps off onto the perch; at the pad the dog gallops in, folds into a board, the mech hops on and flies away. Validator knows the hook (9.5 m). e2e strips three piles with the real key.
Smithy replaces the hour timers and the instant buy: every upgrade and weapon tier is made in three short games (furnace: hold the bellows to keep the heat in a wandering band; anvil: four strikes as rings close on glowing marks; quench: dip at cherry red), with 8-16 s (upgrade) / 14-20 s (tier) melt and cool waits between, one Data Core skips a wait; 1-3 stars refund 0/10/25% of the scrap. Old hour-long builds carry over to the quench. Fixed two tap-eaters found by the e2e: a leaving modal and a fading loading veil swallowed the Command Base's first tap. Open for R9: on a 320 px phone in German the workshop's third tab is off screen.
One material for the whole kit, set in tokens: ink outlines with a drop (stickers on glass), glossy crowns, lit surfaces. Modal panels get a thick cyan-to-pink rim, breathing corner brackets, a striped title plate with a glowing seam and a dot; buttons are candy keys with a gloss and sparkle, and the main CTA catches a sweep of light; HUD chips, capsules, wallet, rank, keycaps and the deploy panel wear the same; upgrade and smithy rows get round sticker icons. Tabs sit in a trough, and on a narrow screen only the open tab shows its name (the workshop's third tab was off screen on a 320 px phone). No scale transforms; reduced motion stops the idle motion.
Four more wordless lessons in the coach, each in its context and earned away by use, per input family: the marker (it sends out rings, and a desktop card shows a little pin, until the first pile is reached), stripping a pile (E / the loot chip pulses), the grappling hook at the foot of a wall (G / its chip), and sprinting on a long way with nobody about (Shift / the sprint chip). The smithy's three games carry a finger on the control (hold the bellows, tap the anvil, tap the dip) until each has been played well once. New guard test: every component's template compiles as the dev server compiles it (a patch had put CSS into two templates, which the type-check does not see). Fixed a white box round the hold glyph's ring: its class collided with Tailwind's ring utility.
The drone's eye is its weak point: a hit zone (r 0.19, from in front only) where a sniper round kills; the shell lets through a third of a round, so two shell hits bring it down. A drone hit in the shell does not know what hit it: it turns suspicious and goes to look where the round came from, no alarm; hit again while wary, it calls it in. A damaged drone trails smoke. The minigun still shreds drones; a searchlight is still put out by any round. Preview pin keeps flyers at their altitude.
Bodies are found: a dead defender's radio goes quiet, and after 28-40 s the nearest walking patrol goes to where it lies (radio crackle, the guard's '?'), finds it and raises the alarm; bodies are told for what they are from 18 m (was 14). The hide box (B, a touch chip): a scrapyard crate with sleepy glowing slits drops over the crouched mech, its feet showing under the rim; still, it is a box to anyone further than 2.4 m; creeping (1.6 m/s) is odd: watchers get suspicious and come to look, never sure from afar; walked into, it is a mech. Raising the gun, sprinting, climbing or stripping a pile throws it off; the gun is stowed under it. Lesson: B / the chip, when a guard is half-way to sure and crouch is learned.
The cable walk: the legs were fed speed 0 on a cable, so the mech glided; they now step at its pace, short careful steps with a higher lift, each foot set down on the line under the body. The arms, which a wrong-signed roll had folded into the chest, go out wide and see-saw against a slow sway of the hips; the head watches the feet. (The jump off the robo dog at the start landed in R7.)
Bosses, one or two a level: the Warden (the Commander) every level, in an armoured helm (a sniper headshot is a third of him, hp 180 x threat), with a riot shield from IV that stops rounds from in front; the Foreman at II (a hazard-crested Enforcer, 1.6x); the Goliath from III. No blade reaches a boss, and the first hit on one sends the whole base to full alert, so the weak ones are cleared first. A boss bar (ten plates, a shield glyph) shows the last boss hit.
Translations of round 2's 18 strings into all 38 locales; README and store copy describe the salvage raid, robo dog, smithy, hook, hide box, sprint and bosses; all 14 portal clips re-recorded (the success cut strips a pile on camera, the long cut fights the Warden round by round; every beat landed). Perf re-check inconclusive: the machine was loaded (the pre-round-2 build itself measured 2.5x its ledger values); noted in PERF-LEDGER.md to re-measure before release. Then #41: three blind Sonnet testers in headed Chrome (kid on a phone, stealth fan, action fan) and a design review published as an artifact.

## Round 3: the design review (2026-10-03)

Source: the blind playtest and design review published as an artifact
(https://claude.ai/artifact/SPupmxYLrhg5FveTRC3JVY). The owner: "go ahead
with the Now list, start with the camera fix, do all the report's findings.
The player detection should work like the guards in a fortress in Assassin's
Creed: Odyssey." Decisions take the recommended default (standing order);
sources are in the decisions below.

### The Odyssey model, as researched

- A detection meter per guard that fills while the guard can see the player,
  faster near, slower far, slower crouched, in cover or in hiding spots
  (bushes), at night; shown as arcs round the centre of the screen pointing
  at each guard who is noticing, and as a filling icon over the guard.
- White while filling; full once: YELLOW, the guard is suspicious and walks
  to the last known position (LKP) to investigate, with sharper senses while
  it does; full again (or seen close up): RED, detected: combat.
- A red guard shouts: guards near him join. Forts have alarm braziers: a
  guard runs to one and lights it, and reinforcements come; the player can
  sabotage the brazier beforehand, or stop the runner.
- Bodies and sabotage found send guards to yellow.
- Losing them: break line of sight; they go to the LKP, search round it, give
  up and return to their posts.
- Bushes hide a still player completely until a guard walks into them.
- Captains and the fort leader cannot be assassinated in one blow (their
  health bar shows it); Ikaros tags enemies and objectives from above.
- Dogs alarm; guards fill vacant posts.

### Phases (commit after each)

- [x] **R16 Camera**: never inside the mech; crane up over the shoulder and
      fade the mech when a wall pulls the arm in; the arm's pitch clamped so
      looking up never puts it in the body or the floor; walking framing a
      little higher and wider so the mech and the cards leave the middle clear.
- [x] **R17 Detection (Odyssey)**: white fill → yellow (investigate the LKP,
      sharper senses) → red; grace on first sight; fill by distance, crouch,
      cover, shadow and hiding spots; HUD arcs round the centre pointing at
      each noticing guard; filling icon over the guard; the LKP drawn as a
      ghost of the mech.
- [x] **R18 Alarms**: a red guard shouts (nearby guards join); alarm beacons
      (siren masts) a guard runs to and lights over 3 s, which is what puts
      the whole base on alert and calls reinforcements; kill or blind the
      runner, or sabotage the beacon beforehand (E while unseen); drones and
      searchlights have no shout: they ping the nearest guard.
- [x] **R19 Losing them**: lost sight for 3 s → fire at the LKP, then move up
      and search it in pairs; ~25 s of nothing → back to patrol on "alert
      patrol" (wider cones) and the base meter falls a step; reinforcements
      stop; ladders, cables, the box, hiding spots break pursuit out of sight.
- [x] **R16b Sight is blocked by what blocks it** (#56): no defender sees
      (or lights) the mech through a wall, a prop or any barrier: containers,
      crates, generators and every solid prop block sight like walls; the
      vision cones and drone/searchlight pools are drawn clipped by them.
- [x] **R20 The loud half**: suppressing fire (first 2 s of a guard's fire
      is mostly misses); armour +50% at level I; armour shards from blade and
      close kills in combat; hit markers; boss damage numbers; shield sparks;
      the weapon chips light up the first time the base goes loud; a fire
      button while aiming on touch; scope sensitivity in Options and a slower
      scoped turn.
      Also #60: a sniper round to a guard's body or limbs no longer kills
      outright: three limb hits or two body hits, one to the head; a hit that
      does not kill sends the guard and those near it to search for the
      shooter.
- [x] **R21 Retry and loop**: a retry starts on the perch with no fly-over;
      a checkpoint at the first stripped pile; a defeat keeps the full value
      of stripped piles; the first upgrade level costs 30; new verbs among the
      first upgrades (hook range, a second decoy, quieter sprint); the shoot
      lesson on the perch at a sentry in reach; language on the pause screen.
- [x] **R22 Behaviour**: scope-tag (hold on a unit 2 s: its route drawn as a
      ghost line, its icon through walls) like Ikaros; short patrol loops and
      routines (a pair that chats, then one walks away); guards notice changes
      (a light out, a pile stripped, a box that moved) as yellow; bodies can
      be dragged into shadow or a container and are then not found; guards
      poke a box seen moving; roles: guards flank in pairs, sentries call and
      shoot badly, drones have no gun.
- [x] **R23 New enemies**: the Scrap Hound (follows noises and scent, sniffs
      out bodies and stripped piles, leads guards; it alarms like Odyssey's
      dogs) and the Engineer (walks to whatever is broken to fix it, finds
      what is near it; guards fill vacant posts).
- [x] **R23b The training ground** (#57, #58): a short tutorial level of
      small rooms crossed one after another, each a "show, don't tell" lesson
      with an automated, animated demo shown twice (a button replays it while
      the lesson is unfinished): moving and looking, crouching and cover,
      weapons (switching with the wheel / keys / chips; the scope zooms in
      and out; the launcher's limited rounds and its reload after each shot;
      the minigun's heat), the blade (from behind, sneaking; and close in a
      fight), the decoy, the hide box, the grappling hook over a wall, the
      alarm beacon, and the extraction pad. It is played before the first
      mission (skippable once finished); salvage and the smithy are taught
      in the Command Base with a line of text saying why scrap matters.
- [x] **R24 The Bastion, rebuilt**: a safe perch and a cable that ends on a
      railed ledge with a ladder; a teaching corner (one guard back turned,
      one pile); rings (outer yard → inner ward → keep) with three ways into
      each; mid-height cover every 6–8 m and pools of shadow; hiding thickets
      (camo nets, cable tangles) as Odyssey's bushes; alarm beacons placed;
      every pile its own puzzle; live piles and one patrol per zone rotated
      per run; a boss arena with a cover ring.
      Also #59: no more "a flying island": a convincing setting (cliffs and
      sea of clouds below, distant rock spires, chains and anchors, low-poly
      rounded props); a fortress that cannot be sniped clean from the perch
      (sight lines broken, a third, elevated ward reached first, an early
      grappling point to a high sniping spot); every enemy can shoot the
      mech at long range once it has detected it.
- [x] **R25 Bosses**: prep in stealth (cut the generator: the Warden's shield
      has no power; jam the Foreman's servo on its pad; lure the Goliath under
      its own shell); phases and tells (the Warden drops the shield at 50%,
      draws and dashes with a glint; the Goliath's vents turn to you when it
      overheats); a health bar that tells a blade will not do it.
- [x] **R26 Adaptive base**: the last run's habits answered at the next
      threat level (helmets after many headshots, box checkers after box use,
      a searchlight on the perch's tower after perch snipes), shown on the
      threat card.
- [x] **R27 Kill-cams**: scored by distance, movement and body part; a short
      one or none after two in quick succession; the first landed headshot of
      a player's life always full; a boss's last blow its own slow orbit.
- [x] **R28 Regression**: translations, docs, e2e, clips, perf (quiet
      machine), plan; a second blind playtest if time allows.
R16 done. The follow camera never ends up inside the mech: pressed in by a wall closer than 2.4 m it cranes up (to 1.3 m, as far as the space above allows) and out over the shoulder, and the mech fades to a ghost; the arm's own pitch is capped at 0.2 rad so looking up swings the view, not the camera into the floor; the walking framing is higher and wider; the desktop hint cards stack bottom-left so the middle of the view is clear. Props (the crane, poles) are not in the camera's collision and can still cross the view: noted.
R17 done. Detection after Odyssey: the meter fills in two bands; white (0-0.5) while a guard notices, slow and forgiving (a 0.5 s glance adds nothing at ease; 0.8 s near to 3.8 s at the edge of sight, twice as long crouched, at the cone's edge and slower in shadow), yellow (0.5-1) while it walks to the last known position (0.8-3.2 s), red at 1; within 4 m either band is three times as fast. Out of sight a white meter drains after 0.8 s. The ring of arcs round the centre and the marks over heads go white, yellow, red; a glowing ghost of the mech stands at the last known position while anyone looks for it there. Measured: standing at 11-12 m, yellow after about 2 s and red about 1.4 s later; crouched about twice as long. Shadow is wired (target.shadow) and lands with the R24 level.
R18 done. Alarms after Odyssey's forts: a sure guard shouts and every guard within 16 m joins the fight (a drone or a light has no voice and calls the nearest guard instead, who shouts); the base's meter stops at 90% unless a beacon is lit or the noise is loud. The guard nearest a working beacon who is not the one fighting runs to it (a siren mark over its head, a blinking siren chip on the HUD) and cranks it for 2.5 s (the chip fills); lit, the whole base is on full alert and the reinforcements come. Stop the runner and the beacon goes dark; 3.5 s later another may try. The mech can sabotage a beacon when nobody sees it (E, 1.4 s, a lesson and a chip). Three beacons in the Bastion: the yard, the north ward, the keep's roof. A fortress with no beacons keeps the old rule. Found and fixed while testing: a dead runner could be sent again.
R19 done. Losing them after Odyssey: guards no longer know where the mech is when nobody sees it (full alert used to feed them its true position every 1.5 s); they share the last known position anyone saw, run to it, spread round it and search it for 25 s walking a new point every 6 s, then go back to their rounds warier for the rest of the raid (sight 25% wider, 15% further). A sighting that only got as far as yellow is searched for 8 s (was 3.5). With nobody fighting and nothing seen for 45 s a full alert stands down: lit beacons burn out (and can be lit again), the meter falls to 60% and drains, the music goes quiet. The Goliath also tracks the shared position, not the mech.
R16b done. Sight is blocked by what blocks it: a check of the line-of-sight raycast against a 5 cm march over 2465 random pairs in the Bastion found no leak, so the leaks were elsewhere: a drone's or a searchlight's light counted the mech as lit whenever the lamp high above could see it, even in the shadow of a wall or a crate at the edge of the pool; now the mech must also be in clear line from the pool's centre. Barrels, tyre stacks, pipe stacks and crate stacks were drawn but not in the grid: they are solid props now and block sight (and walking) like the containers.
R20 done. Suppressing fire (2 s of mostly misses after a defender opens up); armour x1.5 at level I; armour shards (3 x 12) from blade or close kills in a fight; boss damage numbers; the wheel fans open with every chip pulsing the first time the base goes loud; a fire button while aiming on touch; a scope sensitivity slider (default 0.8 on top of look sensitivity). Hit markers and shield sparks were already in from round 2. #60: sniper rounds to a guard: head 1, body 2, legs 3 (limb zone below the hips), as shares of its health so the counts hold at every level; a guard that lives sends those within 16 m to search where the round came from. Part of #59: guns reach 45-70 m and sight in a fight 2.5x, so a defender that made the mech can fire on it from far off (few hits at range).
R21 done. A retry starts straight on the perch (no drop-in; in play in under a second). Going down after stripping a pile offers 'From the first pile': the mission restarts with the mech beside its first stripped pile and every pile it had stripped still stripped and counted, their scrap not paid twice. A defeat keeps the full value of stripped piles (+30% of the rest as before). The first level of any track costs 30. New verbs: a fourth Chassis track, Hook reach (+0.6 m ahead, +1.2 m high per level); Servo speed level 1 quiets the sprint (heard at 5.4 m, not 9); Decoy level 1 packs a fourth decoy; the row says so until bought. The shoot lesson comes up on the perch as soon as a defender stands in clear sight within 60 m. The pause screen has the language picker.
R22 done. Scope-tag (Ikaros): hold the scope on a unit for 2 s (a cyan ring fills round the reticle): it is tagged, a cyan diamond over it shows through walls and its round is drawn on the ground. Routines: FortressBuilder.pair(), a pair that stands and chats for 9 s ("..." over their heads, sight 55% as far over 70% of the cone) then one walks its round and comes back; the first yard patrol in the Bastion is one. Guards notice what is out of place as yellow (a stripped pile, a light shot out; a downed drone is now that, not a body), without raising the base. Bodies: E grabs a body within 2.2 m (guards and sentries; not a burst wreck); it drags 1.5 m behind at half pace; anything but walking lets go; let go against a container (a cover block of container height) it is tucked in and never found. A box seen creeping for 0.7 s is walked over to and poked: then the mech is found. Roles: guards closing on a seen mech spread to either side (flanking, 6 m), a sentry calls guards from twice the shout range and shoots badly; drones have no gun (already).
R23 done. The Scrap Hound (new unit kind, the robodog rig at 0.6 in the base's steel with red eyes): sight 15 m over a wide cone, fast, fragile (any round ends it); hears 1.6x as far; follows the mech's scent trail (sampled every 0.5 s, 25 s fresh) toward it; smells bodies and stripped piles within 10 m through walls, marks them found and barks the guards within 16 m over; barks (shouts) when sure, beacons or not; runs in and bites (7, 2.2 m). The Engineer (a guard role: yellow hard hat, tool pack) walks to a sabotaged beacon or a searchlight shot out and fixes it in 4 s (sparks, a ratchet and a ding); a place it cannot walk to it gives up on. When a guard who stood a post is found dead, the nearest free patrol takes the post. Bastion: an Engineer from level II, a hound from level III.
R23b done. The training ground: ten rooms in a row (20 x 24 m, walls out of any hook's reach), one lesson each, a light gate in each doorway that opens when the lesson is done: move and look; crouch behind cover past a sentry; weapons (switch with wheel/keys/chips, the scope zooms in and out with the wheel or a touch chip, a rifle kill, two rockets with the reload between, the minigun to overheat); the blade (from behind, then close in from the side); a decoy to draw a door guard away; the hide box under a searchlight; the hook over a 6 m wall; sabotage a beacon; strip a pile (the one line of text: scrap buys weapon upgrades at the Command Base); the extraction pad. Each room opens with a cyan ghost of the mech doing the lesson, twice, the matching control card pulsing in step; a replay button plays it again until the lesson is done. A drill garrison: being seen sends the mech back to the room's door and the room's dummies to their places, no alarm, nothing loud alerts anything. A fresh player starts there and goes straight on into the Bastion level I; the Base has a Training button; once finished, the pause menu can skip it. The objective marker points at each room's goal. e2e: new-player specs now seed a profile that has done training; a new spec covers a brand-new player landing in training (desktop and portrait phone, no overlaps).
R24 done. The setting (#59): the base stands on a mountain top in a sea of clouds (a rounded rock massif under it, 120 wide cloud puffs, 12 spires, two great chains anchoring it to the nearest spires; a handful of instanced draw calls). The Bastion rebuilt (60 x 64 cells) in three rings, three ways into each: the battery (4 m up, reached first: the perch's cable lands on its railed ledge with a ladder down; a teaching corner, a guard with his back turned and a pile; stairs, a ladder or a drop into a camo net down to the yard), the outer yard (three barracks blocks that break the perch's sight lines, a hook-only watchtower with a cable onto the inner wall, a searchlight, the chatting pair), the inner ward on a 3 m terrace walled to 7 m (main stairs, east postern ladder, hook over the west wall from a thicket), the keep (8 m, stairs, ladder, cable) whose roof is the boss arena with a ring of cover. From the perch under 8% of the inner ward floor and under 60% of the west lane can be seen (tested); the watchtower sees over 20% of the ward. Shadow pools (darker floor, slower to be made out) and thickets (camo nets, cable tangles: crouched in one the mech is not seen beyond 2.6 m; the alert eye dims in shadow and squints shut when hidden). Nine pile spots, each its own puzzle; the teaching pile and the keep's big one always live, the rest and one patrol per zone rotate per raid (seeded by missions done, so a retry is the same raid). Every level x 10 rotations validates.
R25 done. Boss prep in stealth: the keep's roof has the generator that powers the Warden's shield (L IV+): cut it unseen (the act key, a bolt chip, 1.4 s) and the shield is dead glass; the Foreman (L II) can be jammed on its pad while it sleeps: it wakes 2.5x slower, moves and turns at 40%, its joints take 50% more; the Goliath (L III+) lured to shell a decoy at its own feet takes 30% of its health from its own shell. Phases and tells: the Warden at half health drops the shield, draws, and dashes (a white glint and a thin ring for 0.7 s, then 10 m/s for 1.1 s at where the mech stood; a 28 blow if it is still there; every 4.5 s); the Goliath overheats after three shells for 5 s: quiet, steam from its vents, its hull swinging its open vents round to the mech, vents taking double. The boss bar carries a no-blade mark (a blade struck through). Verified in the browser: the generator cut drops the Warden's shield; the boss bar mark.
R26 done. The base learns: each raid counts headshots, times under the box and rifle kills from the perch (within 7 m of the insertion point, at its height), saved with the profile (cm_habits) when the raid ends, won or lost. The next raid answers: 4+ headshots, guards and sentries wear steel helmets (the first round to the head takes the helmet off, in pieces, and counts as a body hit); 3+ box uses, box checkers (a box sitting still in plain view within 9 m gets a 2.5 s look, then a poke); 2+ perch kills, a searchlight on the battery's corner sweeps the perch. The Base's threat card lists what the base has learned, with an icon and a line each.
R27 done. Kill-cams scored: 0.4 x the body part (head 1, body 0.45, limb 0.35, the blade 0.55) + 0.35 x distance (to 50 m) + 0.25 x the target's movement; a full cam's chance is 8% + 75% of the score (a moving headshot at 45 m about 80%, a body shot at 8 m about 25%). After two kills inside 6 s: a short cam (the round joined half-way through its flight, a shorter dip) for a kill scoring 0.6+, else none; never two full cams within 5 s. The first landed headshot of a player's life is always full (remembered in the profile). A boss's last blow, by any weapon, gets its own orbit: 3.6 s, wider, higher, slower, the world at 70% of the usual slow-motion. Verified in the browser: the Warden's last blow orbits.
R28 done. Translations: the 23 strings round 3 added are translated into all 38 locales (four agent drafts, checked for every key and placeholder; 'Command Base' had no existing term in any locale and was coined per language). Docs: README (training ground, setting, detection, dev URLs ?fort=training/bastion, module list), the store copy (431/500 characters; how-to-play and controls for detection, beacons, thickets, bodies, tagging, zoom, boss prep, the learning base), the GDD (detection, training ground, kill-cam rules, chassis verbs, the learning base, the enemy table with Sentry, Engineer, Scrap Hound, Warden). e2e: 9 specs pass (new players seeded past training; a brand-new-player spec). Clips: the recorder opens the Bastion (?fort=bastion) and the first shot takes a vantage; all six landscape cuts record with every beat (success 10/30 s and CrazyGames, fail 10/30 s and CrazyGames). Perf: on the perch 163 draw calls and 113k triangles (138 and 86k before R24; the cloud sea trimmed to 70 puffs of 12x7 and the chain anchors merged); timings inconclusive on a fully loaded machine (old build 20-24 ms, new 25-32 ms work p50 at 4x CPU, overlapping); re-measure on a quiet machine (PERF-LEDGER 'Round 3 check'). The second blind playtest was not run (it drives a visible Chrome on the owner's desktop for a long session): offered.

## Round 4: the owner's list #68–#103 (2026-10-04)

Decision report (every decision, default, source and the owner's answers):
https://claude.ai/artifact/TyS2YjkjhnsccfvR8c2qYy. Answered: Q1 focus ×3;
Q2 instant upgrades, the furnace stays as the post-raid salvage melt; Q3 the
toaster is the free disguise, five more by one rewarded ad each (scrap on
no-ad builds), and the disguise gets its own hologram lesson; Q4 two new
fortresses (Foundry rooms-first, Harbour); Q5 no kill-cam on a boss unless
the killing blow is a headshot; Q6 rewarded ads come in, no ad-blocked dialog
on CrazyGames; Q7 the intro plays once after training. Replaced: G2, G9, G16,
D9/R8, C5, G5, C4, R27's "any kill".

- [x] **R29 Aim and weapon feel** (#80 #81 #84 #77a)
- [x] **R30 Kill-cams** (#85 #91 #77b)
- [x] **R31 Walls and sight** (#79a #69)
- [x] **R32 HUD and keys** (#82 #83 #74)
- [x] **R33 Senses** (#68 #70 #98)
- [x] **R34 The alarm, rebuilt** (#86 #71 #73 #89 #92)
- [x] **R35 Supplies** (#76 #101 #78)
- [x] **R35b People and machines fall apart** (#64, added by the owner)
- [x] **R36 Upgrades and rewarded ads** (#75)
- [x] **R37 Disguises** (#97)
- [x] **R38 Movement** (#95 #102 #94a)
- [x] **R39 Flamethrower** (#99a)
- [x] **R40 New enemies** (#72a #90a)
- [x] **R41 Roofs and a fortress registry** (#96a #93a)
- [x] **R42 Hologram training** (#87 #94b #99b #76b, disguise lesson)
- [x] **R43 The Bastion, revisited** (#88 #96b #78b #94c #72b #90b)
- [x] **R44 The Foundry** (#93 #79b)
- [x] **R45 The Harbour** (#79c)
- [x] **R46 Story and cinematics** (#100 #103 #104, the scripted opening on the first level)
- [x] **R47 Balance and regression** (translations, docs, e2e, clips, perf)

R29 done. #80: the loud weapons no longer swing the camera to a new arm pitch; the follow camera slides forward ALONG ITS OWN LINE OF SIGHT until the mech's head is 3.1 m ahead (less if a wall already pulled the arm in), so whatever was under the crosshair stays under it (a test sweeps six pitches and checks the camera only ever moves along its view). #81: the weapon arm's aim pitch had the wrong sign and ignored the trunk's lean; it now takes the view's pitch net of hips, spine and chest, so the barrel matches the view within 3 deg standing, crouched and walking (rig test over all three weapons); muzzle flashes, trails and rockets start at the weapon's muzzle (traced from the shoulder, so never through a wall). #84: a reload ring round the reticle and a bar under the ammo pips (rifle and launcher), the pips sized from the loadout (up to 11 rockets), and a reload pose (weapon across the chest, the free hand working the breech). #77a: helmets still fly off but no longer save a guard: one rifle round to the head drops any guard or sentry at every threat level (tested I-V with helmets); every sniper shot leaves a bright trail with a white core that hangs about 0.6 s, the kill-cam's round too. Verified: 134 files / 1537 tests, type-check, browser shots of the minigun aimed level/down/up, the rocket reload ring and bar, the sniper trail.

R30 done. #85: a kill-cam needs a quiet raid (no full alert, nobody fighting the mech or hunting it after a fight) and either a rifle headshot on a person or a round in a machine's weak spot (eye, vents, joints, head); lamps, bursts, blasts, blade kills and body shots never get one. A boss gets its orbit only when the killing blow is a headshot (owner, Q5). #91: from the moment the round lands, and through every orbit or dip, the base holds still: nobody thinks, walks or shoots, the base's clock stops, nothing hurts the mech; only the fallen go on falling (stepFallen). Measured in the browser: garrison clock and every living unit's position unchanged across a 1.1 s cam, then resuming. #77b: the round goes on through and out of the far side (a burst along its line 0.42 m past a head, sparks and bolts for a machine, a streak carrying on), and the bullet is seen flying on for 0.3 s of slow time. Verified: 135 files / 1539 tests, type-check, browser.

R31 done. #79 (holes): a cell under a solid prop drew only its floor quad, at the LOWEST neighbour's height and with no sides, so a prop on a ledge's edge (the battery's vent stacks, the keep's barrel) left a 2 m opening, and taller neighbours stopped their face at the prop's invisible raised top. The grid now remembers the floor under a prop (`base`); the mesh draws that floor and its faces down to every lower neighbour, and neighbours face down to it (`shownHeight`). A new closed-walls test checks every height step between neighbours for a covering face, over the training ground, the proving ground and the Bastion at every level and four rotations (it fails on the old mesh). #69: drone and searchlight pools are a draped fan clipped by the same two line tests the simulation uses for being lit; a beam stops at the first thing it meets; drawn guard cones follow the unit's current sight (wary, chatting); a blast does nothing to a unit it cannot see any part of (was 15 % through walls); tall props carry boxes in the grid (crane mast and boom, vent stacks to 4.8 m, lamp posts, antennas, girders, the generator's exhaust) that stop rounds, sight and the camera. Verified: 136 files / 1564 tests, type-check, browser (battery edge closed, a clipped pool).

R32 done. #82: with the mouse captured no chip can be clicked, so on a desktop every mission chip wears the key that works it (a small keycap on its corner, the player's own binding lettered as on their keyboard): help H (new, rebindable action; F1 too), pause P, act E on the blade/sabotage/salvage/drag chips, G on the hook, Tab on the weapon chip and 1-3 on the open wheel, Q decoy, B hide, C crouch. Alt lets go of the mouse without pausing (the cursor is back to click the HUD; a click on the scene captures it again). #83: an in-world prompt over whatever E (or G) would work on right now, in the act key's own order: "[E] Salvage" over a pile in reach, Takedown, Sabotage, Cut power, Jam servo, Grab body / Drop body, "[G] Hook" on the wall top; it fades in and out with reach, the objective marker steps aside for it at a pile, touch shows the word without a key. Found: a child component's root carries the parent's scoped attribute, so a bare `strike` class picked up the HUD's chip rules; kinds are prefixed. #74: riveted steel health bars (bolts at both ends, a fill green to amber to red, notched in tenths; machines in brass) over the nearest eight defenders that are hurt, tagged, fighting or within 25 m and in the camera's line of sight, sized by distance; bosses keep the big bar. Nine new strings (English for now, translated in R47). Verified: 137 files / 1570 tests, type-check, browser (pile prompt, takedown prompt, bars, keycaps).

R33 done. #68 focus: a rifle round that lands within 6 m of a defender (more for a miss into the world, per the silencer track), passes within 3 m of its head, or is fired within 4 m of it puts it on edge for 20 s: it turns to where the base guesses the shot came from, goes to look, and sees 3x as far over a 150 deg cone (owner's x3, answered); nobody fighting is distracted; a miss still raises the meter as before, a one-shot kill does not but its neighbours turn. #70: the base guesses the shooter's spot, off by 22 % of the distance (2-22 m), halved by a second shot from within 15 m and exact from the third; a guard hit and alive, and those it calls, go to the guess, and the shared last known position is set to it (a stale sighting no longer wins); a hunter whose quarry is up high walks to a ground spot that has it in view; combat sight reaches at least 110 m; beyond its aimed range a defender that sees the mech fires volleys out to 120 m (a third of its far-end chance, longer pauses). #98: a body found sends the finder and the two nearest guards within 30 m to search the ground round it for a minute, focused, then back to their rounds; the body cannot start a second search; the second body found puts the base on edge for the raid (sight +10 %, searches end wary). Verified: 138 files / 1577 tests (new senses suite), type-check, browser (a miss beside a guard: suspicious, focused 20 s, looking at the shooter).

R34 done. #73: a drone, searchlight or Enforcer that is sure of the mech opens an uplink: a red ring with a blinking siren fills over 3 s while it keeps the mech in view (under a flyer, on a walker's middle) and drains twice as fast when it does not (a rising chirp; lost, a falling tone); full, the base's alarm sounds without a beacon (full alert, everyone hunts the last known position, the nearest Enforcer wakes first) and guards run to the beacons. #86 / #71: a full alert sends every unit, machines included, to where the base last had the mech, never its live position (with nothing on record, where the noise was); reinforcement waves come only from a lit beacon where the base has beacons, and are told the last known position; a runner may run during an alarm until a beacon is lit. #92: fighters with the mech in view take slots on a ring round it, the first guard to shout holding the front and the rest spread evenly round it, far side included, at their engaging distance; an attention budget lets only 2 (I-II), 3 (III-IV) or 4 (V) fire at once, nearest first (a hound bites apart). #89: the stand-down no longer waits for every unit to leave combat: 60 s with nothing seen by anyone in a fight and the whole base stands down, drones and searchlights swing to the last known position and search, the Goliath gives up after 8 s out of sight and sweeps its turret; the base stays heightened for the raid. The Goliath also rolls up to 12 m in a straight line over level ground to a spot with a clear line on the last known position. Verified: 139 files / 1586 tests (new alarm suite; the drone and wave tests rewritten for the uplink), type-check, browser (a drone's ring filling, the alarm at its end).

R35 done. #76: the rifle carries 15 rounds besides its magazine (reloads come out of it; with nothing left it is dry), the mini-gun a 300-round belt it spends (heat stays), rockets as before; a new Armory track, Ammo racks, adds 5 rounds and 100 belt a level. Every fallen person drops an ammo pouch (+5 rifle, +60 belt) where it lies; ammo crates ("weapon piles") fill the reserve, add 150 belt and a rocket. The strip shows the reserve count and blinks red when the weapon is dry. Pick-ups are walked over (crates too: E was crowded) and only taken when the mech is short of what they give. #101: armor no longer mends by itself; repair kits (a spanner across a screwdriver with bolts, a green cross) mend 40; armour shards are gone. #78: red fuel drums on low pallets with a hazard band and a glowing flame sign; a rifle round, a mini-gun burst or a rocket's blast sets one off: 300 at the centre over 5 m (the mech too, up to 60, if nothing stands between), barrels within 3.6 m follow 0.18 s later, the cell is floor again, and guards within 30 m wonder and come to look (no alarm, no kill-cam). Bastion: 3-5 kits by level, 2 crates, 4 barrels (spread wider in R43). Two instanced draws per kind. Verified: 140 files / 1591 tests (new supplies suite), type-check, browser (kit and crate on the battery, armor 60 -> 100 over a kit, a barrel shot and gone).

R35b done. #64: people already fell as ragdolls by what hit them (62f7020: a rocket flings them, a rifle round drops them where they stood, a takedown lets them slump, mini-gun rounds keep shoving a body); what was missing: a mini-gun kill now takes a person apart 18 % of the time without a camera (it used to need a full kill-cam, and R30 keeps those for stealth headshots), and machines tear into metal (#64's "chunks of metal"): the wreckage is a hard-edged block scaled per piece into bent plates, snapped rods and chunks of housing, thrown 40 % harder, with a shower of sparks; plates lie flat. Verified: 140 files / 1591 tests, type-check, browser (an Enforcer torn apart, the pieces at rest).

R36 done. #75: upgrades and weapon tiers are bought outright (the anvil, the quench and every wait are gone; an old save's job in the fire is granted on load and the field cleared). The furnace stays as the salvage minigame (owner, Q2): after a raid the rewards screen offers "Melt the haul": keep the heat in the band and the stars add 0/10/25 % of the haul's scrap (optional; Continue keeps the haul). Rebalance: piles pay a quarter less, the first level of a track costs 60 (was 30), growth 1.75 (was 1.6); the balance sim now maxes every track in 39 careful raids (bounds 30-90, was 14-70) and 50 loud ones. The rifle's fortune wheel opens in the Armory once rifle damage is maxed: a spin costs 80 x 1.3^wins scrap, wins with max(8 %, 90 % x 0.82^wins) + 5 % a miss in a row, adds 6 % x 0.85^wins rifle damage with no ceiling (shown), a miss refunds 40 %, four misses in a row make the next spin a sure win; a Data Core buys a sure win. Rewarded ads (owner, Q6): one module lists every placement (wheel: a sure win once per base visit, three a session; disguise next), offers a video only on builds with real videos, when one is ready, within the rate limit and after a session's first 3 minutes, and grants only on completion; builds without videos show the Data Core price instead, never a free grant. The ad-blocked dialog now exists (not on CrazyGames, whose SDK owns that UI) and releases the game's pause when closed. A video glyph marks the rewarded button. The test that banned rewarded ads now checks every placement goes through the list. e2e spec rewritten for melt, instant upgrade and instant tier (run in R47). Verified: 140 files / 1583 tests (wheel, melt, forge, migration tests), type-check, browser (the wheel spun and won).

R37 done. #97: B now brings down a disguise, and the toaster (chrome, glowing slots, toast popping out, a lever, two eyes in the grille) is everyone's. Five more, built from the kit's rounded solids: the sneaky crate (the old hide box), a jack-in-the-box clown, a wooden trojan horse on wheels, a leafy bush, a teddy bear with a bow. Each unlocks for good with one rewarded video where one can play (placement `disguise` in the one list) or 400 scrap, and is worn from the Chassis Bay, whose tiles carry a picture of each drawn once with the game's renderer (the workshop panel covers the pad, where the hovered one also stands over the mech). Looks only: every disguise keeps the box's rules. Saved in a new field (`cm_cosmetics`), the toaster always owned. The hologram lesson for the disguise lands with the training rework (R42); the hide chip already shows its key (R32). Verified: 141 files / 1596 tests (owning, wearing, model sizes), type-check, browser (the six tiles with their pictures).

R38 done. #95: a jump on Space (rebindable; a touch chip with an up glyph): take-off 7.3 m/s for a 1.1 m hop, back down in about 0.6 s, a 2 m gap cleared from a run where walking falls in; a jump into a ledge up to 1.4 m above the feet is caught and climbed (only a jump: a fall does not catch ledges); it stands the mech up and throws a disguise off; heard within 6 m. #102: the hook can be thrown where the mech looks: a wall face or a top within 18 m, higher than a mantle and within the line's reach, with ground at the top; the mech is pulled across to the face as it rises (the reel takes the whole line), climbs over, and a recall drops it back where it threw from; at the foot of a wall G still climbs straight up; the "[G] Hook" prompt sits on the wall top it would take. #94 (first half): the rope gun on T (a chip with a coil glyph and the ropes left): from a spot at least 2 m above the ground beside it, at a standable spot within 40 m no higher than the mech, with a clear line a body's height over it; the rope is drawn and walked at once like any cable; 3 a raid, the hook track adds one at levels 2 and 4; guards who see it treat it as a thing out of place. More fixed cables in the levels and the hologram lesson come in R42/R43. Verified: 142 files / 1604 tests (new movement suite), type-check, browser (jump, rope offered and laid from the battery, hook offered on a wall top and climbing).

R39 done. #99 (first half): the flamethrower is a tool, offered by its in-world prompt ("[X] Burn", before the drag's) over any body or wreck within 2.4 m (not a searchlight on its mast): X or the flame chip plays a 2 s jet from the mech's hand (the fire shader that sat unused, plus flames licking up off the body), then the body is ash (a person) or slag (a machine; its scattered pieces melt away too) and nobody will ever find it. While it burns, the fire is a thing out of place for any guard who sees it (it goes once the fire is out, unless it was noticed). Walking away stops it, the fuel spent. 4 burns a raid; an ammo crate gives 2 back. The training lesson after the first kill comes in R42. Verified: 142 files / 1604 tests, type-check, browser (a guard's body offered, burnt, hidden; the fuel 4 -> 3).

R40 done. #72 (the defenders): Roombas, a knee-high disc robot with a gun on its back, its domed red eye the weak spot (a sniper round in it ends one, in the shell it takes two; a round from above finds the dome; the shell's top is a target too). The Peashooter has an SMG (5-round bursts of light rounds, wild from far), the Buckshot a shotgun (24 a blast up close, nothing much past a few metres; it closes to 5 m). They see low (eye 0.55 m), go up on the uplink like other machines and come apart in pieces. #90 (the defenders): a shield guard (a riot shield carried lower than the Warden's: rounds from in front stop on it, the head shows over it, a blast that reaches it knocks it away; the Warden's stays strapped on); a grenadier (every 7 s, with a last known position within 25 m, a grenade lands there: a red ring for 2 s, the mech's moment to leave it, then a 3.5 m bang); a marksman on a tower (sight x1.6 a sentry's, outside the fire budget, a red laser draws on the mech for 1.8 s before each 45-damage round). All in the model bench and on the dev proving ground; their places in the fortresses come with R43-R45. Verified: 143 files / 1613 tests (new enemies suite), type-check, browser (model bench for the Roombas and the guard kits, the proving ground with all five, the marksman's laser shown while it aims).

R41 done. The roof layer (#96, #93): a cell may carry a roof slab (underside at least 4 m over the floor, 0.4 m thick; a hole is a cell without one). Bodies walk under it; a body on or just over it stands on it, so the mech walks a roof and drops through a skylight; a jump under one stops at the slab. The slabs are ray boxes too, so rounds, guards' eyes, drones' light pools and the camera stop at them, and a drone sees through a skylight only. Under a roof the hook and the rope gun are not offered (no sky to throw into). The mesh draws a deck, a dark underside and a hazard-striped edge only above what stands beside it; wall spikes are left off over a roof. Validation checks the room under every slab. The dev proving ground has a roofed shed with a skylight. New guard: a coplanar-overlap test over the whole fortress mesh (the roofed test hall, training, proving, the Bastion at every threat level): no two opaque faces overlap in one plane. The registry (#93 #79): a tiny list of fortresses (id, look, what unlocks it) whose builders load on demand, one chunk each (and left out of the obfuscator, like every dynamic import); `flow.fortress` picks the one to raid; a look per fortress (`data/themes.ts`: the mesh palette and the sky with its haze), the Bastion keeping the dusk. The picker in the base and the names come with the second fortress (R44). Verified: 144 files / 1627 tests (new roofs suite), type-check, browser (the shed from outside, under its roof with the skylight overhead, standing on it; the Bastion booting through the registry).

R42 done. #87: every training lesson is shown by a hologram of the mech (a new material: translucent cyan, bright at the silhouette, rising scanlines, a sweep band, a flicker; additive and depthless, so it reads as light and not a body to shoot) starting from a glowing projector disc by the room's way in. It loops, with a short pause, until the lesson is done, then dissolves; the replay button plays it from the start at any time. The control glyph pulses with each moment, as before. Props in the same light: the rope it shoots, the body it burns and the flame, the disguise it wears. New rooms (14 now): the jump (a ladder up a deck, a gap one jump wide, a second deck, a drop; walking off lands in a pit with ladders back up; checked with the real player physics that a walking jump clears it and a walk falls in), supplies after the weapons room (an ammo crate and a kit; done by picking one up, or at the door when nothing is wanted, so it can never shut the mech in), the flamethrower after the blade room (#99: a guard facing the wall, done when what is left of it is burnt; the room tops the fuel up), the rope gun after the hook room (#94: a ladder up a tower and a platform a rope reaches; done on a rope shot; the room tops the ropes up). The box room's hologram wears the toaster (#97: the disguise's lesson, with its key). New hints jump, rope, burn, supply in the coach and its glyph cards. Verified: 144 files / 1630 tests (training suite extended: the loop, the new rooms' conditions, the jump crossing, the rope reach), type-check, browser (the jump, flame, toaster and rope holograms mid-demo; the 14-pip row fits a 320 px portrait phone).

R43 done. #88: the Bastion's island grows from 60 x 64 to 72 x 76 cells (a new builder step moves everything built so far in by 6 cells and lays a rounded-square island round it, so the corners get room too): open ground runs 12 m out from every side of the curtain, with cover, nets and tangles, rubble, a ditch line in shadow along the west and north, two breaches in the curtain low enough to pull up through, and a ring a mech can walk all the way round without going in (tested by a flood fill that never steps inside). #96: from threat II roofs with skylights cover the inner ward's arcade, the yard's beacon shed, the west lane and a south-east shed walled on the sides the perch looks in from; the perch now sees under 40 % of the objectives at every level from II (tested; what it still sees is the teaching pile and the keep's roof, by design). #78: 7 barrels (3 more, in the ring and the yard). #94: two more fixed cables (the south-east tower to the barracks, the north-west tower to the west barracks). #76/#101: a kit and a crate out in the ring. #72/#90 placed: from II a Peashooter under the arcade and a grenadier down the east lane; from III the Buckshot in the yard shed, a shield guard at the main gate and a marksman on the watchtower; from IV a second grenadier and shield guard; at V a Roomba in the west-lane shed. #72 (tanks): the Goliath shells nothing nearer than 10 m (a mech on the wall over it is out of its reach) and rolls back to a spot with room and a clear line; only a shell called onto a decoy can come down on itself. It keeps the north tank park, which with those two rules no longer has the wall-top trick; a new park location was not needed. Verified: 145 files / 1639 tests (new Bastion suite; the old-frame sight tests moved by the pad), type-check, every threat level validated, browser at threat III (the ring outside the west wall, under the arcade with its Roomba, the south-east shed).

R44 done. #93: the Foundry, built rooms first: seven rooms cut out of one block of works 25 m tall (no hook ever tops it, even fully upgraded from the core's floor), at three floor heights (the landing bay, the smelting hall, the catwalk hangar and the furnace pit at 0; the server vault and the crane hub at 4; the salvage core at 8), each with its own floor, hero props and cover; then joined by roofed halls with a bend or two, three roofed stair tunnels (guards walk between floors) and two ladder ways (the hub's shaft into the core, the pit's ledge). Every room has two ways in or more, the two hubs three (tested by counting openings and ladders), and no sight line runs from any room into another (tested between nine points in every pair of rooms; the first build had one straight hall, hangar to pit, now a dog-leg). The Foreman holds the core and its big pile at every level; the Roombas are at home (Peashooters from I, the Buckshot from II), with grenadiers, shield guards, a marksman on the hangar's catwalk, drones in the courtyards and the hound by level. A yard round the block (the builder's grow step) with the way in on the west and out on the south-east. Its own look (#79): soot-dark plate and rust, furnace-orange trims, an ember sky. The base's deploy panel gets a fortress picker (names translated in R47): the Foundry opens once the Bastion has fallen at threat III, with its own five threat levels and records (progress is now kept per fortress; the campaign score adds every fortress). Dev URL `?fort=foundry`. Verified: 146 files / 1647 tests (new Foundry suite, the Foundry in the coplanar guard), type-check, every threat level validated, browser (the bay, the smelting hall with its garrison, the core and its Foreman; the picker locked and open with a seeded save).

R45 done. #79: the Harbour, the third fortress, open once the Foundry has fallen at threat III: a dockyard on the island's north edge at dusk. Two piers run out over the open sky; a cargo ship hangs moored beside each, four cells of open sky from its pier (a channel, not a crevice to seal), boarded by a plank and a ladder or the hook; ship B's bridge (9 m, two ladders up) is the Warden's arena with the big pile. Two dock cranes on the quay are perches (a ladder up) with a cable from each jib onto a ship. Container rows one and two high make alleys; two warehouses are walled and roofed, a skylight and two doors each; a harbour wall with one gate closes the yard; the perch stands in the approach with a cable onto the west warehouse. Defenders by level, as in the other two (the quay walk, the piers, the ships' decks, the warehouses, the alleys' Roombas; from II drones, a grenadier, a shield guard, an enforcer at the gate, the Buckshot, the Engineer; from III a marksman on crane B, the Goliath on the open quay, the hound). Its own look: weathered teal steel and painted containers under an amber dusk over a teal sea of cloud. In the picker. Verified: 147 files / 1655 tests (new Harbour suite, the Harbour in the coplanar guard; the perch sees under 40 % of its objectives), type-check, every threat level validated, browser (the quay, pier B and ship B with the crane's cable).

R46 done. #100: story.md (the world, who is who, the arc over the three fortresses, every scene beat by beat, the cues). Five wordless scenes in the engine, each a small stage in a fortress's look with the game's own rigs as the cast and a timeline that is a pure function of its clock: the intro (35 s: the board over the cloud sea, the hook up a cliff, a rope across a gap, a decoy pulling two guards, a sniper headshot, the mini-gun downing a drone, a rocket into a Goliath, the perch), the Bastion falling (the Warden escapes by airship toward the Foundry's smoke), the Foundry going cold (furnaces die, the last hull craned onto the Warden's cargo ship), and the outro (40 s: the flagship sinks into the cloud, scrap rains, the board flies the mech home to the Command Base). A scene is a mode pushed over whatever is up (the mission or the base waits under it untouched) under a new phase, `cinema`, which closes the gameplay bracket and hides the HUD by itself. Three new synthesised cues (hero theme, tension, warm finale; leads low-passed at 7 kHz), each scene putting the music back after itself. Every scene has a visible skip button, and Space held for half a second skips (a ring fills; a press alone does not, Space being the jump). They play once (the intro after the training ground; the falls at the first clear of threat III; the outro at the Harbour's first clear of threat V) and the base's deploy panel lists the ones seen, to watch again. #103: the haul (10 s) after the first clear of Bastion I and of II, before the rewards: the mech strips the wrecked walkers and the burst tank, the haul flies into the dog's board, which lifts off home. #104: the very first Bastion raid sets the mech down on the battery behind the teaching guard, a crate beside the landing; the mission then sneaks it up crouched, takes the guard from behind, raises the rifle and drops a guard standing on the west barracks' roof where the cable lands (with its bullet-cam), and hands over; a press after the first second hands over at once. The e2e harness's saves mark the scenes and the opening seen (the specs drive, not watch). Verified: 148 files / 1667 tests (new story suite: which clear earns which scene, the lengths, the half-second hold, every scene built and run to its end and stopped by a skip, the opening's layout and its shot's line of sight), type-check, browser (the intro, the Foundry's and the outro's frames from the base's replay chips, skip by holding Space; the opening run start to end: sneak, takedown, shot, control).

R47 done. Translations: the 19 strings of rounds R38-R46 (the jump, rope and flame keys, the fortress names and picker, the story's scene titles) in all 38 locales (four agent drafts, every key and placeholder checked, parity green). Balance: a later fortress pays more scrap level for level (Foundry x1.35, Harbour x1.7; tested). Docs: README (round 4 in the intro, dev URLs for every fortress and the model bench, story.md linked), the GDD (training rooms and holograms, the new tools and supplies, upgrades and disguises, three fortresses, the five new defenders and the Foreman, the story scenes), the store copy (424/500 characters; controls for the jump, rope gun, flamethrower, disguise, lessons). The e2e run found two real regressions, both fixed: the press that skips the drop-in (Space) also queued a jump since R38, so a crouch pressed right after landed in the air and the scoped headshot from the perch missed (a press that skips a scripted shot is now spent on the skip); and the deploy panel grew past the rank badge on a phone in landscape (the fortress picker now shows once a second fortress is open, and the story's chips sit beside the training button). Perf: sizes recorded in PERF-LEDGER.md (round 4 check); no timing A/B. Not done: the store clips were not re-recorded for the new content. Verified: 148 files / 1668 tests, type-check, the e2e suite 9/9, a production build.

### Round 4 deferred

(nothing cut yet)

## Round 5: the owner's list #142–#151, then #36 (2026-10-06)

Decision report (every decision, default, source and the owner's answers):
https://claude.ai/artifact/LXCSqcXtAB4JQRxMGfEnrs. Answered: Q2 the Airship
also flies over the Harbour at threat III; Q3 full stock every mission; Q5 both
readings, plus mech and machine wrecks burn down for a few bolts, and shield
guards burn too. Added by the owner: #150 (Mega Droid's WASTED / LEVEL CLEARED
banners) and #151 (shield guard tactics). Q1 and Q4 take their defaults (a 4th
fortress; the outro after the first Spire III clear).

- [x] **R48 Ammo budget** (#143): factory 10 rifle / 100 belt / 2 rockets,
  smaller upgrade steps and pickups, crates scale with threat, balance test
- [x] **R49 Unit frame HUD and banners** (#145 #150): portrait + HP + ammo +
  alert top-left, quest log on the right, low vs. out ammo cues taught in
  training; Mega Droid's red WASTED and blue LEVEL CLEARED banners
- [x] **R50 Rocket lesson** (#146): armoured (blast-only) rule, pit room,
  respawn refill, hologram rocket
- [x] **R51 Asset quality and batching** (#147): guard rebuilt, mech detail
  layer, decor pass, decor per area, piles and beacons batched, coplanar test
  over every builder
- [x] **R52 Animation and fire** (#148): stride by speed + planted feet, guard
  run / kneel / interact / burn / throw / reload, mech weight, kneel-activate,
  flamethrower brace; wrecks of mechs and machines burn down for a few bolts
- [x] **R53 Shield guard tactics** (#151): shield up while approaching, leads
  the squad and covers guards behind it, peeks to fire only after 5 s without
  being hit; burnable
- [x] **R54 The Airship** (#142): model, loop, belly light, turrets, flying
  enemy rockets, socket-synced fire, engine pods, crash; Spire II/III and
  Harbour III
- [ ] **R55 The Spire** (#144): 4th fortress, terraced tower, Watchtower lamp,
  Airship at II/III, story (outro after the first Spire III clear)
- [ ] **R56 Map fly-over** (#149): orbit shots of every map, fixes,
  integrity test over roofs / props / cables / skirt / scenery
- [ ] **R57 Regression**: translations, docs, e2e, balance
- [ ] **R58 Startup loading** (#36): measured A/B only

### Round 5 notes

- R51 audit (model bench, one distance, against the dropship): the guard was
  the one clearly below the bar and was rebuilt; CM-07 got the fine layer;
  the fortress props got baked outlines; the Enforcer, Goliath, drone, robo
  dog, beacon and supplies sit at the bar and were left as they are.
- R51 draw calls, Bastion from the perch: 213 before, 171 after (a chunk's
  lights fold into its lit mesh; props and their outlines are two calls).
  Triangles 224k → 271k (the props' outlines). Salvage piles (3 calls each)
  and units (3 each) stay: a pile hides on its own, a rig moves on its own.

- R52: foot slip measured over a whole cycle (`footPlant.test.ts`): a
  patrol's planted foot slid ~50 % of the ground covered, now under 10 %;
  CM-07's ~40 %, now under 15 %. The robo dog already had spine flex and a
  steady head (cca3424); nothing added.

- R53: a dead shield guard's body was already burnable where it lay (its
  place follows the ragdoll); what was missing was burning him alive, which
  R52's live burn now does, shield or not.

### Round 5 deferred

- R52 (N2): a guard's grenade-throw and reload poses (the sim has no reload,
  and the grenadier's throw has no beat to hang a pose on yet).

- Stacked indoor floors (grid holds one height per cell); the Spire is terraced.
- A painted CM-07 portrait; the rendered one comes first.
- H7 (the low and out cues taught in training) lands with R50's rocket room:
  firing its two rockets runs the launcher low, then out.

## Resume notes

- Dev server: `pnpm dev` (port 2196). Check the served `<title>` ("Chaos Machine") before
  trusting a browser test; other games' servers run on this machine.
- Every finite parallel job goes through
  `node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- <command>`.
- Browser checks run on a private headless Chrome (own `--user-data-dir`, own
  port); stop the server and the browser after each check.
- Layout checks: 320×658 portrait and 764×385 landscape, touch UA.
- Scratch tools of the build sessions (not in the repo): a browser probe that
  boots the app at three viewports and reports state and console errors, a
  locale merge script (`drafts.json` → all 39 files, with `--prune`), and
  patch scripts. New locale keys go to English first; an agent drafts the
  other 38 as JSON keyed by dotted path, and the merge script applies them.
- Tests that read source must not use regexes with nested quantifiers over
  whole files (one hung the suite); parse the SASS block by indentation.
- Round 3: a NEW profile opens in the training ground, not the Bastion. Probes,
  the perf script and the clip recorder pass `?fort=bastion` or seed a save
  with `cm_seen: ['training']` (the e2e harness's `NEW_AFTER_TRAINING`; a spec
  that wants a brand-new player opens with `brandNew: true`).
- The Bastion takes `(level, run, answers)`: `run` (missions done) rotates the
  live piles and one patrol per zone; `answers` (`sim/adapt.ts`, from the last
  raid's habits) adds helmets, box checkers, the perch light. A retry keeps the
  same `run`, so a checkpoint's pile ids stay valid.
- A probe that `import()`s a source module after an edit while the dev server
  runs gets a second module instance (HMR): restart the server first.
- Headless sim time runs slower than wall time under load: probes wait on
  state, not on fixed sleeps.
