// #169: the unit frame is compact (no name printed, a portrait a quarter
// smaller, the rows close), the training's "show me again" has its key, and
// looking round is shown as a finger running an endless loop, on touch and
// on a desktop alike.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ACTIONS, DEFAULT_BINDINGS } from '@/game/engine/keyBindings'
import { HINT_GESTURE, HINT_MOUSE } from '@/components/hud/touchLook'

const src = (p: string): string => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8')

describe('the compact unit frame (#169)', () => {
  it('prints no name and has a portrait a quarter smaller', () => {
    const f = src('components/hud/UnitFrame.vue')
    expect(f).not.toMatch(/span\.name\b/)
    expect(f).not.toContain('CM-07\n')
    expect(f).toContain('--face: clamp(2.4rem, 11.25vmin, 3.675rem)')
  })
})

describe('the replay key (#169)', () => {
  it('is K by default, and no other action has K', () => {
    expect(DEFAULT_BINDINGS.replay).toEqual(['KeyK'])
    for (const a of ACTIONS) if (a !== 'replay') expect(DEFAULT_BINDINGS[a], a).not.toContain('KeyK')
  })

  it('the training button shows it and the scene listens for it', () => {
    expect(src('components/hud/TrainingHud.vue')).toContain(":hotkey=\"hud.device === 'mouse' ? 'replay' : undefined\"")
    expect(src('views/GameScene.vue')).toContain("actionForCode(e.code) === 'replay'")
  })
})

describe('looking round is the loop (#169)', () => {
  it('on touch and on a desktop', () => {
    expect(HINT_GESTURE.look).toBe('loop')
    expect(HINT_MOUSE.look).toBeUndefined()
    expect(src('components/hud/ControlHints.vue')).toContain('mode="loop"')
    expect(src('components/hud/hints/HintGlyph.vue')).toContain('mode="loop"')
  })
})
