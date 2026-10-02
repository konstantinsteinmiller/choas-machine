// @vitest-environment node
//
// ─── The Poki deploy tool: never the wrong game, never a fake zip ───────────
//
// This repo was forked from Mega Droid (itself forked from Survivalist), and
// `tools/poki-deploy/poki.config.mjs` came along pointing at the predecessor's
// P4D game. Every P4D step is addressed by `gameId` alone, so an upload would
// not have failed — it would have put Chaos Machine into another game's
// Versions list. Pinned here:
//
//   1. the config is Chaos Machine's (name, zip, version name, save hook) and
//      carries no gameId until the real one is known;
//   2. `deploy.mjs` refuses every P4D-bound mode without a valid, non-foreign
//      gameId — BEFORE it bumps the version, builds, or opens a browser — while
//      `--gates-only` stays fully offline and needs none;
//   3. `pnpm build:poki` packs with the pipeline's own PKZIP writer, because the
//      old `tar -a -cf x.zip` tail writes a TAR named .zip under Git Bash.
//
// The spawned runs below cannot reach P4D even if the guard regresses: their
// `dist` has no index.html, so the pack/gates steps stop the run long before
// the browser step (which has its own second guard as well).

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..')
const TOOL = join(ROOT, 'tools', 'poki-deploy')
const SURVIVALIST_ID = '1d51788e-5771-4d70-8290-59366fb9773f'
const FRESH_ID = '0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0'

const load = async <T = any>(file: string): Promise<T> => await import(pathToFileURL(join(TOOL, file)).href)

// Scratch space INSIDE the repo (gitignored node_modules/.tmp) because the tool
// resolves `dist` / `zip` relative to the project root.
const SCRATCH_REL = join('node_modules', '.tmp', `poki-deploy-test-${process.pid}`)
const SCRATCH = join(ROOT, SCRATCH_REL)

beforeAll(() => { mkdirSync(SCRATCH, { recursive: true }) })
afterAll(() => { rmSync(SCRATCH, { recursive: true, force: true }) })

describe('gameId guard (lib/target.mjs)', () => {
  it('refuses a missing gameId', async () => {
    const { checkGameId } = await load('lib/target.mjs')
    for (const v of [null, undefined, '', '   ']) {
      const r = checkGameId(v)
      expect(r.ok, String(v)).toBe(false)
      expect(r.why).toMatch(/no P4D gameId/)
      expect(r.next).toMatch(/--game-id/)
    }
  })

  it('refuses anything that is not a P4D uuid', async () => {
    const { checkGameId } = await load('lib/target.mjs')
    for (const v of ['TODO', 'chaos-machine', '1d51788e-5771-4d70-8290', 42, {}]) {
      expect(checkGameId(v).ok, String(v)).toBe(false)
    }
  })

  it("refuses Survivalist's game id, however it is written", async () => {
    const { checkGameId } = await load('lib/target.mjs')
    for (const v of [SURVIVALIST_ID, SURVIVALIST_ID.toUpperCase(), `  ${SURVIVALIST_ID} `]) {
      const r = checkGameId(v)
      expect(r.ok).toBe(false)
      expect(r.why).toMatch(/Survivalist/)
    }
  })

  it("refuses Mega Droid's game id, the repo this one was copied from", async () => {
    const { checkGameId } = await load('lib/target.mjs')
    const r = checkGameId('9b504ac8-a798-4111-b0e5-a7c569fcec46')
    expect(r.ok).toBe(false)
    expect(r.why).toMatch(/Mega Droid/)
  })

  it('accepts a well-formed id of this game', async () => {
    const { checkGameId } = await load('lib/target.mjs')
    expect(checkGameId(FRESH_ID.toUpperCase())).toEqual({ ok: true, gameId: FRESH_ID })
  })
})

describe("poki.config.mjs is Chaos Machine's", () => {
  it('names, packs and versions the right game, and carries no gameId yet', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const { checkGameId } = await load('lib/target.mjs')
    expect(cfg.gameName).toBe('Chaos Machine')
    expect(cfg.zip).toBe('dist/chaos-machine-poki.zip')
    expect(cfg.dist).toBe('dist')
    expect(cfg.build).toBe('pnpm build:poki')
    expect(cfg.versionName('0.1.1')).toBe('Chaos Machine 0.1.1')
    // Empty until the game exists in P4D: every P4D-bound mode refuses to run.
    expect(cfg.gameId).toBe('')
    expect(checkGameId(cfg.gameId).ok).toBe(false)
    expect(cfg.declares).toEqual({ usernames: false, chat: false })
    expect(cfg.allowHosts).toEqual([])
  })

  it('carries no predecessor value anywhere', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const values: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') values.push(v)
      else if (typeof v === 'function') values.push(String(v), String(v('9.9.9')))
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(cfg)
    for (const v of values) expect(v).not.toMatch(/survivalist|mega.?droid|mega.?adventure/i)

    // The old id may exist in exactly one place: the refusal list.
    const hits: string[] = []
    const scan = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) scan(p)
        else if (readFileSync(p, 'utf8').includes(SURVIVALIST_ID)) hits.push(relative(TOOL, p).replace(/\\/g, '/'))
      }
    }
    scan(TOOL)
    expect(hits).toEqual(['lib/target.mjs'])
  })

  it('reads durable progress out of the one state blob, and nothing without a save', async () => {
    const { default: cfg } = await load('poki.config.mjs')
    const store = new Map<string, string>()
    const localStorage = { getItem: (k: string) => store.get(k) ?? null }
    // eslint-disable-next-line no-new-func
    const run = () => new Function('localStorage', `return ${cfg.hooks.readProgress}`)(localStorage)

    expect(run()).toBeNull()

    store.set('cmachine_state', JSON.stringify({
      cm_cleared: 1,
      cm_medals: 3,
      cm_missions: 2,
      cm_scrap: 120,
      // Volatile on a reload — must not be part of the snapshot.
      cm_forge: { startedAt: 12345 }
    }))
    expect(run()).toEqual({ cleared: 1, medals: 3, missions: 2, scrap: 120 })

    store.set('cmachine_state', '{not json')
    expect(run()).toBeNull()
  })
})

