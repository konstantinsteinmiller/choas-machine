/**
 * ─── Driving Chaos Machine ───────────────────────────────────────────────────
 *
 * Everything game-specific lives here, so the scenario modules read as beat
 * sheets. `record.mjs` and `lib/` are the pipeline's, copied verbatim; this
 * file, `preview.config.mjs` and `scenarios/*` are the game's half.
 *
 * ── The seam ──
 *
 *   window.__preview   `src/game/preview.ts`, DEV only, published under
 *                      `?preview=1` (which every recording URL carries).
 *
 * It stages the game instead of playing ten minutes to get there: put the
 * mech somewhere, point the camera at a defender, hold the trigger. The
 * verdicts are the simulation's own: a round is cast through the real
 * hit-scan, a guard notices through the real cones.
 *
 * ── Determinism ──
 *
 * The recorder seeds `Math.random` and owns the clock from `arm()` on. The
 * staging in `setup()` runs in real time, so each scenario ends its setup by
 * FREEZING the simulation at a known state (`freeze`) and the take starts by
 * letting it go (`roll`).
 */

/**
 * Boot to the point where the player has control. The threat level is the
 * scenario's own URL parameter (`urlParams: { level: '3' }`): the dev build
 * reads it at boot.
 */
export const boot = async (ctx) => {
  await ctx.waitFor(() => !!window.__preview, null, { timeout: 120_000 })
  await ctx.evaluate(() => window.__preview.begin())
  await ctx.waitFor(() => window.__preview.ready(), null, { timeout: 120_000 })
  // The drop-in's dust and the loader's fade are gone a moment later.
  await ctx.wait(400)
}

/** Hold the simulation still (setup ends here) and let it go (the take starts). */
export const freeze = (ctx) => ctx.evaluate(() => window.__preview.freeze(true))
export const roll = (ctx) => ctx.evaluate(() => window.__preview.freeze(false))

/** Put the mech somewhere, looking along `yaw` (radians, 0 = south). */
export const place = (ctx, x, z, yaw, pitch = -0.08, crouched = false) =>
  ctx.evaluate(([px, pz, y, p, c]) => window.__preview.place(px, pz, y, p, c), [x, z, yaw, pitch, crouched])

/** Stand the mech `back` metres behind a defender, facing its back. */
export const behind = (ctx, id, back = 1.6) => ctx.evaluate(([i, b]) => window.__preview.behind(i, b), [id, back])

/** Wait for a strike or a kill-cam to let go of the mech (it moves it). */
export const settled = (ctx) => ctx.stepUntil(() => !window.__preview.state().busy, { timeoutMs: 4000 })

/** Stand with a clear line to a defender's head, about `want` metres away. */
export const vantage = async (ctx, id, want = 30, crouched = true) => {
  if (ctx.phase === 'record') await settled(ctx)
  const ok = await ctx.evaluate(([i, w, c]) => window.__preview.vantage(i, w, c), [id, want, crouched])
  if (!ok) ctx.log.warn(`no vantage on unit ${id} at ~${want} m`)
  return ok
}

/** The first living defender of a kind (optionally the nth). */
export const unit = (ctx, kind, n = 0) => ctx.evaluate(([k, i]) => window.__preview.unit(k, i), [kind, n])

/** Swing the camera onto a defender's head over `ms` of the clip. */
export const aimAt = async (ctx, id, ms = 600) => {
  await ctx.evaluate(([i, d]) => window.__preview.aimAt(i, d), [id, ms])
  await ctx.wait(ms)
}

/** Turn the camera to an absolute heading over `ms`. */
export const pan = async (ctx, yaw, pitch, ms) => {
  await ctx.evaluate(([y, p, d]) => window.__preview.pan(y, p, d), [yaw, pitch, ms])
  await ctx.wait(ms)
}

/** The hands: what a player's thumbs and buttons would do. */
export const hands = {
  aim: (ctx, on) => ctx.evaluate((v) => window.__preview.aim(v), on),
  fire: (ctx) => ctx.evaluate(() => window.__preview.fire()),
  trigger: (ctx, on) => ctx.evaluate((v) => window.__preview.trigger(v), on),
  act: (ctx) => ctx.evaluate(() => window.__preview.act()),
  decoy: (ctx) => ctx.evaluate(() => window.__preview.decoy()),
  weapon: (ctx, n) => ctx.evaluate((v) => window.__preview.weapon(v), n),
  move: (ctx, x, y) => ctx.evaluate(([mx, my]) => window.__preview.move(mx, my), [x, y]),
  crouch: (ctx) => ctx.evaluate(() => window.__preview.crouch())
}

