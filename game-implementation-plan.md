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
- [ ] **R10 Lessons** (#33): wordless teaching for everything, old and new.
- [ ] **R11 Regression**: e2e, clips, perf, documents.

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
