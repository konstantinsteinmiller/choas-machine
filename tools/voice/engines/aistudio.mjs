// Gemini TTS through AI Studio's speech page (aistudio.google.com/generate-
// speech), driven in a Chrome profile of its own — the browser route beside
// the API. It runs on the playground's own free quota (no API key), which is
// what makes it worth having: the API's free tier is 10 requests a day.
//
// STATE (2026-10-02): BLOCKED BY GOOGLE. The first run after a manual
// sign-in works; after that AI Studio refuses its own access token to a
// Chrome that has an automation port (`GenerateAccessToken` → 401 "OAuth
// error: unauthorized_client", then `GenerateContent` → 403 "The caller does
// not have permission"). It is not a quota. Kept as the starting point for a
// route that drives a normal window (an extension, or OS-level input); until
// then use the API engines (`gemini`, `gemini-lite`) with billing on.
//
// SIGNING IN (once): `pnpm voice:gen --engine aistudio --sign-in` (see
// browser.mjs: the voice desk's own Chrome profile).
//
// Voices: the playground can't design voices on the free tier, so each
// speaker gets one fixed library voice (VOICES) and its card's description
// rides in the style text with the line's direction.

import { writeFileSync } from 'node:fs'
import { connect, signInWindow, sleep } from './browser.mjs'

const URL = 'https://aistudio.google.com/generate-speech'
/** One library voice per speaker (Google's studio voices: Kore firm/female, Charon low/male, Puck upbeat/male, Gacrux mature/female). */
export const VOICES = { atlas: 'Kore', vex: 'Charon', flux: 'Puck', gauss: 'Gacrux' }
const GAP_MS = 4000

/** A fresh speech editor: one speech block, the voice panel closed. */
const openEditor = async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  if (/accounts\.google\.com/.test(page.url())) throw new Error('signed out: run with --sign-in')
  await page.locator('button.glue-cookie-notification-bar__accept').click({ timeout: 1500 }).catch(() => {})
  await page.getByText('Create new dialog').first().click()
  await page.getByLabel('Speech block text').waitFor({ timeout: 20000 })
}

const setVoice = async (page, name) => {
  await page.getByRole('button', { name: /^Speaker 1/ }).click()
  await page.getByLabel('Search voices').fill(name)
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name, exact: true }).first().click()
  await page.waitForTimeout(800)
  const close = page.getByRole('button', { name: /Steuerfeld schließen|Close panel|close/i }).first()
  if (await page.getByLabel('Search voices').isVisible().catch(() => false)) await close.click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(600)
}

const setStyle = async (page, style) => {
  await page.getByRole('button', { name: 'Style' }).first().click()
  const box = page.getByLabel('Describe the voice style')
  await box.waitFor({ timeout: 8000 })
  await box.fill(style)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

/** Run the block; resolves with the WAV the page plays (a data: URL on its audio element). */
const run = async (page, text) => {
  const before = await page.locator('audio').evaluateAll(as => as.map(a => a.src))
  await page.getByLabel('Speech block text').fill(text)
  await page.getByRole('button', { name: /^Run/ }).click()
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500)
    const srcs = await page.locator('audio').evaluateAll(as => as.map(a => a.src))
    const fresh = srcs.find(s => s.startsWith('data:audio') && !before.includes(s))
    if (fresh) return Buffer.from(fresh.slice(fresh.indexOf(',') + 1), 'base64')
    const err = await page.locator('ms-error, .error-message, [role=alert], mat-snack-bar-container').allInnerTexts().catch(() => [])
    const msg = err.join(' ').trim()
    if (/quota|limit|exceeded|error|fehler/i.test(msg)) throw new Error(`AI Studio: ${msg.slice(0, 200)}`)
  }
  throw new Error('AI Studio: no audio after 60 s')
}

export default {
  name: 'aistudio',
  label: 'Gemini 3.8 Flash TTS (AI Studio, browser)',
  signIn: () => signInWindow(`https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(URL)}`),
  async voice({ speaker }) {
    // A speaker added to the cast later needs its library voice picked by ear first.
    if (!VOICES[speaker]) throw new Error(`AI Studio: no library voice for "${speaker}" yet; add one to VOICES`)
    return { id: VOICES[speaker] }
  },
  async synth(items) {
    const { page, close } = await connect(URL)
    const out = new Array(items.length)
    try {
      await openEditor(page)
      let voice = null
      // Grouped by voice: the voice is set once per speaker.
      const order = items.map((it, i) => [it, i]).sort((x, y) => x[0].voice.id.localeCompare(y[0].voice.id))
      for (const [it, i] of order) {
        try {
          if (voice !== it.voice.id) { await setVoice(page, it.voice.id); voice = it.voice.id }
          await setStyle(page, `Voice: ${it.card.designPrompt[it.lang]} Delivery: ${it.style}`)
          writeFileSync(it.raw, await run(page, it.text))
          out[i] = { ok: true }
        } catch (e) {
          out[i] = { ok: false, error: e.message.split('\n')[0] }
          if (/quota|limit|signed out/i.test(e.message)) { for (const [, j] of order) out[j] ??= { ok: false, error: 'skipped: ' + out[i].error }; break }
          await openEditor(page).catch(() => {}); voice = null
        }
        await sleep(GAP_MS + Math.random() * 2000)
      }
    } finally {
      await close() // detaches; the window stays for the next run
    }
    return out
  }
}
