// @vitest-environment jsdom
// ─── The Playgama release: the Playgama path and nothing else ───────────────
//
// The `build:playgama` archive goes to developer.playgama.com AND, forwarded by
// Playgama, to YouTube Playables. Its release rule is a PURE bundle: only the
// Playgama plugin path — no other portal's SDK, plugin chunk, host or name, and
// no dev tooling. The release gate (`tools/playgama-release/gates.mjs`, run by
// `build:playgama`) greps the BUILT archive for all of it; this suite pins the
// source-side mechanisms that make that grep come back clean, each of which
// broke it once:
//
//   • the platform policy holds the Playgama release to Poki's clean-build rule
//     (dev tooling aliased to stubs), and the QA twin is one generic flag away;
//   • the app reads the policy RESULT (`__PLATFORM_POLICY__`), so no resolver
//     naming other portals ships;
//   • the render gate folds to "always render" (and the vConsole button drops
//     out) at build time, instead of shipping every portal's flag names;
//   • the CrazyGames misconfiguration check stays off this build;
//   • no locale key or string names another portal;
//   • the build goes to its own folder — never `dist/`, where the other
//     portals' archives (the pending Poki upload) live — and is packed as a
//     real PKZIP by Node, with the Bridge SDK pinned into its own chunk.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drainAndResetModules, drainPersist } from '../stubs/drainPersist'
import { DEV_TOOL_MARKERS, DEV_TOOL_STUBS, devToolAliases, resolvePlatformPolicy } from '@/platforms/policy'
import { PLAYGAMA_BRIDGE_CHUNK, PLAYGAMA_OUT_DIR, PLAYGAMA_RELEASE_DIR, PLAYGAMA_ZIP } from '@/platforms/playgama/release'

const ROOT = resolve(__dirname, '..', '..')
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8')
/** Source minus comments — a stub may EXPLAIN the marker it removes. */
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('policy: the Playgama release is a clean build', () => {
  it('ships no dev tooling, and keeps every layout rule of the web build', () => {
    expect(resolvePlatformPolicy({ isPoki: false, isPlaygama: true })).toEqual({ freeOptionFirst: false, devTools: false })
  })

  it('aliases exactly the two dev-tool modules to their stubs', () => {
    expect(devToolAliases(resolvePlatformPolicy({ isPoki: false, isPlaygama: true }))).toEqual({ ...DEV_TOOL_STUBS })
  })

  it('the QA twin (VITE_QA_TOOLS) keeps the tooling — and is refused by the gate', () => {
    expect(resolvePlatformPolicy({ isPoki: false, isPlaygama: true, qaTools: true }).devTools).toBe(true)
  })

  it('leaves Poki and every other build exactly as they were', () => {
    expect(resolvePlatformPolicy({ isPoki: true })).toEqual({ freeOptionFirst: true, devTools: false })
    expect(resolvePlatformPolicy({ isPoki: false })).toEqual({ freeOptionFirst: false, devTools: true })
  })
})

describe('DEV_TOOL_MARKERS: the gate\'s evidence that the aliases took', () => {
  it('each marker lives in its real module and in no stub', () => {
    const stubs = Object.values(DEV_TOOL_STUBS).map((p) => code(read(p)))
    for (const { text, why } of DEV_TOOL_MARKERS) {
      const src = /src\/[\w/.-]+\.ts/.exec(why)?.[0]
      expect(src, `${text}: name its module in "why"`).toBeTruthy()
      expect(read(src!), `${text} is not in ${src}`).toContain(text)
      for (const s of stubs) expect(s).not.toContain(text)
    }
  })

  it('covers everything the Poki release gate refuses', async () => {
    const poki = (await import(pathToFileURL(resolve(ROOT, 'tools/poki-deploy/poki.config.mjs')).href)).default
    const ours = DEV_TOOL_MARKERS.map((m) => m.text)
    for (const { text } of poki.forbidInBundle) expect(ours).toContain(text)
  })
})

