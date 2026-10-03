// `pnpm voice:setup <engine…|all>` — the Python environments the local voice
// engines run in, one per engine under ~/.vo-venvs (they pin different torch
// and transformers versions). Needs uv (https://docs.astral.sh/uv/) and an
// NVIDIA GPU; models download from Hugging Face on first use (~15 GB in all).
//
//   voxcpm      VoxCPM2: voice design + cloning, 48 kHz (torch cu128; triton-
//               windows for torch.compile, without it Windows runs ~4× slower)
//   qwen        Qwen3-TTS 1.7B VoiceDesign + Base (clone)
//   chatterbox  Chatterbox Multilingual V3 (clone only; from git: PyPI has no V3)
//   whisper     faster-whisper large-v3-turbo, for the QA read-back
//
// Recipes measured on Windows 11 + RTX 4090 Laptop, driver CUDA 12.8 (2026-10-01).

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { VENVS, pythonOf } from './whisper.mjs'
import { join } from 'node:path'

const CU128 = ['--index-url', 'https://download.pytorch.org/whl/cu128']
const win = process.platform === 'win32'
const RECIPES = {
  voxcpm: [['torch', 'torchaudio', ...CU128], ['voxcpm', ...(win ? ['triton-windows>=3.7,<3.8'] : [])]],
  qwen: [['torch', 'torchaudio', ...CU128], ['qwen-tts']],
  chatterbox: [['torch==2.6.0', 'torchaudio==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu126'],
    ['chatterbox-tts@git+https://github.com/resemble-ai/chatterbox.git@5de7a54']],
  whisper: [['faster-whisper', 'soundfile', ...(win ? ['nvidia-cublas-cu12', 'nvidia-cudnn-cu12==9.*'] : [])]]
}

// Arguments go to uv as an array (never through a shell: "<" and ">" in a version spec would become redirects).
const uv = (...a) => {
  const r = spawnSync('uv', a, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`uv ${a.join(' ')} failed (${r.status ?? r.error?.message})`)
}

const wanted = process.argv.slice(2)
const names = wanted.includes('all') || !wanted.length ? Object.keys(RECIPES) : wanted
for (const n of names) {
  if (!RECIPES[n]) throw new Error(`unknown engine ${n}: one of ${Object.keys(RECIPES).join(', ')}, all`)
  const dir = join(VENVS, n)
  console.log(`── ${n} → ${dir}`)
  if (!existsSync(pythonOf(n))) uv('venv', '--python', '3.11', dir)
  for (const step of RECIPES[n]) uv('pip', 'install', '--python', pythonOf(n), ...step)
}
console.log('done; models download on first use')
