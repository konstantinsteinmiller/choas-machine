# Art: what is drawn in code now, and what to replace

Chaos Machine ships with **no painted art in the game itself** (the store covers are painted, see "Store art"). Every model, texture, icon and
effect is built in code (flat-shaded low poly in lilac, pink and cyan, with a
toon outline), so the game is complete without a single image file. This list
is what an artist would replace, most visible first, and how each replacement
is dropped in.

Look reference: `game-and-feel-reference.jpg` (cute, low poly, neon synthwave).
Palette: `src/game/models/palette.ts` (models) and `src/assets/css/tokens.sass`
(UI). Keep to it, or change it there: nothing else hard-codes a colour.

## How a replacement gets in

| What | Drop a file at | Notes |
|---|---|---|
| Ground / wall detail | `public/images/textures/floor.webp`, `wall.webp` | Read at build time; tiled over the fortress. Greyscale detail works best: the colour comes from the vertex paint. 512 × 512. |
| A UI icon | edit its path in `src/components/icons/iconPaths.ts` | 24 × 24 viewBox, one colour (`currentColor`), solid shapes. Rules for a glyph that survives 16 px: the `game-ui-icon-set` skill's `GLYPH-AUTHORING.md`. |
| App icon, favicon | `public/icons/icon.svg`, then `node scripts/render-icons.mjs` | Renders the PNG sizes and the favicon. |
| Logo lockup (loader, splash) | `node scripts/render-logo.mjs` | The lockup is generated; edit the generator, not `index.html`. |
| Painted detail maps | `pnpm art:prompts --references`, paint, `pnpm slice-sheets` | The manifest is `src/game/art/artSheet.ts`: it names each drop-in and owns its prompt. `pnpm art:desk` runs the whole loop from one page (copy the prompt, drop the return, it slices and compresses). The slicer refuses a return that is not square and parks a painting whose reference was redrawn since. |
| Covers and store art | `pnpm art:promotion` | See "Store art" below. |
| Seeing a painting against the drawing | `?art=off` on any URL | Plays without the drop-ins. Open two tabs. |
| Images after any change | `pnpm compress-folder public/images` | Keeps originals in `public-backup/`. |

3D models are code (`src/game/models/*.ts`, one skinned mesh per character,
built from boxes, capsules and spheres by `kit.ts`). Replacing one with a
modelled asset means a glTF loader the game does not have: see "Larger steps".

## Characters (priority 1: on screen all the time)

| Model | File | Now | Wanted |
|---|---|---|---|
| The mech (player) | `models/mech.ts` | ~40 primitives: lilac armour, dark suit, pink visor, cyan core line, antenna; sniper, minigun, launcher and blade on the arms | Keep the silhouette (big head, round shoulders). Add panel lines, a readable backpack, a distinct stance per weapon. |
| Guard | `models/garrison.ts` `buildGuard` | Teal uniform, helmet, big head, rifle | A second helmet shape for sentries so they read as "the one that watches". |
| Commander | same, `commander: true` | Red coat, peaked cap | Epaulettes, a cape or a baton: he is the target and should be findable at 70 m. |
| Surveillance drone | `buildDrone` | Grey pod, red eye, four rotors | Fine as is; a lens flare on the eye would help. |
| Enforcer mech | `buildEnforcer` | Steel body, visor slit, glowing yellow joints (the weak points) | Heavier legs, visible gun barrels; keep the joints glowing. |
| Goliath Tank | `buildGoliath` | Hull, track pods, turret, cannon, glowing rear vents (the weak point) | Track links, bow armour plates; the vents must stay the brightest thing on it. |
| Dropship | `models/dropship.ts` | Wedge hull, two engine pods, tail fins | Cockpit glass, landing lights, a winch for the grapple line. |

## The fortress (priority 2)