describe('vite.config.ts: resolved once, for this build', () => {
  const cfg = read('vite.config.ts')

  it('resolves the policy with the Playgama flag, and hands the RESULT to the app', () => {
    const flag = cfg.indexOf("const isPlaygamaBuild = env.VITE_APP_PLAYGAMA === 'true'")
    const call = cfg.indexOf('resolvePlatformPolicy({')
    expect(flag).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(flag)
    expect(cfg).toMatch(/__PLATFORM_POLICY__: JSON\.stringify\(platformPolicy\)/)
  })

  it('the app does not re-resolve it from the env (that would ship the resolver)', () => {
    const caps = code(read('src/platforms/capabilities.ts'))
    expect(caps).toMatch(/export const platformPolicy[^\n]*__PLATFORM_POLICY__/)
    expect(caps).not.toMatch(/resolvePlatformPolicy\(\{/)
  })

  it('gives Playgama its own outDir, and pins the Bridge SDK into its own chunk — Playgama only', () => {
    expect(cfg).toMatch(/\.\.\.\(isPlaygama \? \{ outDir: PLAYGAMA_OUT_DIR \} : \{\}\)/)
    // manualChunks exists on the Playgama build only…
    const chunks = /\.\.\.\(isPlaygama\s*\?\s*\{\s*manualChunks: \(id: string\) => \{([\s\S]*?)\n\s*\}\s*\}\s*: \{\}\)/.exec(cfg)
    expect(chunks, 'manualChunks is not Playgama-only').not.toBeNull()
    const body = chunks![1]!
    // …the Bridge SDK goes into its honestly named chunk, first…
    expect(body).toMatch(/^\s*if \(id\.includes\('@playgama\/bridge'\)\) return PLAYGAMA_BRIDGE_CHUNK/)
    // …three.js into two chunks of its own (every file < 512 KiB for YouTube
    // Playables), and nothing else is grouped.
    expect(body).toMatch(/three\\\.core\\\.js\$\/\.test\(id\)\) return 'three-core'/)
    expect(body).toMatch(/\/node_modules\[\\\\\/\]three\[\\\\\/\]\/\.test\(id\)\) return 'three'/)
    expect(body).toMatch(/return undefined\s*$/)
  })
})

