import overrides from 'virtual:asset-overrides'

/**
 * ─── Drop-in assets ──────────────────────────────────────────────────────────
 *
 * Everything is procedural by default: canvas-baked textures and a chiptune
 * synth. A file dropped into `public/` under the name of the thing it replaces
 * takes over from the procedural version (the names are listed in
 * `art-todo.md` and `sound-todo.md`):
 *
 *   public/audio/sfx/<sfx name>.ogg        → that sound effect
 *   public/audio/music/<track id>.ogg      → that music track (or jingle)
 *   public/images/textures/floor|wall.webp → that level detail map
 *
 * The list is taken at BUILD time (`assetOverridesPlugin` in vite.config.ts),
 * so the game only requests files that exist; a missing one is never a 404.
 * Each map is keyed by the file name without its extension.
 */
const byName = (files: string[], dir: string): Map<string, string> => {
  const base = import.meta.env.BASE_URL
  const m = new Map<string, string>()
  for (const f of files) m.set(f.slice(0, f.lastIndexOf('.')), `${base}${dir}/${f}`)
  return m
}

export const SFX_FILES = byName(overrides.sfx, 'audio/sfx')
export const MUSIC_FILES = byName(overrides.music, 'audio/music')
/** The voice-overs (#65), keyed `<lang>/<line file>` (e.g. `en/npc_guard_alarm`). */
export const VOICE_FILES = byName(overrides.voice ?? [], 'audio/voice')
/**
 * `?art=off` plays without the painted drop-ins, in any build: the way to see
 * a painting against the drawing it replaced (open two tabs), and to tell a
 * broken painting from a broken game.
 */
const ART_OFF = ((): boolean => {
  try { return new URLSearchParams(window.location.search).get('art') === 'off' } catch { return false }
})()

export const TEXTURE_FILES = byName(ART_OFF ? [] : overrides.textures, 'images/textures')