| Piece | File | Now | Wanted |
|---|---|---|---|
| Ground, walls, towers, keep, stairs | `world/fortressMesh.ts` | Flat-shaded blocks, checker ground, neon trim on wall tops | Detail textures (see the drop-in above), crenellations, doors in the gates. |
| Cover blocks | same | Blue 1.8 m cubes | Crates, barriers, sandbags: three variants. |
| Ladders, cables | same | Cyan beams | Rungs and a cable with sag. |
| Props | `world/decor.ts` | Lamp, antenna, barrel, flag | Vehicles, generators, searchlights, tents. |
| Sky | `world/sky.ts` | Gradient dome, haze, far islands, flat clouds | A sun or moon, stars, a few distant ships. |
| Command Base | `scenes/commandBase.ts` | A hex service pad and the dropship | A hangar: gantry, tool racks, a holomap table. |

## Effects (priority 3)

All in `fx/combatFx.ts`, one particle draw call: muzzle flashes, tracers,
impacts, explosions, rocket trails, the decoy hologram, the kill-cam's bullet
and its x-ray plate (a canvas-drawn skull). Vision cones, searchlights and the
"?" / "!" marks are in `sim/garrisonView.ts`.

Wanted: a sprite sheet for the explosion and for the muzzle flash, a proper
hologram shader (scanlines) for the decoy, a painted x-ray plate.

## Interface (priority 4)

60 glyphs in one set, one font (AngryBirds; other scripts fall back to system
faces, see `assets/css/fonts.sass`). The HUD is CSS: glass panels, neon edges.

Wanted: an illustrated medal for Ghost, Marksman and Swift (they are glyphs
now), a painted backdrop for the rewards screen.

## Store art

`pnpm art:promotion` makes every cover a portal asks for (`roadmap.md` #1).
The manifest is `src/game/art/promotionSheet.ts`; the results are in
`src/assets/promotion/`.

How a cover is made:

1. **A plate**: a screenshot of the game's own models, staged for a scenario
   and framed at one aspect, with the whole interface hidden
   (`pnpm art:promotion --plates`).
2. **A painting** of that plate, through the Art Desk's Gemini window, from a
   prompt that forbids text, logo and interface and keeps the top-left and
   lower-right corners calm. `game-and-feel-reference.jpg` goes along as the
   look.
3. **The cuts**: every size, each from a painting of its OWN aspect (seven
   families: 1:1, 16:9, 9:16, 2:3, 16:10, 4:3, 3:2), with and without the
   logo. The logo is laid over afterwards, bottom right (bottom centre on the
   portrait shapes), never top left, where a portal puts its own badge.

Four scenarios were painted once each as a square tile and compared at
250 px, the size a portal's grid shows them at
(`art-sheets/promotion/COMPARE-1x1.jpg`, plate beside painting):

| Scenario | What it shows | At 250 px |
|---|---|---|
| **ambush** (ships) | The mech behind a guard, blade raised; the guard has just noticed | Two large faces, one of them a readable human expression; the blade is the single brightest thing. Reads in one glance. |
| scope | The mech's visor in close-up over a rifle, the Commander reflected in it | One huge face, and "sniper" is unmistakable. The reflected target is small. A close second. |
| chaos | The mech charging with the minigun, guards flying, a tower exploding | Says "action", but the mech is mid-sized and the frame is busy. |
| goliath | The mech in front of the tank | Too many small figures; the size gap the scenario is about got lost. |

The choice follows what the portals and store guides say decides a click: one
clear foreground subject, a character close-up with an expression, strong
contrast at the focal point, and a picture of what the game actually is
(Poki's thumbnail guide; Steam capsule guides). It is a judgement against that
list, **not a measured click-through rate**: nothing here has been shown to
players. Every painting beat its own unpainted plate on every point. When a
portal offers an A/B test, run `ambush` against `scope`
(`pnpm art:promotion --scenarios scope` paints its other aspects; set
`COVER_PICK` to switch what ships).

Still wanted: a human pass over the logo cuts (the lockup is the game's own
pixel wordmark; a painted wordmark would sit better on painted art), and
gameplay screenshots for the portals that ask for them
(`pnpm preview:video --only-setup` gives clean frames).

## Larger steps

- **Modelled characters (glTF).** Would need `GLTFLoader`, a rig-mapping layer
  for the pose functions, and a budget: each rig is 3 draw calls today.
- **Baked lighting.** The fortress is lit by one toon ramp. Light maps would
  need UVs the mesh builder does not make.
