# preview-video: Chaos Machine's clips, generated rather than filmed

```bash
pnpm preview:video                       # every format, both scenarios
pnpm preview:video --formats crazygames  # one deliverable
pnpm preview:video --only-setup          # stop on the opening frame (a screenshot)
pnpm preview:video --help
```

Output, one folder per quality. **`high/` is what gets uploaded.**

```
preview-videos/high/success-10s-portrait-720x1280.mp4   (+ .png poster)
preview-videos/high/fail-30s-landscape-1920x1080.mp4
preview-videos/high/success-crazygames-portrait-1080x1620.mp4
preview-videos/high/success-poki-square-1080x1080.mp4
preview-videos/lossless/…    the archive (4:4:4: Safari and portal validators refuse it)
preview-videos/balanced/…    the portal cuts again at CRF 20, for a size or bitrate cap
```

`preview-videos/` is not committed: the clips are build artifacts.

## What is recorded

| Format | Length | Shapes | Scenario modules |
|---|---|---|---|
| `10s` | 10 s, 30 fps | 720×1280, 1280×720 | `success`, `fail` |
| `30s` | 30 s, 30 fps | 1080×1920, 1920×1080 | `success-30s`, `fail-30s` |
| `crazygames` | 16 s | 1920×1080, 1080×1620 (2:3) | `success-30s`, `fail-30s` (their short cut) |
| `poki` | 5 s, 60 fps | 1080×1080 | `success`, `fail` |

The stories:

- **success** (10 s): a scoped headshot with the kill-cam, the blade from
  behind, the Commander. Poki's 5 s cut is the first shot alone.
- **success-30s**: the whole mission in miniature: shot, blade, decoy and
  rocket, the minigun once the alarm goes, the Commander, the grapple out.
- **fail** (10 s): a step out of cover too early, the alarm, down.
- **fail-30s**: a clean blade kill first ("ahead"), then the same mistake and a
  long losing firefight.

The clips are a clean feed: the recorder hides everything in the page except
the scene's canvas. What the game draws INTO the scene (vision cones, the "?"
and "!" marks over a defender's head, the beacon) stays: it is how the stealth
reads without a HUD. Those two marks are the only glyphs in a clip; there is no
flag to hide them yet, should a portal's spec forbid them.

## How the game is driven

`src/game/preview.ts` publishes `window.__preview` on a dev server under
`?preview=1` (never in a production build). `scenarios/_drive.mjs` wraps it:

| Helper | What it does |
|---|---|
| `boot(ctx)` | waits for the game and skips the drop-in |
| `freeze` / `roll` | holds the game still at the end of `setup()`, lets it go at frame 0 |
| `place`, `behind`, `vantage` | puts the mech somewhere: at a point, behind a defender, or anywhere with a clear line to a defender's head |
| `aimAt`, `pan` | turns the camera over a given time; `aimAt` keeps tracking the head |
| `snipe` | one scoped shot with the kill-cam; waits for the scope, retries a miss |
| `fight` | holds the trigger on whoever is nearest in sight, optionally keeping the armor at a set share so the verdict falls where the beat sheet wants it |
| `hands.*` | what thumbs and buttons do: move, crouch, aim, fire, weapon, decoy, act |
| `logState` | one line per beat into the log: kills, alert, armor, phase |

The seam decides no outcome. A round goes through the real hit-scan and a
guard notices through its real cone; the scenario only chooses where the mech
stands, what it aims at and how much armor it has left.

**After every render, read the log lines**, not only the frames: "the target is
down … objective extract" is the success clip's verdict, "phase dead" the fail
clip's. A balance change can move either past the end of the clip.

## Rules of the house

- The recorder starts its own dev server on port **2197** with its own
  dependency cache, checks the served `<title>`, and stops it afterwards.
  `pnpm dev` (2196) is never touched.
- The recording page gets a pretend pointer lock, so a headless Chrome never
  takes the real mouse.
- The threat level is each scenario's own URL parameter (`urlParams: { level }`).
- Draft at a quarter of the pixels before a full render:
  `pnpm preview:video --formats 30s --scenarios success --orientations landscape --fps 15 --landscape 640x360 --dpr 1 --quality balanced --keep-frames`
- Run a full render through the worker budget:
  `node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- node tools/preview-video/record.mjs`

## The cinematic trailer (#X1)

```bash
pnpm cinematic-trailer                 # record every shot at 1080p, cut, score, mix (~1 h)
pnpm cinematic-trailer --draft         # 960x540 at 15 fps: a few minutes, for the edit
pnpm cinematic-trailer --skip-record   # re-cut, re-card, re-mix from the shots already recorded
pnpm cinematic-trailer --shots a,b     # re-record only these shots, then cut
```

Out: `preview-videos/trailer/chaos-machine-cinematic-trailer.mp4`, about a
minute, 1920x1080 at 30 fps, H.264 High 4:2:0 with AAC stereo at YouTube's
loudness (−14 LUFS). `-draft` beside it for a draft.

- **The shots** are one scenario each (`scenarios/trailer-<id>.mjs`, the
  library in `scenarios/_trailerShots.mjs`, the shared staging in
  `_trailer.mjs`), recorded in the `trailer` format: 7 s takes with handles,
  their own page, fortress and threat level. That format is `explicit`: a
  plain `pnpm preview:video` never records it.
- **The edit** is `trailer/edit.mjs`: which part of each take, in what order,
  the title cards, CM-07's lines and the score, all as data.
- **The sound is the game's.** Every shot logs the sounds the game played in
  it on the take's own clock (`window.__preview.sfxLog`); `trailer/audio.ts`
  replays them through the game's own synthesizers and mixer on an
  OfflineAudioContext (`engine.forceAudioContext`), with CM-07's recorded
  lines (the music ducks under them, as in play) and the game's own songs
  (`tension` → `chaos` at the alarm → `hero` for the finale).
- **The enemies play themselves.** A shot chooses where the mech stands, where
  the director's camera is (`shot`, `dolly`, `ride`) and what the hands do;
  the curious "?", the alarmed "!", the walk to a noise or a decoy, the run on
  the alarm are the garrison's own. Pins hold a defender only until the take
  starts (a posted guard is the exception, and lets go at the blade). God mode
  keeps a take from ending early; the Warden's health is shortened so one
  round shows his kill-cam.
- **Review without a player:** a contact sheet per shot,
  `ffmpeg -i <take>.mp4 -vf "select='not(mod(n\,13))',scale=360:-1,tile=8x1" -frames:v 1 sheet.png`.
