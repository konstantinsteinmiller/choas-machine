// Zip `dist/` into `dist/chaos-machine-<portal>.zip` for the portals that take
// an uploaded archive (itch, Glitch, GamePix, GameMonetize, Yandex).
//
// It uses the deploy pipeline's own PKZIP writer rather than `tar -a -cf`,
// which is only a zip when `tar` is Windows' bsdtar: launched from Git Bash,
// GNU tar wins the PATH and silently writes a TAR named `.zip`, which every
// portal answers with "could not read your zip file".
//
// Usage:  node scripts/pack-zip.mjs <portal>

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { zipDir, inspectZip } from '../tools/poki-deploy/lib/zip.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const portal = process.argv[2]
if (!portal || !/^[a-z-]+$/.test(portal)) {
  console.error('usage: node scripts/pack-zip.mjs <portal>')
  process.exit(1)
}

const dist = join(root, 'dist')
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html is missing: run the Vite build first')
  process.exit(1)
}

const out = join(dist, `chaos-machine-${portal}.zip`)
// Never pack an earlier archive, or a backup, into the new one.
zipDir(dist, out, { exclude: (name) => /\.zip$/i.test(name) || /-original\.[a-z0-9]+$/i.test(name) })
const info = inspectZip(out)
if (!info.ok) {
  console.error(`packed ${out}, but it would be rejected: ${info.why}`)
  process.exit(1)
}
console.log(`packed dist/chaos-machine-${portal}.zip (${info.entries} entries)`)
