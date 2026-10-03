import { aimAt, behind, boot, budget, forceKillcam, freeze, hands, logState, loot, roll, settled, unit, vantage } from './_drive.mjs'

/**
 * SUCCESS, the short cut (10 s, and Poki's 5 s square): "one shot, one blade".
 *
 * The mechanic a screenshot cannot show is the kill-cam: the round leaving the
 * barrel, the camera riding it across the base, the x-ray flash.
 *
 *   0.0–0.6  already scoped on the perch, the reticle settling on a sentry
 *   0.6–3.4  the shot: the camera rides the round in; the x-ray; he falls
 *   3.4–4.6  cut to the yard: the mech crouched behind a patrolling guard
 *   4.6–6.4  the blade
 *   6.4–8.6  a pile of salvage: the mech kneels and strips it, sparks and all
 *   8.6–10   the way out is open; the mech runs for the pad
 *
 * Poki's 5 s cut is the first shot alone.
 */
let sentryId = -1

export default {
  id: 'success',
  label: 'One shot, one blade',
  urlParams: { level: '2' },

  async setup(ctx) {
    await boot(ctx)
    const sentry = await unit(ctx, 'sentry', 0)
    // The rebuilt Bastion hides most of the base from the perch: stand where the line is clear.
    await vantage(ctx, sentry.id, 30)
    await hands.crouch(ctx)
    await ctx.wait(500)
    await hands.aim(ctx, true)
    await ctx.wait(700)
    // Open a little off the target, so frame 0 is a reticle in motion.
    await aimAt(ctx, sentry.id, 1)
    await ctx.evaluate(() => window.__preview.nudge(0.035, 0.012))
    await freeze(ctx)
    sentryId = sentry.id
  },

  async record(ctx) {
    const t = budget(ctx)
    await roll(ctx)
    ctx.beat('scoped')
    await aimAt(ctx, sentryId, 520)
    await forceKillcam(ctx)
    await hands.fire(ctx)
    await hands.aim(ctx, false)
    // The round's flight, the x-ray, the fall.
    await ctx.stepUntil(() => window.__preview.state().kills >= 1, { timeoutMs: 4000 })
    ctx.beat('poster')
    await ctx.stepUntil(() => !window.__preview.state().cine, { timeoutMs: 4000 })
    await logState(ctx, 'after the first shot')
    if (ctx.format.id === 'poki') { await t.until(ctx.durationMs); return }

    // The yard: behind a guard on his round.
    const guard = await unit(ctx, 'guard', 0)
    await behind(ctx, guard.id, 2.6)
    await hands.move(ctx, 0, 1)
    await ctx.stepUntil(() => window.__preview.state().strike !== '', { timeoutMs: 1500 })
    await hands.move(ctx, 0, 0)
    await forceKillcam(ctx)
    await hands.act(ctx)
    await ctx.stepUntil(() => window.__preview.state().bladeKills >= 1, { timeoutMs: 2000 })
    await settled(ctx)
    await logState(ctx, 'after the blade')

    // What the raid is for: a pile, stripped on camera; the rest off it.
    await loot(ctx)
    await ctx.evaluate(() => window.__preview.takeSalvage())
    await logState(ctx, 'the salvage is in hand')

    // End in motion: the run for the pad.
    await ctx.evaluate(() => window.__preview.nearExit(3.5))
    await hands.move(ctx, 0, 1)
    await t.until(ctx.durationMs)
  }
}
