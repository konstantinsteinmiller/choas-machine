# Performance ledger

What was measured, what was changed because of it, and what is still open.
An optimisation without a row here is a guess; a guess that did not measure
better gets reverted.

## How it is measured

All on the **built** bundle, headless Chrome with a real GPU (ANGLE d3d11),
CPU throttled 4× over CDP, the game played by an in-page driver.

```bash
npx vite build --outDir dist
node scripts/boot-timeline.mjs --dist dist --throttle 4            # boot marks, long tasks
node scripts/boot-timeline.mjs --dist dist --throttle 4 --returning   # a returning player (boots into the Base)
node scripts/boot-timeline.mjs --dist dist --throttle 4 --returning --deploy   # then the deploy's swap
node scripts/boot-timeline.mjs --dist dist --query perf=<flag>       # an A/B arm
node scripts/perf-mission.mjs --dist dist --throttle 4             # the loud phase
node scripts/perf-mission.mjs --dist dist --throttle 4 --stealth   # the quiet phase
node scripts/perf-mission.mjs --arms base,<flag> --reps 3          # A/B, interleaved
npx vite build --outDir dist-prof --minify false
node scripts/perf-mission.mjs --dist dist-prof --profile           # where the CPU goes
```

An A/B arm is a `?perf=<flag>` from `src/use/perfVariants.ts`: `base` is the
shipping path, the flag restores the old one. Arms are interleaved, each in a
fresh browser, and compared on medians.

**How far to trust these numbers.** This machine was shared with other
sessions' test runs and builds while they were taken. Run-to-run spread in the
loud phase is large (work p95 between 21 and 130 ms for the same build),
because the driver's play differs with it: how soon the alarm goes, how long
the mech lives. The stealth phase is steady (±10 %). A loud-phase result is
only called a win below when it held in every interleaved pair, or by a wide
margin.

## Where it stands (2026-10-02, 1280×720, 4× CPU)

| | work p50 | work p95 | frame interval p50 | step | draw | long tasks |
|---|---|---|---|---|---|---|
| Stealth, on the perch (15 s) | 9 to 11 ms | 12 to 15 ms | 16.7 ms | 1 ms | 10 to 13 ms | 0 |
| Loud, full alert (20 s) | 13 to 14 ms | 21 to 100 ms | 33 ms | 3 to 13 ms | 14 to 16 ms | 9 to 55 |

