/**
 * ─── The cinematic trailer's edit (#X1) ──────────────────────────────────────
 *
 * The cut, as data: which shot, which part of its take, in what order; the
 * title cards; CM-07's lines; the score. `build.mjs` reads it. Times inside a
 * cut are seconds from the cut's own start; `from` is seconds into the shot's
 * 7 s take (`scenarios/_trailerShots.mjs`).
 *
 *   cuts    { shot, from, len, flash }   flash: the cut comes in out of white
 *   cards   { cut, at, dur, text, sub, tone }   a title card over the picture
 *   voice   { cut, at, line, whisper }   CM-07 (`public/audio/voice/en/hero_<line>_<loud|whisper>.ogg`)
 *   music   { song, from: { cut, at }, to: { cut, at } | 'end', step, fadeIn, fadeOut }
 *   end     the closing card: the key art, held, and the call to action
 *
 * The story, for a 10-15 year old: a fortress, an army, one small mech.
 * Quiet first (the blade, the decoy, the dive kill from the rope, the
 * sniper's round), then a guard sees it and the alarm goes: the minigun, a
 * barrel, the hound, a rocket into a squad, fire; up the wall, over the cable, the
 * Warden; the salvage, and out on the robo dog's board.
 */
export const EDIT = {
  fps: 30,
  width: 1920,
  height: 1080,

  cuts: [
    // ── Act 1: the fortress ──
    { shot: 'drop', from: 0.0, len: 2.6 },
    { shot: 'yard', from: 0.5, len: 3.0 },
    // ── Act 2: quiet ──
    { shot: 'takedown', from: 0.5, len: 3.0, flash: true },
    { shot: 'decoy', from: 0.3, len: 3.3 },
    { shot: 'assassinate', from: 0.5, len: 2.9 },
    { shot: 'snipe', from: 0.3, len: 4.2 },
    { shot: 'noise', from: 0.3, len: 2.7 },
    // The round ridden into the drone's red eye, and the drone coming apart (#139).
    { shot: 'drone', from: 0.3, len: 4.4 },
    // ── Act 3: loud ──
    { shot: 'spotted', from: 0.3, len: 2.8, flash: true },
    { shot: 'chase', from: 0.2, len: 2.5 },
    { shot: 'minigun', from: 0.3, len: 3.4, flash: true },
    { shot: 'barrels', from: 0.5, len: 2.3 },
    { shot: 'hound', from: 0.1, len: 1.7 },
    { shot: 'rocket', from: 0.3, len: 3.2 },
    { shot: 'flamer', from: 0.2, len: 2.4 },
    // ── Act 4: up, over, the boss, out ──
    { shot: 'grapple', from: 0.2, len: 2.0, flash: true },
    { shot: 'rope', from: 0.2, len: 2.0 },
    { shot: 'warden', from: 0.0, len: 3.8 },
    { shot: 'loot', from: 0.2, len: 2.1 },
    { shot: 'extract', from: 0.2, len: 4.0 }
  ],

  cards: [
    { cut: 'drop', at: 0.3, dur: 2.2, text: 'They built a fortress.' },
    { cut: 'yard', at: 0.3, dur: 2.5, text: 'They hired an army.' },
    { cut: 'takedown', at: 0.15, dur: 1.3, text: 'Sneak.' },
    { cut: 'assassinate', at: 0.2, dur: 1.4, text: 'Strike.' },
    { cut: 'snipe', at: 0.1, dur: 1.2, text: 'Snipe.' },
    { cut: 'spotted', at: 1.0, dur: 1.6, text: '…or get spotted', tone: 'pink' },
    { cut: 'minigun', at: 0.15, dur: 1.6, text: 'And go loud.', tone: 'pink' },
    { cut: 'grapple', at: 0.15, dur: 1.6, text: 'One mech.' },
    { cut: 'warden', at: 0.1, dur: 1.7, text: 'Zero mercy.', tone: 'pink' }
  ],

  voice: [
    { cut: 'takedown', at: 1.7, line: 'takedown', whisper: true },
    { cut: 'decoy', at: 1.1, line: 'decoy', whisper: true },
    { cut: 'snipe', at: 3.0, line: 'headshot' },
    { cut: 'minigun', at: 1.7, line: 'multiKill' },
    // "6, 7!" once the rocket has thrown the squad (it lands 1.03 s into its take, 0.73 s into the cut).
    { cut: 'rocket', at: 1.15, line: 'alarm' },
    { cut: 'flamer', at: 0.9, line: 'burnHuman' },
    { cut: 'loot', at: 0.6, line: 'loot' },
    { cut: 'extract', at: 1.0, line: 'extract' }
  ],

  music: [
    { song: 'tension', from: { cut: 'drop', at: 0 }, to: { cut: 'spotted', at: 1.45 }, fadeIn: 0.8, fadeOut: 0.12 },
    { song: 'chaos', from: { cut: 'spotted', at: 1.4 }, to: { cut: 'grapple', at: 0.05 }, fadeIn: 0.05, fadeOut: 0.12 },
    { song: 'hero', from: { cut: 'grapple', at: 0 }, to: 'end', fadeIn: 0.05, fadeOut: 2.4 }
  ],

  end: { image: 'src/assets/promotion/cover-1920x1080-logo.jpg', len: 4.5, cta: 'Play free now' }
}
