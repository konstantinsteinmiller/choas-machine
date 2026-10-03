import { on } from '../bus'
import { VOICE_FILES } from '../assets/overrides'
import { SPEAKERS, SPEAKER_OF, fileName, type Speaker } from './voiceCatalog'
import { whenAudio } from './engine'
import { playVoice, prefetchVoices } from './synth'

/**
 * ─── The NPCs' voices (#65) ──────────────────────────────────────────────────
 *
 * A defender that is sure shouts its line (`callout`, #62): the bubble shows
 * the words in the player's language, and this plays the speaker's recording,
 * placed by where the speaker is (pan) and how far (gain). A barks channel
 * (WIRING.md rule 6): throttled, never two of one speaker at once, and a
 * missing file is silence, never an error. Files exist for the languages the
 * pipeline speaks (`tools/voice/lib.mjs`); every other language hears the
 * English take under its own bubble.
 */

/** Between any two barks, and between two of one speaker (s). */
export const BARK_GAP_S = 0.9
export const SPEAKER_GAP_S = 2.5
/** Beyond this a shout is not heard; nearer, louder (down to a floor). */
export const EARSHOT_M = 70

const lang = (): string => {
  const l = (window as unknown as { __i18n?: { global?: { locale?: { value?: string } | string } } }).__i18n?.global?.locale
  const v = typeof l === 'string' ? l : l?.value
  return (v ?? 'en').toLowerCase()
}

/** The recording of `speaker`'s alarm in `l`, else English, else none. */
export const voiceUrl = (speaker: Speaker, l: string): string | undefined => {
  const file = fileName(`npc.${speaker}.alarm`)
  return VOICE_FILES.get(`${l}/${file}`) ?? VOICE_FILES.get(`${l.split('-')[0]}/${file}`) ?? VOICE_FILES.get(`en/${file}`)
}

/** The files one language needs: each speaker's alarm, in that language or English. */
export const voiceSet = (l: string): Set<string> => {
  const out = new Set<string>()
  for (const s of Object.keys(SPEAKERS) as Speaker[]) {
    const url = voiceUrl(s, l)
    if (url) out.add(url)
  }
  return out
}

let lastAt = -1e9
const lastBy = new Map<Speaker, number>()
let installed = false

export const installVoices = (): void => {
  if (installed) return
  installed = true
  // Decode them early, a shout must not wait for a fetch, but not during the
  // boot and only in the language the player hears (`voiceUrl` per speaker:
  // their own, else English). Another language is fetched if it is ever needed.
  whenAudio(() => prefetchVoices(voiceSet(lang())))
  on('callout', ({ kind, role, dist, pan }) => {
    if (dist > EARSHOT_M) return
    const now = performance.now() / 1000
    const speaker = SPEAKER_OF(kind, role)
    if (now - lastAt < BARK_GAP_S || now - (lastBy.get(speaker) ?? -1e9) < SPEAKER_GAP_S) return
    const url = voiceUrl(speaker, lang())
    if (!url) return
    const gain = Math.max(0.3, 1 - dist / EARSHOT_M)
    if (playVoice(url, Math.max(-0.8, Math.min(0.8, pan)), gain)) {
      lastAt = now
      lastBy.set(speaker, now)
    }
  })
}
