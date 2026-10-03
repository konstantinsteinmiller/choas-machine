// Local engines on the GPU (VoxCPM2, Qwen3-TTS, Chatterbox Multilingual), each
// in its own Python environment under ~/.vo-venvs (`pnpm voice:setup <name>`)
// and driven through tools/voice/py/run_<name>.py, one call per batch so the
// model loads once.
//
// Consistency: each speaker's voice is designed ONCE per language from its
// card (VoxCPM2 or Qwen3's VoiceDesign, reading the card's reference text)
// and frozen as vo-src/refs/<speaker>/<lang>.<designer>.wav + .txt; every
// line is then cloned from that clip. Chatterbox designs nothing: it clones
// Qwen3's reference.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { VO_SRC } from '../lib.mjs'
import { runPython } from '../whisper.mjs'

const refOf = (speaker, lang, designer) => {
  const base = join(VO_SRC, 'refs', speaker, `${lang}.${designer}`)
  return { wav: `${base}.wav`, txt: `${base}.txt` }
}

/** Design the missing reference clips in one run of the designer's model. */
const designRefs = async (designer, wanted) => {
  const missing = wanted.filter(w => !existsSync(refOf(w.speaker, w.lang, designer).wav))
  if (!missing.length) return
  const jobs = missing.map(w => ({
    id: `${w.speaker}:${w.lang}`, mode: 'design', lang: w.lang,
    text: w.card.referenceText[w.lang], description: w.card.designPrompt[w.lang],
    seed: 4242, out: refOf(w.speaker, w.lang, designer).wav
  }))
  const r = await runPython(designer, `run_${designer}.py`, { jobs }, { label: `${designer} design` })
  for (const x of r.results) {
    const w = missing.find(m => `${m.speaker}:${m.lang}` === x.id)
    if (!x.ok) throw new Error(`${designer} could not design ${x.id}: ${x.error}`)
    writeFileSync(refOf(w.speaker, w.lang, designer).txt, w.card.referenceText[w.lang])
  }
}

/**
 * `shortStyle`: the engine reads the style as a prefix in the text itself
 * (VoxCPM2's "(style)text"), so it gets only the line's own direction, in the
 * line's language: a long or English prefix can tip German words into English.
 */
export const makeLocal = ({ name, label, designer = name, shortStyle = false }) => ({
  name,
  label,
  /** Batch: every speaker × language at once (one model load). */
  async voices(wanted) {
    await designRefs(designer, wanted)
    return Object.fromEntries(wanted.map(w => {
      const ref = refOf(w.speaker, w.lang, designer)
      return [`${w.speaker}:${w.lang}`, { ref: ref.wav, refText: readFileSync(ref.txt, 'utf8') }]
    }))
  },
  async synth(items) {
    const jobs = items.map(it => ({
      id: it.id, mode: 'clone', lang: it.lang, text: it.text, style: shortStyle ? it.direction : it.style, tone: it.tone,
      ref_wav: it.voice.ref, ref_text: it.voice.refText, seed: it.seed, out: it.raw
    }))
    const r = await runPython(name, `run_${name}.py`, { jobs }, { label: name })
    const by = Object.fromEntries(r.results.map(x => [x.id, x]))
    return items.map(it => ({ ok: !!by[it.id]?.ok, error: by[it.id]?.error }))
  }
})
