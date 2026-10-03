// Gemini TTS through the API (`GEMINI_API_KEY` in .env.voice.local, from AI
// Studio): each speaker's voice is DESIGNED once per language from its card
// (`POST /v1beta/voices`, a prompted voice that lives a year), then every
// line is spoken by that voice with the direction as the turn's style.
//
// Free tier (measured 2026-10-01): 10 requests a DAY for gemini-3.8-flash-tts,
// a separate quota for -flash-lite-tts; calls are paced and a 429 waits for
// the time the API names, up to a few tries. A whole game needs the paid
// tier (billing on the AI Studio project) or the browser route. Output: WAV,
// 24 kHz mono. Voices designed once serve both models.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const MODELS = { flash: 'gemini-3.8-flash-tts', lite: 'gemini-3.8-flash-lite-tts' }
const GAP_MS = 6500
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const apiKey = () => {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const f = join(ROOT, '.env.voice.local')
  const m = existsSync(f) && readFileSync(f, 'utf8').match(/^GEMINI_API_KEY=(\S+)/m)
  if (!m) throw new Error('No GEMINI_API_KEY: put it in .env.voice.local (AI Studio → API keys)')
  return m[1]
}

let last = 0
/** One paced API call; retries a 429/503 after the delay the API asks for. */
const call = async (path, body, { method = 'POST', tries = 6 } = {}) => {
  for (let i = 0; ; i++) {
    const wait = last + GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    const r = await fetch(`${BASE}/${path}`, {
      method,
      headers: { 'x-goog-api-key': apiKey(), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await r.text()
    const j = text ? JSON.parse(text) : {}
    if (r.ok) return j
    const retry = [429, 500, 503].includes(r.status) && i < tries - 1
    if (!retry) throw Object.assign(new Error(`gemini ${r.status}: ${j.error?.message ?? text.slice(0, 300)}`), { status: r.status })
    const named = JSON.stringify(j).match(/"retryDelay":\s*"(\d+)s"/)
    const ms = named ? +named[1] * 1000 + 500 : 15_000 * (i + 1)
    console.warn(`  gemini ${r.status}, waiting ${Math.round(ms / 1000)} s`)
    await sleep(ms)
  }
}

/** A designed voice (stored by Google for a year): its id and its sample WAV. */
export const designVoice = async ({ prompt, name }) => {
  const j = await call('voices', { store: true, voice: { type: 'prompted', display_name: name, prompted: { input: prompt } } })
  const v = j.voice ?? j
  return { id: v.id, sample: v.sample_audio?.data ? Buffer.from(v.sample_audio.data, 'base64') : null, expires: v.expire_time }
}

export const deleteVoice = (id) => call(`voices/${id}`, null, { method: 'DELETE' })

/** Speak `text` in `voice` with `style`; resolves with the WAV bytes. */
export const speak = async ({ text, style, voice, model = MODELS.flash }) => {
  const content = { type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }
  const j = await call('interactions', {
    model,
    input: [{ type: 'user_input', content: [content] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] }
  })
  const audio = j.steps?.flatMap(s => s.content ?? []).find(c => c.type === 'audio')
  if (!audio?.data) throw new Error(`gemini: no audio (${j.status ?? 'no status'})`)
  return Buffer.from(audio.data, 'base64')
}

/** The engine, as tools/voice/generate.mjs drives it (`gemini-lite.mjs` is the same with the Lite model). */
export const makeEngine = (name, label, model) => ({
  name,
  label,
  /** Designs (once) the voice for a speaker in a language; `state` is vo-src/refs/voices.json. */
  async voice({ speaker, lang, card, state, refDir }) {
    const k = `gemini:${speaker}:${lang}`
    if (state[k]?.id && new Date(state[k].expires) > new Date()) return state[k]
    const v = await designVoice({ prompt: card.designPrompt[lang], name: `mega-droid ${speaker} ${lang}` })
    if (v.sample) writeFileSync(join(refDir, `${lang}.gemini.wav`), v.sample)
    state[k] = { id: v.id, expires: v.expires }
    return state[k]
  },
  async synth(items) {
    const out = []
    for (const it of items) {
      try {
        writeFileSync(it.raw, await speak({ text: it.text, style: it.style, voice: it.voice.id, model }))
        out.push({ ok: true })
      } catch (e) {
        out.push({ ok: false, error: e.message })
      }
    }
    return out
  }
})

export default makeEngine('gemini', 'Gemini 3.8 Flash TTS (API)', MODELS.flash)
