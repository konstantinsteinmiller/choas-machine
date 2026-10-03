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

Boot at 4× CPU: loader mounted at 1.0 s, level built at 2.2 to 3.0 s,
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

## Open

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
6. **Boot.** The 440 to 740 ms task is the engine chunk being evaluated.
   Splitting three.js from the audio synth (they share a chunk today) would
   let the loader paint between the two.
7. **No phone has been measured.** Everything above is a desktop GPU with a
   throttled CPU. The inherited `ios-legacy` flag (iOS opens at low scenery
   and 1.5× resolution) has never been tested on an iPhone.
