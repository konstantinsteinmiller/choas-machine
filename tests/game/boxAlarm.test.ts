// The disguise room's alarm post (owner: a player caught by the searchlight
// did not see why the room started over). Caught, the post by the way out goes
// off and the view pulses red for three seconds; then the room starts over and
// the red is gone. A drill: the base's real alarm is never raised.

import { describe, expect, it } from 'vitest'
import { Mesh, PerspectiveCamera, Scene, type MeshBasicMaterial } from 'three'
import { LESSON_IDS, buildTrainingGround } from '@/game/data/fortresses/training'
import { BOX_ALARM_S, CAUGHT_S, makeTraining, roomAt, stepAlarm, stepTraining, entryOf, type TrainingContext } from '@/game/sim/training'
import { TrainingDirector } from '@/game/sim/trainingDirector'
import { makeGarrison, spotCentre, stepGarrison, type Target } from '@/game/sim/garrison'
import type { BeaconView } from '@/game/models/beacon'

const BOX = LESSON_IDS.indexOf('box')
const DT = 1 / 30
const ctx = (x: number, z: number): TrainingContext => ({
  x, y: 0, z, bladeKills: 0, sniperKills: 0, rockets: 0, overheats: 0, zooms: 0, sabotaged: 0, piles: 0,
  supplies: 0, stocked: false, burns: 0, ropes: 0
})

describe('the disguise room\'s alarm post', () => {
  it('caught: it goes off, rings for three seconds, then the room starts over', () => {
    const t = makeTraining()
    t.room = BOX
    expect(stepAlarm(t, false, DT)).toBe('off')
    expect(stepAlarm(t, true, DT)).toBe('start')
    let rang = 0
    let step = stepAlarm(t, true, DT)
    // Still seen or not, it rings its time out: no reset in between.
    while (step === 'ring') { rang += DT; step = stepAlarm(t, rang < 1, DT) }
    expect(step).toBe('reset')
    expect(rang).toBeGreaterThan(BOX_ALARM_S - 0.1)
    expect(rang).toBeLessThan(BOX_ALARM_S + 0.1)
    expect(BOX_ALARM_S).toBe(3)
    expect(t.alarmT).toBe(-1)
    expect(stepAlarm(t, false, DT)).toBe('off')
  })

  it('anywhere else, seen holds the mech CAUGHT_S to see it (no alarm post), then the room starts over', () => {
    // The owner: scoped in when seen, the room started over under the player, still zoomed.
    const t = makeTraining()
    t.room = LESSON_IDS.indexOf('cover')
    expect(stepAlarm(t, true, DT)).toBe('start')
    let held = 0
    let step = stepAlarm(t, true, DT)
    while (step === 'ring') { held += DT; step = stepAlarm(t, false, DT) }
    expect(step).toBe('reset')
    expect(held).toBeGreaterThan(CAUGHT_S - 0.1)
    expect(held).toBeLessThan(CAUGHT_S + 0.1)
    expect(CAUGHT_S).toBe(2)
    expect(t.alarmT).toBe(-1)
  })

  it('the mission holds the caught mech: out of the scope and the box, still, and not shot while held', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/game/sim/mission.ts', 'utf8')
    // Nothing comes up, nothing moves, nobody fires, and the box and the touch zoom latch come off at the start.
    expect(src).toMatch(/weaponUp\(\): boolean \{[\s\S]{0,200}this\.caught\(\)/)
    expect(src).toContain("this.cine?.kind === 'lesson' || this.caught()")
    expect(src).toContain('if (!this.caught()) stepFire(')
    expect(src).toMatch(/alarm === 'start'\) \{[\s\S]{0,300}p\.boxed = false[\s\S]{0,200}this\.input\.aimLatched = false/)
  })

  it('walking into the next room silences it', () => {
    const t = makeTraining()
    const e = entryOf(BOX)
    stepTraining(t, ctx(e.x, e.z), DT)
    expect(t.room).toBe(BOX)
    stepAlarm(t, true, DT)
    expect(t.alarmT).toBeGreaterThan(0)
    const n = entryOf(BOX + 1)
    stepTraining(t, ctx(n.x, n.z), DT)
    expect(t.alarmT).toBe(-1)
  })

  it('on screen: the post\'s beam turns and the view goes red while it rings, and all of it is gone after', () => {
    const f = buildTrainingGround()
    const d = new TrainingDirector(new Scene(), f, makeGarrison(f, 1)) as unknown as TrainingDirector & {
      state: { room: number }; alarmPost: BeaconView; alarmWash: Mesh
    }
    const cam = new PerspectiveCamera()
    d.state.room = BOX
    d.cullRooms()
    d.update(DT, 0, cam)
    expect(d.alarmPost.group.visible).toBe(true)
    expect(d.alarmPost.beam.visible).toBe(false)
    expect(d.alarmWash.visible).toBe(false)
    d.alarm(true)
    d.update(DT, 0.1, cam)
    expect(d.alarmPost.beam.visible).toBe(true)
    expect(d.alarmWash.visible).toBe(true)
    expect((d.alarmWash.material as MeshBasicMaterial).opacity).toBeGreaterThan(0)
    d.alarm(false)
    d.update(DT, 0.2, cam)
    expect(d.alarmPost.beam.visible).toBe(false)
    expect(d.alarmWash.visible).toBe(false)
    // Out of the rooms drawn, the post is not drawn at all.
    d.state.room = 0
    d.cullRooms()
    d.update(DT, 0.3, cam)
    expect(d.alarmPost.group.visible).toBe(false)
  })

  it('a drill: the searchlight that catches the mech raises no real alarm, however long it holds it', () => {
    const f = buildTrainingGround()
    const gar = makeGarrison(f, 1)
    gar.drill = true
    const lamp = gar.units.find(u => u.kind === 'searchlight' && roomAt(u.homeX) === BOX)!
    let caught = false
    for (let k = 0; k < (BOX_ALARM_S + 3) / DT; k++) {
      const c = spotCentre(lamp)
      const mech: Target = { x: c.x, y: 0, z: c.z, height: 2.6, crouched: false, visible: true, moving: 1 }
      stepGarrison(gar, f.grid, mech, DT)
      caught ||= lamp.state === 'combat'
    }
    expect(caught).toBe(true)
    expect(gar.alert.chaos).toBe(false)
  })
})
