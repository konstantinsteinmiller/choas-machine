import { behind, boot, budget, fight, forceKillcam, freeze, hands, logState, roll, settled, unit } from './_drive.mjs'

/**
 * FAIL, the long cut (30 s; CrazyGames' 16 s drops the first exchange): the
 * player is ahead, and throws it.
 *
 *    0–5    the blade from behind: this looks won                            (30 s only)
 *    5–10   out into the open with the minigun, a step too early: seen
 *   10–18   the alarm; the first two go down to the minigun
 *   18–25   the Enforcers power up; the barrels overheat
 *   25–30   the mech goes down
 */
export default {
  id: 'fail-30s',
  label: 'Ahead, and thrown away',
  urlParams: { level: '4' },

  async setup(ctx) {
    await boot(ctx)
    const guard = await unit(ctx, 'guard', 0)
    await behind(ctx, guard.id, 2.8)
    await ctx.wait(300)
    await ctx.evaluate(() => window.__preview.fragile(0.7))
    await freeze(ctx)
  },

  async record(ctx) {
    const t = budget(ctx)
    const long = ctx.durationMs >= 24_000
    await roll(ctx)
    ctx.beat('poster')

    if (long) {
      await hands.move(ctx, 0, 1)
      await ctx.stepUntil(() => window.__preview.state().strike !== '', { timeoutMs: 1800 })
      await hands.move(ctx, 0, 0)
      await forceKillcam(ctx)
      await hands.act(ctx)
      await ctx.stepUntil(() => window.__preview.state().bladeKills >= 1, { timeoutMs: 2000 })
      await settled(ctx)
      await logState(ctx, 'the blade: ahead')
    }

    // The mistake: stand up in the open and spin the barrels.
    const next = await unit(ctx, 'guard', 0)
    await ctx.evaluate(([id]) => window.__preview.inFrontOf(id, 11), [next.id])
    await hands.weapon(ctx, 2)
    await ctx.wait(450)
    // The fight holds until 4 s from the end; then the armor is nearly gone
    // and the next few rounds finish it.
    await fight(ctx, t, ctx.durationMs - 4000, { armor: 0.7 })
    await logState(ctx, 'the fight')
    // One hit from the end.
    await fight(ctx, t, ctx.durationMs - 800, { armor: 0.001 })
    await logState(ctx, 'the end')
    await t.until(ctx.durationMs)
  }
}