describe('the release goes to its own folder, packed by Node', () => {
  it('never writes into dist/, and the zip sits beside the build folder, not inside it', () => {
    for (const p of [PLAYGAMA_OUT_DIR, PLAYGAMA_ZIP]) {
      expect(p.split('/')[0]).toBe(PLAYGAMA_RELEASE_DIR)
      expect(p === 'dist' || p.startsWith('dist/')).toBe(false)
    }
    expect(PLAYGAMA_ZIP.startsWith(`${PLAYGAMA_OUT_DIR}/`)).toBe(false)
    expect(PLAYGAMA_BRIDGE_CHUNK).toBe('playgama-bridge')
  })

  it('the release folder is gitignored', () => {
    expect(read('.gitignore')).toMatch(new RegExp(`^/${PLAYGAMA_RELEASE_DIR}/$`, 'm'))
  })

  it('build:playgama packs with the Node PKZIP writer and runs the gates — no tar, no dist/', () => {
    const script: string = JSON.parse(read('package.json')).scripts['build:playgama']
    expect(script).toMatch(/vite build --mode playgama --base=\.\//)
    expect(script.trim().endsWith('node tools/playgama-release/release.mjs')).toBe(true)
    expect(script).not.toMatch(/\btar\b/)
    expect(script).not.toMatch(/\bdist[\\/]|--outDir/)
  })
})

describe('no other portal named in the game\'s own code paths', () => {
  it('the CrazyGames misconfiguration check is compiled out of the Playgama build', () => {
    const main = read('src/main.ts')
    const at = main.indexOf('const looksLikeCrazyGamesPortal')
    const guard = main.lastIndexOf('if (', at)
    expect(main.slice(guard, at)).toContain("import.meta.env.VITE_APP_PLAYGAMA !== 'true'")
  })

  it('the vConsole button is chosen by a build-time ternary, not a v-if on a flag', () => {
    const app = read('src/App.vue')
    expect(app).toMatch(/const VConsoleHide = import\.meta\.env\.VITE_APP_NATIVE === 'true' \|\| import\.meta\.env\.VITE_APP_INCLUDE_VCONSOLE === 'true'\s*\? VConsoleHideButton\s*: null/)
    expect(app).toMatch(/component\(v-if="VConsoleHide" :is="VConsoleHide"\)/)
    expect(app).not.toMatch(/^\s*VConsoleHideButton\b/m)
  })

  it('no locale key or string names another portal', async () => {
    const { FOREIGN_PORTALS } = await import(pathToFileURL(resolve(ROOT, 'tools/playgama-release/gates.mjs')).href)
    const dir = resolve(ROOT, 'src/i18n/locales')
    const hits: string[] = []
    for (const f of readdirSync(dir)) {
      const src = readFileSync(resolve(dir, f), 'utf8')
      for (const { portal, re } of FOREIGN_PORTALS as Array<{ portal: string; re: RegExp }>) {
        const m = re.exec(src)
        if (m) hits.push(`${f}: ${portal} (${src.slice(Math.max(0, m.index - 20), m.index + 30)})`)
      }
    }
    expect(hits).toEqual([])
  })
})

describe('the render gate folds to "always render" on Playgama', () => {
  afterEach(() => {
    drainPersist()
    vi.unstubAllEnvs()
    vi.doUnmock('@/platforms/capabilities')
  })

  const gateWith = async (playgama: boolean) => {
    drainAndResetModules()
    if (playgama) vi.stubEnv('VITE_APP_PLAYGAMA', 'true')
    const resolveCapabilities = vi.fn(() => ({
      isNotPlatformBuild: true,
      allowedToShowOnCrazyGames: false, allowedToShowOnWaveDash: false, allowedToShowOnItch: false,
      allowedToShowOnGlitch: false, allowedToShowOnGameDistribution: false, allowedToShowOnPlaygama: true,
      allowedToShowOnGamepix: false, allowedToShowOnGameMonetize: false, allowedToShowOnYandex: false,
      allowedToShowOnPoki: false, isGlitchDenied: false, showOnlyAvailableText: false
    }))
    vi.doMock('@/platforms/capabilities', () => ({
      resolveCapabilities,
      platformPolicy: { freeOptionFirst: false, devTools: !playgama }
    }))
    const { useRenderGate } = await import('@/platforms/renderGate')
    const gate = useRenderGate()
    void gate.isGameShowAllowed.value
    return { gate, resolveCapabilities }
  }

  it('renders unconditionally, without consulting any other portal\'s gate', async () => {
    const { gate, resolveCapabilities } = await gateWith(true)
    expect(gate.isGameShowAllowed.value).toBe(true)
    expect(gate.isLicenseDenied.value).toBe(false)
    expect(gate.showOnlyAvailableText.value).toBe(false)
    expect(resolveCapabilities).not.toHaveBeenCalled()
  })

  it('every other build still resolves the capabilities', async () => {
    const { resolveCapabilities } = await gateWith(false)
    expect(resolveCapabilities).toHaveBeenCalled()
  })
})

describe('the audit script ships with the repo', () => {
  it('scripts/youtube-fit-audit.mjs is present (pnpm playgama:audit)', () => {
    expect(existsSync(resolve(ROOT, 'scripts/youtube-fit-audit.mjs'))).toBe(true)
    expect(JSON.parse(read('package.json')).scripts['playgama:audit']).toMatch(/youtube-fit-audit\.mjs .*--dist dist-playgama\/game .*--zip dist-playgama\/chaos-machine-playgama\.zip/)
  })
})
