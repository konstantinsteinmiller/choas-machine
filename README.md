# Chaos Machine

A casual stealth-action / sniper game for the web. A small mech infiltrates a
neon fortress: snipe guards and drones from a perch, strike with the energy
blade from behind, lure patrols with holographic decoys, and go loud with
minigun and rockets when the base goes on full alert. Strip the salvage the
raid is for, reach the pad, and a jet-powered robo dog flies the mech out; back
home the salvage is forged into upgrades in a three-step smithy. A wordless
training ground comes first; the fortress stands on a mountain top in a sea of
clouds, its guards detect like Odyssey's fort guards (white, yellow, red; a
shout, a runner, a beacon), and it learns the player's habits from raid to raid.

- Design: [GDD.md](GDD.md)
- Plan and resume point: [game-implementation-plan.md](game-implementation-plan.md)
- Store copy: [description.md](description.md)
- What is still placeholder: [art-todo.md](art-todo.md), [sound-todo.md](sound-todo.md)
- What comes next: [roadmap.md](roadmap.md)

Vue 3 + Vite + TypeScript, pug templates, Tailwind CSS + SASS, three.js.
No game engine and no art files: every model, texture, sound and song is
generated in code, and each can be replaced by a file (see "Replacing art and
sound").

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:2196  (tab title "Chaos Machine")
pnpm test           # unit tests (vitest)
pnpm test:e2e       # the real game in a headless Chrome: boot, play, save, reload
pnpm type-check
```

Dev-only URLs:

| URL | What it does |
|---|---|
| `?level=3` | start at threat level III (1 to 5) |
| `?fort=proving` | the kit's test layout instead of the Bastion |
| `?fort=training` / `?fort=bastion` | the training ground / the Bastion, whatever the profile |
| `?view=az,el,dist` | a fixed inspection camera |
| `?art=off` | play without painted drop-ins (works in any build) |
| `?preview=1` | publish `window.__preview`, the seam the video recorder and the cover-art tool drive the game through |
| `localStorage.cheat = 'true'` | dev cheats on Ctrl+Shift+Alt: `B` +1000 scrap, `O` objective done |

Headless browsers started by any script here never take the real mouse: the
game's pointer lock is replaced by a stand-in inside the page.

## How the game is put together

```
src/game/engine/     the loop (fixed step + render), input, renderer, slicer
src/game/world/      the height grid, fortress mesh, sky, procedural textures
src/game/models/     the mech, the garrison, the robo dog, the hide box: meshes from code
src/game/sim/        the rules, with no renderer and no DOM in them:
                       perception, alert, garrison AI, weapons, hit-scan,
                       damage, melee, rockets, armor, kill-cam, cinematics,
                       rewards, coach (the wordless lessons), training
                       (the training ground's lessons), adapt (what the
                       base learns between raids)
src/game/sim/mission.ts   the one place that wires input, sim, view and HUD
src/game/data/       the fortresses (bastion.ts, training.ts) and the upgrade tracks
src/game/state/      hud.ts (what the HUD reads) and progress.ts (the save)
src/game/flow.ts     which scene is on: mission, Command Base, results
src/game/audio/      synthesised effects and code-composed music
src/components/      F-components (the UI kit), HUD, base screens, modals
src/platforms/       portal builds: SDK adapters, pause/mute/language signals
src/utils/save/      SaveManager: one `cmachine_state` object, local or cloud
src/i18n/locales/    39 locales; English is the source
worker/              the leaderboard's Cloudflare Worker (not deployed)
```

Rules the code keeps:

- **One save object.** Everything a player owns is in `cmachine_state`
  (localStorage, or the portal's cloud save). `tests/save/` and the e2e suite
  check that a reload brings all of it back.
- **Simulation without a screen.** The modules in `sim/` run in Node, which is
  where their tests run.
- **Every visible string goes through i18n**, in all 39 locales
  (`tests/i18nParity.test.ts`).
- **Sizes are relative** (`clamp`, `vmin`, `rem`), nothing is scaled with a
  transform, touch targets are at least 40 px, and safe-area insets are
  respected. Checked at 320×658, 764×385, tablet and desktop.

## Build for a portal

```bash
pnpm build:crazy-web     pnpm build:poki        pnpm build:playgama
pnpm build:gamepix       pnpm build:gamemonetize pnpm build:yandex
pnpm build:itch          pnpm build:glitch      pnpm build:wavedash
```

Portal ids and tokens live in the `.env.<portal>` files and are **empty until
the game is registered** on that portal. Release checks:

```bash
pnpm qa:portal --platform gamepix      # mute, pause and ad signals on a built bundle
pnpm qa:xbrowser                       # Chrome, Edge, Firefox, WebKit to the results screen
pnpm deploy:poki --gates-only          # Poki's release gates on the built bundle, offline
pnpm deploy:poki                       # the upload: refuses until a game id is set
node scripts/boot-timeline.mjs         # boot marks and long tasks, CPU throttled
pnpm perf:mission                      # frame times over real play, CPU throttled   (PERF-LEDGER.md)
```

The leaderboard ships as a baked, modelled board (`data/leaderboard-seed.json`).
The live Worker in `worker/` is written and tested but not deployed: see
`worker/SETUP.md` and the plan's notes.

## Replacing art and sound

Everything is procedural until a file says otherwise. A file dropped at the
right path takes over at the next build; a missing file is never requested.

| What | Where | How |
|---|---|---|
| Floor and wall detail | `public/images/textures/floor.webp`, `wall.webp` | `pnpm art:prompts --references`, paint, `pnpm slice-sheets` (or all of it from `pnpm art:desk`) |
| A sound effect | `public/audio/sfx/<name>.ogg` | names in [sound-todo.md](sound-todo.md) |
| A music track | `public/audio/music/<track>.ogg` | `base`, `stealth`, `chaos` |
| A UI icon | `src/components/icons/iconPaths.ts` | one path, 24×24, `currentColor` |
| The logo | `node scripts/render-logo.mjs` | generated; edit the generator |
| After adding images | `pnpm compress-folder public/images` | originals kept in `public-backup/` |

## Store assets

```bash
pnpm art:promotion --plates --scenarios all   # shoot the cover plates from the game
pnpm art:promotion                            # paint what is missing, cut every size, compress
pnpm preview:video                            # every gameplay clip (see tools/preview-video/README.md)
```

- Covers land in `src/assets/promotion/`: every size the portals ask for, with
  and without the logo. Four scenarios are defined in
  `src/game/art/promotionSheet.ts`; `COVER_PICK` names the one that ships.
- Clips land in `preview-videos/` (not committed).

## Running heavy jobs on this machine

Test suites, builds, recorders and headless browsers go through the worker
budget, which queues a job while the machine is busy:

```bash
node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- pnpm test
```
