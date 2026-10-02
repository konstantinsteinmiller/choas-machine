import { boot, budget, fight, freeze, hands, logState, roll, unit } from './_drive.mjs'

/**
 * FAIL, the short cut (10 s): "one step too far".
 *
 * The loss has to look avoidable: the mech is behind cover with a guard's
 * cone sweeping past, and steps out a second too early.
 *
 *   0.0–0.6  crouched behind cover in the yard, a patrol's cone a step away
 *   0.6–3.0  it stands and walks out: the "?" fills, turns to "!"
 *   3.0–5.5  the alarm: every mark goes red, rounds come in
 *   5.5–8.2  the minigun answers and takes one down, but the armor is going
 *   8.2–10   the mech goes down
 */
export default {
  id: 'fail',
  label: 'One step too far',
  urlParams: { level: '4' },

  async setup(ctx) {
    await boot(ctx)
    const guard = await unit(ctx, 'guard', 0)
    // In front of the guard, a little way off, behind nothing.
    await ctx.evaluate(([id]) => window.__preview.inFrontOf(id, 9), [guard.id])
    await hands.crouch(ctx)
    await ctx.wait(500)
    await freeze(ctx)
  },

  async record(ctx) {
    const t = budget(ctx)
    await roll(ctx)
    ctx.beat('poster')
    // The mistake: up, and out into the open.
    await hands.crouch(ctx)
    await hands.move(ctx, 0.35, 1)
    await ctx.stepUntil(() => window.__preview.state().alert >= 1, { timeoutMs: 3500 })
    await hands.move(ctx, 0, 0)
    await logState(ctx, 'spotted')
    // Too late to hide: go loud.
    await hands.weapon(ctx, 2)
    await ctx.wait(450)
    await fight(ctx, t, ctx.durationMs - 3200, { armor: 0.5 })
    await logState(ctx, 'the fight')
    // One hit from the end.
    await fight(ctx, t, ctx.durationMs - 700, { armor: 0.001 })
    await logState(ctx, 'down')
    await t.until(ctx.durationMs)
  }
}
