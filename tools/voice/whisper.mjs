// Whisper read-back for QA: faster-whisper in its own Python environment
// (`~/.vo-venvs/whisper`, made by `pnpm voice:setup whisper`), run once per
// batch so the model loads once. No environment → no read-back (a warning,
// and the other checks still run).

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from './lib.mjs'

export const VENVS = process.env.VO_VENVS ?? join(homedir(), '.vo-venvs')
export const pythonOf = (env) => join(VENVS, env, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
export const RUNNERS = join(ROOT, 'tools', 'voice', 'py')

/** Run a Python runner (`py/run_<name>.py jobs.json results.json`) in its environment; resolves with results.json. */
export const runPython = (env, runner, payload, { label = runner } = {}) => new Promise((resolve, reject) => {
  const py = pythonOf(env)
  if (!existsSync(py)) return reject(new Error(`no Python environment ${env}: run pnpm voice:setup ${env}`))
  const dir = mkdtempSync(join(tmpdir(), 'vo-'))
  const jobs = join(dir, 'jobs.json')
  const results = join(dir, 'results.json')
  writeFileSync(jobs, JSON.stringify(payload))
  const p = spawn(py, [join(RUNNERS, runner), jobs, results], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } })
  let err = ''
  p.stdout.on('data', (d) => process.stdout.write(`  [${label}] ${d}`))
  p.stderr.on('data', (d) => { err += d })
  p.on('close', (code) => {
    try {
      if (code !== 0 || !existsSync(results)) return reject(new Error(`${label} exited ${code}: ${err.slice(-1500)}`))
      resolve(JSON.parse(readFileSync(results, 'utf8')))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/** `{ id: text }` for each `{ id, wav, lang }`; `{}` when Whisper is not set up. */
export const transcribe = async (items) => {
  if (!existsSync(pythonOf('whisper'))) {
    console.warn('  no Whisper environment (pnpm voice:setup whisper): skipping the read-back')
    return {}
  }
  // The cast's names as a spelling hint (Whisper hears "Flux" as "Phlox" without it).
  const prompt = 'Flux, Vex, Atlas, Gauss, Pip.'
  const r = await runPython('whisper', 'run_whisper.py', { jobs: items.map(i => ({ ...i, prompt })) }, { label: 'whisper' })
  return Object.fromEntries(r.results.map(x => [x.id, x.text ?? null]))
}