Boot at 4× CPU (2026-10-02; for #36 see entries 4 and 5): loader mounted at 1.0 s, level built at 2.2 to 3.0 s,
playable after 3.9 to 4.6 s; the bar's longest standstill 0.5 to 1.1 s; longest
task 440 to 740 ms (evaluating the engine chunk, before the loader's own
slicing can help).

The quiet phase holds 60 fps under a 4× throttle. The loud phase holds 30 with
a tail: see "Open".

## Entries

### 1. The objective marker forced a layout every frame — kept

`ObjectiveMarker.vue` read its host's `clientWidth` / `clientHeight` inside
its HUD ticker, right after the other tickers had written their styles: a
forced synchronous layout per frame. The profile put **8.5 %** of the
throttled CPU in that one closure. Now the size is read when it changes
(ResizeObserver), and the arrow's opacity is written only when it flips.

A/B, loud phase, 3 interleaved pairs, flag `marker-legacy`:

| | work p50 | work p95 |
|---|---|---|
| base | 17.6 / 25.6 / 23.3 | 129 / 133 / 127 |
| marker-legacy | 25.9 / 23.0 / 26.4 | 166 / 185 / 132 |

p95 better in all three pairs (median 129 vs 166 ms, −22 %); p50 within the
noise. In the profile the closure fell from 8.5 % to 0.7 %.

### 2. One material on an instanced and a plain mesh — kept

The sky's far islands (an `InstancedMesh`) shared the level's toon material
with ordinary meshes. Each time the two alternated in the draw list the
renderer re-derived the material's program: nothing recompiled, but
`getParameters` + `getProgram` + `getProgramCacheKey` ran per draw, **5 %**
of the stealth phase. The islands now have a material of their own
(`toonVCInstanced`); the outline material's cache is keyed by skinned / not
for the same reason.

A/B, stealth phase, 4 interleaved pairs, flag `islands-shared`:

| | work p50 |
|---|---|
| base | 11.0 / 11.9 / 8.5 / 9.3 |
| islands-shared | 13.0 / 12.2 / 9.3 / 9.8 |

Better in all four pairs, 2 to 15 %, median 7 %. In the profile the three
functions fell from 5.4 % to 2.0 %: something else still alternates (Open).

### 3. Rapid-fire sounds are voiced at most once per gap — kept, weakly

Every play of a sound builds a handful of audio nodes; in a minigun fight the
profile showed about 5 % in `createBiquadFilter`, `createGain`,
`createOscillator`, `connect`. `sfx()` now drops a repeat of the same
rapid-fire sound inside a short gap (50 to 80 ms: hits, ricochets, enemy
shots, whizzes, steps; the minigun's own gap equals its rate of fire, so it
loses nothing today and is bounded if an upgrade ever raises it).

A/B, loud phase, 3 interleaved pairs, flag `sfx-unlimited`:

| | work p95 | long tasks |
|---|---|---|
| base | 100 / 25 / 21 | 42 / 55 / 9 |
| sfx-unlimited | 100 / 92 / 99 | 61 / 44 / 65 |

Two pairs much better, one equal. The spread between base runs is as large as
the effect, so this is "probably a win", not a measured one. Kept because the
change is small, has a test (`tests/game/sfxGaps.test.ts`), and cannot be
heard at these gaps on paper. **Nobody has listened to it**: if a burst sounds
thin, raise nothing, remove the entry for that sound.

### 4. Audio sleeps until the first scene is on screen — kept (#36)

The boot built the first scene and, halfway, set the intro phase; the sounds
watcher answered with the drop-in whoosh, and that first sound opened the
audio device (50 to 270 ms of main thread at 4× CPU) and started the music's
synthesis, all inside the loader's critical window. With autoplay granted
(portal iframes, a trusted returning visitor; Playwright too) the whoosh was
heard behind the loader. Now the boot holds the audio graph from the moment
`boot.ts` is evaluated until the first scene is adopted: a sound asked for
meanwhile is dropped, the music waits, and the drop-in is queued and plays
when the scene shows. The voice files moved out of the boot too: fetched
after it, and only the player's language (8 files, was 16, every language).

A/B on the built bundle (`boot-timeline.mjs`, 4× CPU, a fresh and a returning
player, 5 interleaved pairs each, flag `boot-audio-legacy`), time to
`boot:adopted`:

| | fresh | returning |
|---|---|---|
| base | 1634 / 4197 / 4412 / 2402 / 3747 | 1638 / 3167 / 3475 / 2249 / 3094 |
| boot-audio-legacy | 2047 / 5067 / 6008 / 6229 / 4130 | 2036 / 4737 / 4641 / 2491 / 4271 |

Faster in all ten pairs. The machine was loaded (other sessions' jobs), so
the spread is wide; the two quiet pairs (the first) gained about 400 ms each,
−20 %. Tests: `tests/audio/bootAudioHold.test.ts`.

### 5. Each first scene's code in its own chunk — reverted (null)

The idea: a returning player boots into the Command Base, so the mission's
code (simulation, garrison, level builders: 245 KB) need not be evaluated
before they can play, and a new player's boot need not evaluate the Base.
`boot.ts` loaded each lazily, the save picked which one first, the other was
fetched after play started, both stayed `modulepreload`ed.

A/B on the built bundle, 5 interleaved pairs each, flag `boot-chunks-legacy`,
time to `boot:adopted`:

| | fresh | returning |
|---|---|---|
| base (split) | 2974 / 1428 / 1859 / 2150 / 1924 | 2781 / 1932 / 2601 / 2259 / 1935 |
| boot-chunks-legacy | 3141 / 1449 / 2338 / 1874 / 2081 | 1464 / 2578 / 1889 / 2317 / 1860 |

No win: the returning player, the case it was for, was slower in 3 of 5
pairs (median +16 %, inside the spread). A quiet-machine profile explains
it: evaluating the whole boot chunk costs about 70 ms, so there was little to
save, and the lazy import put a fetch-and-evaluate step on the critical path
instead. Reverted to the static imports.

Found on the way, and kept: the obfuscator's string-array rewrite mangled
the new `import('./scenes/commandBase')`, and the built bundle requested
`/assets/scenes/commandBase` (404) and never finished booting a returning
player. Its pick is random (the mission's import survived the same build), so
a build can pass by luck. `useGameplayLifecycle.ts` had the same latent
problem on an obfuscated Playgama build and is excluded now;
`tests/tools/obfuscatorExcludes.test.ts` fails for any source file with a
live `import('…')` that is not on the exclude list.

### 6. One reverb hall per song setting, built ahead — kept (moves the cost)

A song's reverb is a ConvolverNode, and giving it its 2.6 to 3.4 s stereo
impulse prepares the convolution on the main thread: in the profile of a
deploy, 416 ms inside one song's lazy reverb, of which 138 ms was computing
the impulse (already cached) and the rest the node's own setup. Every song
built a new node on its first note, so every music change paid it again: the
deploy (Base to stealth), and the alarm (stealth to the loud song), a freeze
at the moment the fight starts. Now one hall per context and reverb setting
is built once and shared; a song feeds it through its own `wet` gain, which
fades with the song. The loud song's hall is built 1.2 s into the drop-in,
while the player watches.

A/B on the dev server (deploy from the Base, the drop-in, then the alarm's
`chaos` event), 4× CPU, 5 interleaved pairs, flag `reverb-per-song`:

| | deploy until ready | long tasks in the drop-in | long tasks in the 2 s after the alarm | longest after the alarm |
|---|---|---|---|---|
| base | 2122 ms | 1258 ms | 550 ms | 196 ms |
| reverb-per-song | 2053 ms | 608 ms | 1018 ms | 381 ms |

The alarm's long tasks halved in all five pairs (and in 9 of 10 over two
earlier runs). The deploy is unchanged. The cost is moved, not removed: the
drop-in, where the player has no control, now carries it. A first cut built
both halls under the deploy's loading veil, and the deploy got 800 ms slower
in five of five pairs: rejected for that. A song played again later in a
session (Base and raid alternate) now costs nothing at all. Tests:
`tests/audio/halls.test.ts`.

### 7. The hidden warmed up after the scene is up — reverted (null, round 5, #36)

The boot's precompile shows every hidden object (holograms, effects, props
kept for their moment) and draws one full frame of everything before the
loader goes. Tried: warm only what the first scene shows under the loader,
and the hidden rest after it is up (compiled a material at a time, first-drawn
in groups of six into an 8×8 offscreen target). Built bundle, 4× CPU, 4
interleaved pairs per first scene, flag `warm-all-legacy`:

| | precompile (built → primed), median | |
|---|---|---|
| fresh: everything / visible only | 2.32 s / 2.24 s | B 1 of 4 pairs faster |
| returning: everything / visible only | 2.82 s / 3.09 s | B slower |

No win: the hidden objects are not where the precompile's time goes (it is
the visible scene's programs and their first draw), and B added long tasks
after the scene showed. Reverted, flag deleted.

### 8. Geometry written straight into typed arrays — kept (round 5, #36)

A CPU profile of the boot (dev server, 4× CPU) put 1.16 s of a 4.7 s boot in
`Float32BufferAttribute` and `Uint16BufferAttribute` constructors: plain JS
number arrays converted at the end. Three's `mergeGeometries` gathers the
merged index in a plain array (0.31 s, every rig and every batched prop),
and the fortress mesh's quad lists were plain arrays (0.27 s). Now
`kit.merge` writes the common case (indexed, same plain attributes) straight
into typed arrays and falls back to three's merge for anything else; the quad
lists grow typed arrays; `rbox` copies one cached unit sphere per segment
count instead of building three's `SphereGeometry` each time; and `modelTop`
(which skins every vertex of a rig to find its top) is worked out once per
kind and kit. Test: `tests/game/mergeTyped.test.ts` (same geometry as
three's merge).

Built bundles, the commit before against this one, 4× CPU, 5 interleaved
pairs per first scene, medians:

| | build (build-start → built) | adopted | playable |
|---|---|---|---|
| fresh (training): before / after | 3.08 s / 2.11 s | 8.53 s / 6.66 s | 11.05 s / 9.59 s |
| returning (the Base): before / after | 2.51 s / 1.85 s | 7.38 s / 6.47 s | 8.59 s / 8.02 s |

The build is a quarter to a third shorter; `adopted` was earlier in 4 of 5
pairs in each scene (the fifth a tie or the machine's noise: it was busy, and
every number here is slower than the round 3 baseline). The precompile
(3.1-3.9 s) is untouched and is now the largest piece: see Open.

### 9. Every device draws at its own pixel ratio (up to 3×) — shipped by rule, cost not yet measured on a phone

The owner's rule: never draw below the display's own pixel ratio. The cap was
1 on weak devices, 1.5 on iPhones, 1.6 on other touch screens and 2 on
desktop: a 3× phone drew 1170 device px wide at 0.53 of them and the browser
stretched it up (blur probe: backing-store ratio 0.67 at the 390×844 portrait,
SOFT, 0.13). Now `dprCap()` is 3 for everyone (`dpr1` stays an opt-in arm).
After: ratio 1.00 at 1280×720@1, 320×658@3 and 764×385@3; the phone image
SHARP (0.44 portrait, 0.37 at 320 wide), desktop SHARP (0.26).

The cost: a 3× phone fills (3 ÷ 1.6)² ≈ 3.5× the pixels it did, an iPhone
4×. What a weak device still gives up is scenery and MSAA (`quality.ts`,
`deviceProfile.ts`), never resolution. Not measurable here: headless
SwiftShader on a desktop says nothing about a phone's fill rate. Open: measure
frame time on a real mid-range Android and an iPhone; if it costs frames,
trim with the scenery tier, never with the cap.

Harness note: on the DEV server a 3× portrait run reloaded the page now and
then (navigation type `reload`, nothing in the game reloads): the Vite
client's socket starving under a heavy software-rendered frame. The same runs
on a production build (`vite preview`) never reloaded (5 of 5).

## Round 2 check (2026-10-03): inconclusive

Measured after round 2 (salvage, robo dog, smithy, UI material, hide box,
bosses) with `perf-mission.mjs --stealth --throttle 4 --seconds 15`, the
current build and the last pre-round-2 build (4cfc61e) alternating on the
same machine. The machine was under load from other work: the OLD build
measured work p50 27 to 29 ms (it was 9 to 11 ms when this ledger was
written), the current one 19 to 37 ms. The two overlap inside that noise, so
this says neither "regressed" nor "fine". Re-measure on a quiet machine before
release; if the quiet phase is slower, the first suspects are the scrapyard
decor's triangles (R6) and the per-pile groups (R7).

## Round 3 check (2026-10-03): counts measured, timings inconclusive

Round 3 rebuilt the Bastion bigger (60 × 64 cells, was 52 × 56), put it on a
mountain in a sea of clouds (a massif, spires, two chains), added thickets,
rails, helmets, the training ground's ghost and gates, the hound and more
props. What can be counted without a quiet machine, from the perch at
1280 × 720, `drawcount` probe over the dev build:

| | draw calls | triangles | meshes in the scene |
|---|---|---|---|
| before round 3's level work (cc2c98e) | 138 | 85.8 k | 154 |
| first cut of R24 | 165 | 121.8 k | 183 |
| after trimming the cloud sea (70 puffs of 12 × 7, was 120 of 16 × 9) and merging the chain anchors | 163 | 112.9 k | 180 |

The rest of the rise is the level itself: 32 % more cells (more fortress
chunks), the thickets and the new props. Timings, interleaved stealth pairs
at 4× CPU (`perf-mission.mjs --stealth`), with another session's job holding
half the machine: the OLD build 20 to 24 ms work p50, the new one 25 to 32;
one pair each way, the spread as wide as the difference. Re-measure on a
quiet machine before release; the suspects in order are the triangle count
(fortress chunks, cloud puffs), the extra draw calls (Open 4), and the
garrison step (scent trail, rigs, chat checks: 3 to 8 ms in the loaded runs,
1 to 2 before).

## Round 4 check (2026-10-04): sizes only

No timing A/B this round. What the build says: the engine chunk (`boot`)
is 386 kB (149 kB gzip), the app shell 244 kB (94 kB gzip). New code that
a raid does not need loads on demand in its own chunk: each fortress's
builder (Bastion 8 kB, Foundry 6 kB, Harbour 5 kB) behind the fortress
registry, and the story's scenes (16 kB) behind the boot's cinema factory;
both loaders are excluded from the obfuscator like every dynamic import.
Watch: the Bastion grew by a 6-cell ring (60 x 64 to 72 x 76 cells, 1.43x
the cells to mesh) and gained roofs (each slab run is a ray box); the Foundry
is a 64 x 64 grid that is mostly one tall block. Neither was profiled.

## Open

- (Round 5) The shader precompile is now the largest piece of the boot,
  3.1-3.9 s at 4× CPU, with its longest task (1.7-2.8 s on the Base) in the
  one full frame drawn to finish every program. Entry 7 showed the hidden
  objects are not the cost; the visible scene's program count is the lever
  (fewer material variants, shared programs).

1. **The loud phase's tail.** Work p95 reaches 100 ms at 4× CPU, with tens of
   long tasks in 20 s, and the self-time profile does not name a culprit:
   31 % is "(program)" (native: GC, audio, GPU driver). Next step is a trace
   of the long tasks themselves (CDP Tracing, not sampling), looking first at
   garbage from the combat effects and at the first use of each effect's
   shader.
2. **A second material still alternates** between two kinds of mesh (2 % in
   `getProgram` and friends). Candidates: one material over geometries with
   RGB and with RGBA vertex colours.
3. **Bone textures.** `texSubImage2D` is 1.5 %: one upload per skinned rig per
   frame. Rigs out of sight could skip their pose.
4. **Draw calls.** About 163 calls and 113 k triangles from the perch (round 3; 124 and 71 k before round 2). Not a
   limit on this GPU; it will be on a phone's. Merging the fortress's static
   pieces per area and culling by area is the known recipe.
5. **Vision cones** cost 91 ray-casts per defender per frame. They did not
   show in the profile (under 1 %), so they were left alone.
6. **Boot.** Re-measured for #36 (entries 4 and 5): on a quiet machine,
   evaluating the engine chunk is no longer a long task (about 70 ms at 4×
   CPU); the 440 to 740 ms tasks seen before were contention. What is left
   in the boot is the level build and the shader precompile, both sliced.
   The deploy into the Bastion still has 400 to 700 ms tasks under its veil:
   the decor (434 ms in one profile) and the garrison's rigs (283 ms) are
   built in a stretch the slicer does not split. The bar freezes there.
7. **No phone has been measured.** Everything above is a desktop GPU with a
   throttled CPU. The inherited `ios-legacy` flag (iOS opens at low scenery
   and 1.5× resolution) has never been tested on an iPhone.