describe('deploy.mjs refuses P4D without a valid gameId', () => {
  const pkgVersion = (): string => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

  const writeConfig = (name: string, gameId: string | null): string => {
    const file = join(SCRATCH, `${name}.config.mjs`)
    // `dist` does not exist at all: should the guard ever regress, pack/gates
    // end the run long before any browser step. `build` would exit 3 if run.
    writeFileSync(file, `export default {
      team: 'studio',
      gameId: ${JSON.stringify(gameId)},
      gameName: 'Chaos Machine',
      build: 'node -e "process.exit(3)"',
      dist: ${JSON.stringify(join(SCRATCH_REL, 'missing-dist').replace(/\\/g, '/'))},
      zip: ${JSON.stringify(join(SCRATCH_REL, 'never.zip').replace(/\\/g, '/'))},
      repack: true,
      allowHosts: [],
      versionName: v => 'Chaos Machine ' + v
    }\n`)
    return file
  }

  const deploy = (args: string[]) => spawnSync(process.execPath, [join(TOOL, 'deploy.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1' }
  })

  it('stops a normal run with no gameId before the version bump, the build or the browser', () => {
    const before = pkgVersion()
    const r = deploy(['--config', writeConfig('no-id', null), '--no-bump', '--skip-build'])
    const out = `${r.stdout}\n${r.stderr}`
    expect(r.status).toBe(1)
    expect(out).toMatch(/no P4D gameId is configured/)
    expect(out).toMatch(/nothing was uploaded/)
    expect(out).not.toMatch(/Browser|Upload to P4D|Pack|Release gates/)
    expect(pkgVersion()).toBe(before)
  })

  it("refuses Survivalist's id from the config AND from --game-id", () => {
    for (const args of [
      ['--config', writeConfig('foreign-id', SURVIVALIST_ID), '--no-bump', '--skip-build'],
      ['--config', writeConfig('no-id-2', null), '--game-id', SURVIVALIST_ID, '--no-bump', '--skip-build'],
      ['--config', writeConfig('no-id-3', null), '--qa-only'],
      ['--config', writeConfig('no-id-4', null), '--dry-run', '--skip-build']
    ]) {
      const r = deploy(args)
      const out = `${r.stdout}\n${r.stderr}`
      expect(r.status, args.join(' ')).toBe(1)
      expect(out, args.join(' ')).toMatch(/refusing/)
      expect(out, args.join(' ')).not.toMatch(/Browser|Upload to P4D/)
    }
  })

  it('runs --gates-only fully offline with no gameId at all', () => {
    const distRel = join(SCRATCH_REL, 'gates-dist')
    mkdirSync(join(ROOT, distRel, 'assets'), { recursive: true })
    writeFileSync(join(ROOT, distRel, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"><title>Chaos Machine</title></head><body>'
      + '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'
      + '<script type="module" src="./assets/index.js"></script></body></html>')
    writeFileSync(join(ROOT, distRel, 'assets', 'index.js'), 'console.log("hi")')
    const file = join(SCRATCH, 'gates.config.mjs')
    writeFileSync(file, `export default {
      team: 'studio', gameId: null, gameName: 'Chaos Machine', build: 'node -e "process.exit(3)"',
      dist: ${JSON.stringify(distRel.replace(/\\/g, '/'))},
      zip: ${JSON.stringify(join(distRel, 'chaos-machine-poki.zip').replace(/\\/g, '/'))},
      repack: true, allowHosts: [], versionName: v => 'Chaos Machine ' + v
    }\n`)

    const r = deploy(['--config', file, '--gates-only'])
    const out = `${r.stdout}\n${r.stderr}`
    expect(r.status, out).toBe(0)
    expect(out).toMatch(/offline gates only/)
    expect(out).toMatch(/PASS\s+the archive is a real zip|PASS\s+index\.html at the archive root/)
    expect(out).toMatch(/gates only — stopping here/)
    expect(out).not.toMatch(/Browser|Upload to P4D/)
  })
})

describe('packing (lib/pack.mjs, pack.mjs, build:poki)', () => {
  it('packs a real PKZIP with index.html at the root, leaving old zips and backups out', async () => {
    const { packArtifact } = await load('lib/pack.mjs')
    const { listZip } = await load('lib/zip.mjs')
    const distRel = join(SCRATCH_REL, 'pack-dist')
    const dist = join(ROOT, distRel)
    mkdirSync(join(dist, 'assets'), { recursive: true })
    mkdirSync(join(dist, 'icons'), { recursive: true })
    writeFileSync(join(dist, 'index.html'), '<html></html>')
    writeFileSync(join(dist, 'assets', 'index.js'), 'export {}')
    writeFileSync(join(dist, 'icons', 'icon-original.png'), 'backup')
    writeFileSync(join(dist, 'old-build.zip'), 'PK')

    const zipRel = join(distRel, 'out.zip')
    const r = packArtifact({ root: ROOT, cfg: { dist: distRel, zip: zipRel } })
    expect(r.ok, r.why).toBe(true)
    const zipBytes = readFileSync(join(ROOT, zipRel))
    expect(zipBytes.readUInt32LE(0)).toBe(0x04034b50) // PKZIP local header, not a TAR
    expect(listZip(join(ROOT, zipRel)).sort()).toEqual(['assets/index.js', 'index.html'])
  })

  it('reports a TAR named .zip as unreadable (the GNU tar trap)', async () => {
    const { inspectZip } = await load('lib/zip.mjs')
    const fake = join(SCRATCH, 'gnu-tar.zip')
    const tarHeader = Buffer.alloc(1024)
    tarHeader.write('index.html', 0, 'latin1')
    tarHeader.write('ustar', 257, 'latin1')
    writeFileSync(fake, tarHeader)
    const z = inspectZip(fake)
    expect(z.ok).toBe(false)
    expect(z.why).toMatch(/GNU tar wrote a TAR/)
  })

  it('build:poki ends in the pipeline packer, not a shell tar', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const script: string = pkg.scripts['build:poki']
    expect(script).toMatch(/^vite build --mode poki --base=\.\/ && node tools\/poki-deploy\/pack\.mjs$/)
    expect(script).not.toMatch(/\btar\b/)
  })
})

