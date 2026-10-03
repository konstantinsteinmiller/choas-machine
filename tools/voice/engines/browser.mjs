// The "voice desk": one Chrome profile of its own (never the user's browser)
// that the browser-driven engines share (aistudio.mjs, elevenlabs.mjs), the
// way the Art Desk drives gemini.google.com.
//
// SIGNING IN (once per site): `signInWindow(url)` opens the profile PLAINLY —
// Google refuses its sign-in in a window with an automation port — the user
// signs in and closes that window; `connect()` then reopens the same profile
// with `--remote-debugging-port=0` and attaches over CDP. The window stays
// open between runs (attach, work, detach).

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../lib.mjs'

export const PROFILE = process.env.VOICE_DESK_PROFILE ?? join(homedir(), '.voice-desk', 'chrome')
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find(p => p && existsSync(p))

const livePort = async () => {
  const f = join(PROFILE, 'DevToolsActivePort')
  if (!existsSync(f)) return null
  const port = readFileSync(f, 'utf8').split('\n')[0].trim()
  try { await fetch(`http://127.0.0.1:${port}/json/version`); return port } catch { return null }
}

/** The plain window for a sign-in (no automation port). */
export const signInWindow = (url) => {
  if (!CHROME) throw new Error('No Chrome found: set CHROME_PATH')
  mkdirSync(PROFILE, { recursive: true })
  spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', url], { detached: true, stdio: 'ignore' }).unref()
}

const launch = async (url) => {
  let port = await livePort()
  if (port) return port
  if (!CHROME) throw new Error('No Chrome found: set CHROME_PATH')
  mkdirSync(PROFILE, { recursive: true })
  rmSync(join(PROFILE, 'DevToolsActivePort'), { force: true })
  spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    // A window in the background must keep its timers, or a generation sits waiting on a throttled tab.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', url],
  { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 80; i++) {
    await sleep(250)
    port = await livePort()
    if (port) return port
  }
  throw new Error(`Chrome opened no DevTools port. Is a sign-in window on ${PROFILE} still open? Close it and run again.`)
}

/**
 * Attach to the desk's window (launching it if needed) and find or open the
 * page for `origin`. `close()` only detaches: the window stays for the next run.
 */
export const connect = async (url) => {
  const port = await launch(url)
  const { chromium } = createRequire(join(ROOT, 'package.json'))('playwright-core')
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const ctx = browser.contexts()[0] ?? await browser.newContext()
  const origin = new URL(url).origin
  const page = ctx.pages().find(p => p.url().startsWith(origin)) ?? await ctx.newPage()
  return { page, close: () => browser.close().catch(() => {}) }
}
