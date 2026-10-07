#!/usr/bin/env node
// ─── node tools/playgama-release/release.mjs ────────────────────────────────
//
// The tail of `pnpm build:playgama`: pack the built Playgama archive with the
// pipeline's own PKZIP writer, then run the release gates on both the build
// folder and the zip. Exit 1 on any FAIL, so a build that is not releasable
// never looks finished.
//
// It replaces the `cd dist && tar -a -cf ../x.zip * && move x.zip dist\` tail,
// which had two traps: `tar` is GNU tar whenever Git's /usr/bin wins the PATH,
// and GNU tar's `-a` silently writes a TAR named .zip ("We couldn't read your
// zip file"); and it built into `dist/`, which Vite empties on every build —
// the folder where the other portals' archives, the pending Poki upload among
// them, are waiting. Paths come from `src/platforms/playgama/release.ts`, the
// same module `vite.config.ts` reads, so build, packer and gates always agree.
//
// No network, no browser, no upload — safe to run anywhere.
//
// Usage:  node tools/playgama-release/release.mjs [--gates-only] [--strict]
//                                                [--dist <dir>] [--zip <file>]
//   --gates-only   re-check an existing build + zip without re-packing
//   --strict       treat WARN as FAIL
//   --dist/--zip   another build folder / archive (a scratch twin build, a
//                  test fixture) — defaults to the paths in release.ts

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { packArtifact } from '../poki-deploy/lib/pack.mjs'
import { bold, bytes, die, fail, info, pass, step, warn } from '../poki-deploy/lib/log.mjs'
import { runPlaygamaGates } from './gates.mjs'
import { PLAYGAMA_OUT_DIR, PLAYGAMA_ZIP } from '../../src/platforms/playgama/release.ts'
import { DEV_TOOL_MARKERS, DEV_TOOLS_EVERYWHERE } from '../../src/platforms/policy.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..', '..')
const argv = process.argv.slice(2)
const GATES_ONLY = argv.includes('--gates-only')
const STRICT = argv.includes('--strict')
const opt = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}

const dist = resolve(ROOT, opt('--dist') ?? PLAYGAMA_OUT_DIR)
const zip = resolve(ROOT, opt('--zip') ?? PLAYGAMA_ZIP)
const shown = (p) => relative(ROOT, p).split('\\').join('/')

if (!existsSync(join(dist, 'index.html'))) {
  die(`${shown(dist)}/index.html is missing`, 'run the Vite build first (pnpm build:playgama does both)')
}

if (!GATES_ONLY) {
  step('Pack')
  const r = packArtifact({ root: ROOT, cfg: { dist: relative(ROOT, dist), zip: relative(ROOT, zip) } })
  if (!r.ok) die(`packed ${shown(zip)}, but it would be rejected: ${r.why}`)
  pass(`packed ${shown(zip)}`, `real PKZIP, index.html at the root, ${r.entries} entries, ${bytes(r.bytes)}, sha1 ${r.sha1}`)
}

step('Release gates (Playgama + YouTube Playables)')
let bridgeVersion = null
try {
  bridgeVersion = JSON.parse(readFileSync(join(ROOT, 'node_modules', '@playgama', 'bridge', 'package.json'), 'utf8')).version
} catch { /* reported by the gate as "no version to compare" */ }

// The cheats ship in this release too (the owner's decision, 2026-10-08:
// src/platforms/policy.ts, DEV_TOOLS_EVERYWHERE), so their markers are not forbidden.
const g = runPlaygamaGates({ dist, zip, forbid: DEV_TOOLS_EVERYWHERE ? [] : DEV_TOOL_MARKERS, bridgeVersion })
for (const r of g.results) {
  if (r.level === 'pass') pass(r.name, r.detail)
  else if (r.level === 'warn') (STRICT ? fail : warn)(r.name, r.detail)
  else if (r.level === 'info') info(`${bold('INFO')}  ${r.name}`, r.detail)
  else fail(r.name, r.detail)
}
const failed = g.failed + (STRICT ? g.warned : 0)
console.log(`\n   ${failed ? `✖ ${failed} gate(s) failed` : '✔ release gates passed'}  ·  ${g.warned} warning(s)  ·  ${shown(zip)}`)
process.exitCode = failed ? 1 : 0