describe('release gates (lib/gates.mjs)', () => {
  const makeDist = (name: string, extraJs: string): string => {
    const distRel = join(SCRATCH_REL, name)
    mkdirSync(join(ROOT, distRel, 'assets'), { recursive: true })
    writeFileSync(join(ROOT, distRel, 'index.html'),
      '<html><head></head><body><script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'
      + '<script type="module" src="./assets/index.js"></script></body></html>')
    writeFileSync(join(ROOT, distRel, 'assets', 'index.js'), extraJs)
    return join(ROOT, distRel)
  }
  const purity = async (dist: string) => {
    const { runGates } = await load('lib/gates.mjs')
    return runGates({ dist, zip: null }).results.find((x: { name: string }) => x.name.startsWith('bundle purity'))
  }

  it('fails a bundle that still carries another portal\'s SDK', async () => {
    for (const marker of [
      'https://www.youtube.com/game_api/v1',
      'https://playgama.com/platform-sdk/wrap.v1.js',
      'https://an.yandex.ru/system/context.js',
      'https://api.glitch.fun/api/titles/',
      'https://small-mouse-123.convex.cloud'
    ]) {
      const res = await purity(makeDist(`dirty-${marker.length}`, `const u = ${JSON.stringify(marker)}`))
      expect(res.level, marker).toBe('fail')
    }
  })

  it('passes one that only names other portals in inert identifiers', async () => {
    const res = await purity(makeDist('clean', 'const f = { isCrazyWeb: false, isPlaygama: false, allowedToShowOnYandex: false }'))
    expect(res.level).toBe('pass')
  })

  it('fails a release carrying any dev-tooling marker the config forbids (clean build)', async () => {
    const { runGates } = await load('lib/gates.mjs')
    const { default: cfg } = await load('poki.config.mjs')
    const texts = cfg.forbidInBundle.map((f: { text: string }) => f.text)
    expect(texts).toEqual(expect.arrayContaining(['[CHEAT]', 'ctrl+shift+alt+', 'cmarc']))
    // The hidden 30-tap interstitial ships in the release on purpose.
    expect(texts).not.toContain('[qa-ad]')
    const gate = (dist: string) => runGates({ dist, zip: null, forbid: cfg.forbidInBundle })
      .results.find((x: { name: string }) => x.name.startsWith('clean build'))
    for (const text of texts) {
      expect(gate(makeDist(`devtools-${texts.indexOf(text)}`, `console.warn(${JSON.stringify(text + ' x')})`)).level, text).toBe('fail')
    }
    expect(gate(makeDist('devtools-clean', 'console.log("ok")')).level).toBe('pass')
  })
})