/**
 * One scoped shot at a defender's head, shown by the kill-cam. Waits for the
 * scope to be fully in before it settles the reticle: a round fired on the
 * way in still has the hip's spread and misses on some takes. Tries once more
 * if the first round missed.
 */
export const snipe = async (ctx, id, ms = 600) => {
  const before = (await snapshot(ctx)).kills
  const hp = () => ctx.evaluate((u) => window.__game.app.mode.garrison.units[u].hp, id)
  for (let attempt = 0; attempt < 2; attempt++) {
    const hpBefore = await hp()
    await hands.aim(ctx, true)
    await ctx.stepUntil(() => window.__preview.state().scoped, { timeoutMs: 1500 })
    await aimAt(ctx, id, attempt ? 300 : ms)
    ctx.log.info(`aim: ${await ctx.evaluate((i) => window.__preview.aimReport(i), id)}`)
    await forceKillcam(ctx)
    await hands.fire(ctx)
    await ctx.wait(150)
    // A round the kill-cam is following has not landed yet: it is a hit.
    const s = await snapshot(ctx)
    // A boss takes the round and stands: that is a hit too.
    if (s.cine || s.kills > before || (await hp()) < hpBefore) break
    ctx.log.warn(`the round at unit ${id} missed${attempt ? '' : ': once more'}`)
    await ctx.wait(700)
  }
  await hands.aim(ctx, false)
  await ctx.stepUntil(() => !window.__preview.state().cine, { timeoutMs: 4000 })
}

/**
 * Kneel at the nearest pile of salvage and strip it, on camera: the sparks,
 * the amber ring, the count going up.
 */
export const loot = async (ctx) => {
  const before = (await snapshot(ctx)).salvage
  if (!(await ctx.evaluate(() => window.__preview.atPile()))) { ctx.log.warn('no pile to strip'); return }
  await ctx.wait(80)
  await hands.act(ctx)
  await ctx.stepUntil((n) => window.__preview.state().salvage > n, { timeoutMs: 2500, arg: before })
}

/**
 * The Warden is a boss: no single round drops him. Rounds into his helm until
 * he goes down, the kill-cam on the last one.
 */
export const takeDownBoss = async (ctx, id, ms = 600) => {
  for (let i = 0; i < 6; i++) {
    const alive = await ctx.evaluate((u) => window.__game.app.mode.garrison.units[u].state !== 'dead', id)
    if (!alive) return
    await snipe(ctx, id, i ? 260 : ms)
    await ctx.wait(350)
  }
}

/**
 * A firefight: hold the trigger and keep the reticle on whoever is nearest in
 * sight, until `untilMs` on the clip's clock or the mech is down. `armor`
 * keeps the mech at that share of its armor while it lasts, so the verdict
 * falls where the beat sheet wants it and not where the dice do.
 */
export const fight = async (ctx, t, untilMs, { armor = null } = {}) => {
  await hands.trigger(ctx, true)
  let sweep = 1
  while (t.now() < untilMs) {
    if (armor != null) await ctx.evaluate((a) => window.__preview.fragile(a), armor)
    const s = await snapshot(ctx)
    if (s.phase !== 'play') break
    const id = await ctx.evaluate(() => window.__preview.nearest())
    if (id >= 0) await aimAt(ctx, id, 320)
    else { await pan(ctx, s.yaw + 0.35 * sweep, -0.03, 420); sweep = -sweep }
  }
  await hands.trigger(ctx, false)
}

/** The next kill gets the kill-cam, whatever the dice say. */
export const forceKillcam = (ctx) => ctx.evaluate(() => window.__preview.forceKillcam())

/** What the game says is going on: one line per beat goes into the log. */
export const snapshot = (ctx) => ctx.evaluate(() => window.__preview.state())
export const logState = async (ctx, label) => {
  const s = await snapshot(ctx)
  ctx.log.info(`${label}: kills ${s.kills} (head ${s.headshots}, blade ${s.bladeKills}), alert ${s.alert}/5${s.chaos ? ' CHAOS' : ''}, armor ${s.armor}, phase ${s.phase}, objective ${s.objective}`)
  return s
}

/** A budget on the clip's own clock: `await t.until(ms)` waits to that mark. */
export const budget = (ctx) => {
  const start = ctx.frame()
  const now = () => ((ctx.frame() - start) * 1000) / ctx.fps
  return {
    now,
    until: async (ms) => { const left = ms - now(); if (left > 0) await ctx.wait(left) }
  }
}
