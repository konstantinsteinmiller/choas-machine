// Gemini 3.8 Flash-Lite TTS: the same designed voices and directions as
// gemini.mjs, the lighter model (its own free quota, about half the price).
import { MODELS, makeEngine } from './gemini.mjs'

export default makeEngine('gemini-lite', 'Gemini 3.8 Flash-Lite TTS (API)', MODELS.lite)
