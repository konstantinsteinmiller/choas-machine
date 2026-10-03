import { aimAt, behind, boot, budget, fight, forceKillcam, freeze, hands, logState, loot, roll, settled, takeDownBoss, unit, vantage } from './_drive.mjs'

/**
 * SUCCESS, the long cut (30 s; CrazyGames' 16 s takes the same story without
 * its middle): the whole mission in miniature.
 *
 *    0–5    scoped on the perch: the shot, the camera riding the round, the x-ray
 *    5–9    the yard: the blade from behind
 *    9–16   a decoy pulls a patrol together; a rocket answers; the alarm      (30 s only)
 *   16–22   the minigun against what comes running                           (30 s only)
 *   22–27   the Warden on the roof: a boss, so round after round into his helm
 *   27–30   a pile stripped; the run for the pad; the robo dog takes the mech out
 */
let sentryId = -1

export default {
  id: 'success-30s',
  label: 'The whole job: quiet, then loud, then out',
  urlParams: { level: '2' },

  async setup(ctx) {
    await boot(ctx)
    const sentry = await unit(ctx, 'sentry', 0)
    sentryId = sentry.id
    await hands.crouch(ctx)
    await ctx.wait(500)
    await hands.aim(ctx, true)
    await ctx.wait(700)
    await aimAt(ctx, sentryId, 1)
    await ctx.evaluate(() => window.__preview.nudge(0.04, 0.014))
    await freeze(ctx)
  },

  async record(ctx) {
    const t = budget(ctx)
    const long = ctx.durationMs >= 24_000
    await roll(ctx)
    ctx.beat('scoped')

    // ── The first shot ──
    await aimAt(ctx, sentryId, 700)
    await forceKillcam(ctx)
    await hands.fire(ctx)
    await hands.aim(ctx, false)
    await ctx.stepUntil(() => window.__preview.state().kills >= 1, { timeoutMs: 4000 })
    ctx.beat('poster')
    await ctx.stepUntil(() => !window.__preview.state().cine, { timeoutMs: 4000 })
    await logState(ctx, 'the first shot')

    // ── The blade ──
    const guard = await unit(ctx, 'guard', 0)
    await behind(ctx, guard.id, 2.8)
    await hands.move(ctx, 0, 1)
    await ctx.stepUntil(() => window.__preview.state().strike !== '', { timeoutMs: 1800 })
    await hands.move(ctx, 0, 0)
    await forceKillcam(ctx)
    await hands.act(ctx)
    await ctx.stepUntil(() => window.__preview.state().bladeKills >= 1, { timeoutMs: 2000 })
    await settled(ctx)
    await logState(ctx, 'the blade')

    if (long) {
      // ── The decoy and the rocket ──
      const other = await unit(ctx, 'guard', 0)
      await ctx.evaluate(([id]) => window.__preview.inFrontOf(id, 15), [other.id])
      await hands.crouch(ctx)
      await ctx.wait(250)
      await hands.decoy(ctx)
      await ctx.wait(2600)
      await hands.weapon(ctx, 3)
      await ctx.wait(450)
      await hands.aim(ctx, true)
      await aimAt(ctx, other.id, 500)
      await hands.fire(ctx)
      await hands.aim(ctx, false)
      await ctx.stepUntil(() => window.__preview.state().chaos, { timeoutMs: 2500 })
      await ctx.wait(900)
      await logState(ctx, 'the rocket')

      // ── The minigun ──
      await hands.weapon(ctx, 2)
      await ctx.wait(450)
      // Until the Commander's beat is due: 9.5 s before the end.
      await fight(ctx, t, ctx.durationMs - 9500, { armor: 0.9 })
      await logState(ctx, 'the minigun')
      await hands.weapon(ctx, 1)
      await ctx.wait(450)
    }

    // ── The Warden: a boss, so it takes more than one ──
    const boss = await unit(ctx, 'commander', 0)
    await vantage(ctx, boss.id, 26)
    await ctx.wait(120)
    await takeDownBoss(ctx, boss.id, 750)
    await logState(ctx, 'the Warden is down')
    // ── The haul: one pile on camera, the rest off it ──
    await loot(ctx)
    await ctx.evaluate(() => window.__preview.takeSalvage())

    // ── Out ── (the lift takes about five seconds: start it that far from the end)
    await t.until(ctx.durationMs - 5600)
    // The way out: onto the pad, and the line comes down.
    await ctx.evaluate(() => window.__preview.nearExit(7))
    await hands.move(ctx, 0, 1)
    await ctx.stepUntil(() => window.__preview.state().phase !== 'play', { timeoutMs: 2500 })
    await hands.move(ctx, 0, 0)
    await t.until(ctx.durationMs)
  }
}
