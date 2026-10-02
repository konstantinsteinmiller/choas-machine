// @vitest-environment jsdom
// ─── Playgama: a portal language CHANGE outranks the player's choice ────────
//
// The contract (portal-platform-signals, Traps C / C2): the portal language is
// applied, never persisted into the player's key; a language the player picked
// in Options wins while the portal language is steady; and a portal language
// that CHANGED since this device last saw it clears that choice. Playgama QA's
// localization flow is exactly the last case — pick a language in-game, switch
// the QA Tool's language (which re-initialises Bridge without a reload) — and a
// "stored choice always wins" game fails it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drainAndResetModules, drainPersist, holdGameState } from '../stubs/drainPersist'

const ROOT = resolve(__dirname, '..', '..')

const load = async () => {
  drainAndResetModules()
  const m = await import('@/i18n/portalLanguage')
  await holdGameState()
  return m
}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  // Flush any armed save into THIS case's storage before it is replaced.
  drainPersist()
  localStorage.clear()
})

describe('notePortalLanguageChange — the device-local marker', () => {
  it('reports no change on the first observation, or on a repeat', async () => {
    const m = await load()
    expect(m.notePortalLanguageChange('de')).toBe(false)
    expect(m.notePortalLanguageChange('de')).toBe(false)
  })

  it('reports a switch, once', async () => {
    const m = await load()
    m.notePortalLanguageChange('de')
    expect(m.notePortalLanguageChange('ja')).toBe(true)
    expect(m.notePortalLanguageChange('ja')).toBe(false)
  })

  it('remembers across a reload on this device — beside the save, never inside it', async () => {
    let m = await load()
    m.notePortalLanguageChange('fr')
    expect(localStorage.getItem(m.PORTAL_LANGUAGE_SEEN_KEY)).toBe('fr')
    // `cm_*` keys are folded into the SYNCED state blob; the marker must not be.
    expect(m.PORTAL_LANGUAGE_SEEN_KEY.startsWith('cm_')).toBe(false)
    m = await load()
    expect(m.notePortalLanguageChange('es')).toBe(true)
  })

  it('still catches an in-session switch where storage is gone (YouTube Playables)', async () => {
    const m = await load()
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('no storage') })
    try {
      expect(m.notePortalLanguageChange('de')).toBe(false)
      expect(m.notePortalLanguageChange('pt')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('never counts a switch FROM a language this game does not ship', async () => {
    const m = await load()
    localStorage.setItem(m.PORTAL_LANGUAGE_SEEN_KEY, 'xx')
    expect(m.notePortalLanguageChange('de')).toBe(false)
  })
})

describe('followPortalLanguage — apply, never persist; a change beats a choice', () => {
  const target = (choice: string | null) => {
    const state = { choice }
    const t = {
      hasChoice: vi.fn(() => state.choice !== null),
      clearChoice: vi.fn(() => { state.choice = null }),
      apply: vi.fn()
    }
    return { state, t }
  }

  it('applies the portal language to a player who never chose one', async () => {
    const m = await load()
    const { t } = target(null)
    m.followPortalLanguage('de', t)
    expect(t.apply).toHaveBeenCalledWith('de')
    expect(t.clearChoice).not.toHaveBeenCalled()
  })

  it('leaves a choice alone while the portal language is steady', async () => {
    const m = await load()
    const { t, state } = target('en')
    m.followPortalLanguage('de', t) // first sight: steady by definition
    m.followPortalLanguage('de', t)
    expect(t.apply).not.toHaveBeenCalled()
    expect(state.choice).toBe('en')
  })

  it('QA flow: in-game English, then the portal switches to Chinese — the UI follows', async () => {
    const m = await load()
    const { t, state } = target('en')
    m.followPortalLanguage('de', t)
    m.followPortalLanguage('zh', t)
    expect(t.clearChoice).toHaveBeenCalledWith('zh')
    expect(state.choice).toBeNull()
    expect(t.apply).toHaveBeenLastCalledWith('zh')
  })

  it('ignores an unshipped or empty portal language', async () => {
    const m = await load()
    const { t } = target(null)
    m.followPortalLanguage('xx', t)
    m.followPortalLanguage(null, t)
    m.followPortalLanguage('', t)
    expect(t.apply).not.toHaveBeenCalled()
  })
})

describe('clearLanguageChoice — the portal value is shown, never stored', () => {
  it('forgets the stored choice and does not write the portal language in its place', async () => {
    drainAndResetModules()
    const gs = await holdGameState()
    const { LANGUAGE_KEY } = await import('@/keys')
    const userMod = await import('@/use/useUser')
    userMod.default().setSettingValue('language', 'en')
    expect(gs.hasState(LANGUAGE_KEY)).toBe(true)
    userMod.clearLanguageChoice('zh')
    expect(gs.hasState(LANGUAGE_KEY)).toBe(false)
    expect(userMod.default().userLanguage.value).toBe('zh')
  })

  it('survives the boot re-read of the save that follows it (the choice does not come back)', async () => {
    drainAndResetModules()
    const gs = await holdGameState()
    const { LANGUAGE_KEY } = await import('@/keys')
    const userMod = await import('@/use/useUser')
    // A choice from an earlier session, already on disk…
    userMod.default().setSettingValue('language', 'es')
    gs.flushPersist()
    // …cleared by a portal change at boot, then main.ts re-reads the blob.
    userMod.clearLanguageChoice('it')
    gs.reloadGameState()
    expect(gs.hasState(LANGUAGE_KEY)).toBe(false)
  })
})

describe('main.ts wires it on the Playgama build', () => {
  const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8')

  it('settles a switch between visits BEFORE the i18n instance exists', () => {
    const note = main.indexOf('notePortalLanguageChange(pgLocale)')
    const initial = main.indexOf('resolveInitialLocale(bootLocaleHint)')
    expect(note, 'boot check missing').toBeGreaterThan(-1)
    expect(initial).toBeGreaterThan(note)
    const guard = main.lastIndexOf("import.meta.env.VITE_APP_PLAYGAMA === 'true'", note)
    expect(note - guard, 'the boot check must sit inside the Playgama literal').toBeLessThan(200)
  })

  it('follows the language live through followPortalLanguage, and never stores it', () => {
    expect(main).toMatch(/watch\(playgamaLocale, \(code\) => followPortalLanguage\(code, \{/)
    expect(main).toMatch(/clearChoice: clearLanguageChoice/)
    // The portal locale is never seeded into the player's key, on any build.
    expect(main).not.toMatch(/portalSeed/)
    expect(main).not.toMatch(/setSettingValue\('language'/)
  })
})
