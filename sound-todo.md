# Sound: what plays now, and how to replace it

Everything in the game is synthesised in code today (`src/game/audio/synth.ts`
for effects, `src/game/audio/songs.ts` for music). Nothing is downloaded. Each
entry below can be replaced by a recorded file without touching code:

- an effect: drop `public/audio/sfx/<name>.ogg` (or `.mp3`, `.wav`)
- a song or a jingle: drop `public/audio/music/<name>.ogg`

The file name is the **name** column. The list of files is read at build time,
so a file that is not there is never requested. Effects are played at about
half their file level (`FILE_GAIN` in `synth.ts`); master them to −3 dBFS peak.

Where the sounds are triggered: `src/game/audio/gameSounds.ts` (one module maps
game events to sounds).

## Music

| name | where | what it is now | what a recording should be |
|---|---|---|---|
| `stealth` | the mission until the base goes loud | "Night Watch": 76 BPM, A minor, pad + sub pulse + muted arpeggio + bell, no drums, 101 s loop | low synth pads, heartbeat-like pulse, 90–120 s, must loop cleanly |
| `chaos` | the mission on full alert | "Overload": 140 BPM, D minor, driving kit and brass, 55 s loop | heavy synthwave or drum-and-bass, 60–90 s loop, starts on a hit |
| `base` | the Mobile Command Base | "Neon Drift": 100 BPM, A minor synthwave, 58 s loop | mid-tempo synthwave, relaxed, 60–120 s loop |
| `victory` | the rewards screen | a seven-note rising fanfare | 2–3 s sting |
| `defeat` | the defeat screen | a four-note falling phrase | 2–3 s sting |

Measured levels of the synthesised songs (offline render, loud half of the
song): stealth −23 dB, base −19.9 dB, chaos −19.5 dB. A recording should land
within 2 dB of these, with stealth the quietest.

## The mech

| name | when |
|---|---|
| `step` | every footfall (quiet: only the player hears the mech) |
| `land` | landing from a drop; louder from higher |
| `crouch` | crouching |
| `climb` | taking a ladder or mantling a ledge |
| `cable` | stepping onto a cable |
| `hurt` | a hit on the armor |
| `armorLow` | a hit that leaves under 30 % armor |
| `down` | the mech is destroyed |

## Weapons

| name | when |
|---|---|
| `sniper` | the silenced rifle fires: a thump and the air parting, not a crack |
| `bolt` | the bolt worked after each sniper round (starts 0.2 s after the shot) |
| `reload`, `reloadDone` | a reload starts, finishes |
| `scopeIn`, `scopeOut` | the scope comes up, goes down |
| `dry` | (reserved) the trigger pulled on an empty weapon |
| `minigun` | one minigun round (15 a second; keep it under 60 ms) |
| `overheat` | the minigun locks from heat |
| `rocket` | a rocket leaves the tube |
| `explode` | a rocket or a shell goes off |
| `weapon` | another weapon is drawn |
| `bladeOut` | the blade extends because a guard is in reach |
| `blade` | the blade strikes |
| `decoy`, `decoyOut` | a decoy lights up, (reserved) goes out |

The minigun's spinning motor is not a file: it is one synthesised voice whose
pitch follows the barrels (`minigunHum` in `synth.ts`).

## What a round does

| name | when |
|---|---|
| `hit` | a round lands on a body or a joint |
| `headshot` | a sniper headshot kill: the one the player waits for |
| `tink` | a round on armor plate |
| `ricochet` | (reserved) a miss off a wall |
| `kill` | a guard goes down |
| `wreck` | a drone, an Enforcer or the Goliath is destroyed |

## The base

| name | when |
|---|---|
| `suspicious` | a defender starts to wonder |
| `spotted` | a defender is sure it has seen the mech |
| `body` | a body is found |
| `alertUp`, `alertDown` | the alert meter gains or loses a segment |
| `alarm` | full alert |
| `enemyShot` | a round fired at the mech |
| `whizz` | that round missed |
| `wake` | an Enforcer or the Goliath powers up |
| `wave` | reinforcements arrive |
| `telegraph` | the Goliath has marked where its shell will land (four rising beeps over 1 s) |
| `shell` | (reserved) the Goliath's shell landing; `explode` is used today |

## Mission beats and interface

| name | when |
|---|---|
| `dropIn` | the drop from the dropship |
| `objective` | the target is down and the extraction opens |
| `extract` | the grapple line takes the mech up |
| `killcam` | a kill-cam starts (time slowing) |
| `lesson` | a control lesson's pip fills |
| `medal` | a medal lights on the rewards screen |
| `buy` | an upgrade bought |
| `forgeStart`, `forgeDone` | a Forge build started, collected |
| `denied` | (reserved) an action refused |
| `uiClick`, `uiOpen`, `uiClose`, `uiConfirm` | buttons and modals |

## Not done yet

- Positional audio: effects are not panned or muffled by where their source is
  (the synth supports both: `sfx(name, pan, gain, muffle)`).
- Voice: the GDD has none; guards are silent apart from their sting sounds.
