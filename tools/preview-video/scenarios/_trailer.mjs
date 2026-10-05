import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { boot, freeze, roll } from './_drive.mjs'

/**
 * ─── The cinematic trailer's shots (#X1) ─────────────────────────────────────
 *
 * Every shot of `pnpm cinematic-trailer` is its own scenario
 * (`scenarios/trailer-<id>.mjs`, one line each) so it gets its own page, its
 * own fortress and threat level, and a setup that stages it in real time
 * before the take. The take records the shot with handles (the `trailer`
 * format's 7 s); `trailer/edit.mjs` decides which part of it is cut in.
 *
 * Every shot also writes the sounds the game played during the take, on the
 * take's own clock: `trailer/build.mjs` replays them through the game's own
 * synthesizers and mixer offline, so the trailer's sound is the game's sound,
 * in sync to the frame.
 *
 * The enemies play themselves: a shot only chooses where the mech stands,
 * where the director's camera is and what the mech's hands do. Pins (holding
 * a defender at a spot) are for the setup only and let go before the take.
 */

export const SHOTS_DIR = join(process.cwd(), 'preview-videos', 'trailer', 'shots')

/** Page helpers, installed in the setup: `window.__t`. */
export const helpers = (ctx) => ctx.evaluate(async () => {
  const grid = await import('/src/game/world/grid.ts')
  // No take ends early because the mech went down.
  const { god } = await import('/src/game/state/god.ts')
  god.on = true
  const m = window.__game.app.mode
  const P = window.__preview
  window.__t = {
    m, P, grid,
    ground: (x, z) => grid.heightAt(m.fortress.grid, x, z),
    /** The nth living defender of a kind. */
    unit: (kind, n = 0) => m.garrison.units.filter(u => u.kind === kind && u.state !== 'dead' && u.state !== 'reserve')[n],
    /** Hold unit `u` at (x, z) facing (fx, fz), until `P.unpin()`. */
    pin: (u, x, z, fx, fz) => P.pin(u.id, x, z, Math.atan2(fx - x, fz - z)),
    /** The mech at (x, z) facing (fx, fz). */
    mech: (x, z, fx, fz, crouched = false) => { const yaw = Math.atan2(fx - x, fz - z); P.place(x, z, yaw, -0.05, crouched); m.cam.yaw = yaw },
    /** A director's camera at p looking at l; pulled in front of any wall between. */
    clear: (px, py, pz, lx, ly, lz) => {
      const dx = px - lx, dy = py - ly, dz = pz - lz, l = Math.hypot(dx, dy, dz)
      const h = grid.raycast(m.fortress.grid, lx, ly, lz, dx / l, dy / l, dz / l, l)
      const t = h.hit ? Math.max(1.5, h.t - 0.5) : l
      return { px: lx + dx / l * t, py: ly + dy / l * t, pz: lz + dz / l * t, lx, ly, lz }
    },
    cam: (px, py, pz, lx, ly, lz, fov = 50) => P.shot({ ...window.__t.clear(px, py, pz, lx, ly, lz), fov }),
    weapon: (w) => { const a = m.arsenal; a.current = w; a.switching = 0; a.rocketLoaded = true; a.minigunBelt = a.minigunBeltMax; a.heat = 0; a.overheated = false },
    /** No "?" or "!" over anyone yet (a shot that opens on a calm yard). */
    calm: () => { for (const u of m.garrison.units) if (u.state !== 'dead') { u.detect = 0; u.sees = false } }
  }
})

/**
 * A trailer shot. `def`:
 *   fort, level   where (URL parameters; the level is the threat level)
 *   intro         keep the drop-in (the opening shot), else it is skipped
 *   stage(ctx)    real time, before the take: put everything where it goes
 *   play(ctx, t)  the take, on the recording's clock; `t.now()` is ms into it
 */
export const shot = (id, def) => ({
  id: `trailer-${id}`,
  label: def.label ?? id,
  urlParams: { fort: def.fort ?? 'bastion', level: String(def.level ?? 1) },

  async setup(ctx) {
    if (def.intro) {
      await ctx.waitFor(() => !!window.__preview && !!window.__game?.app?.mode?.player && !document.querySelector('#static-splash'), null, { timeout: 120_000 })
    } else {
      await boot(ctx)
    }
    await helpers(ctx)
    await def.stage?.(ctx)
    await freeze(ctx)
  },

  async record(ctx) {
    const start = ctx.frame()
    const now = () => ((ctx.frame() - start) * 1000) / ctx.fps
    const t0 = await ctx.evaluate(() => { window.__preview.clearSfx(); return performance.now() })
    await roll(ctx)
    await def.play?.(ctx, { now, until: async (ms) => { const left = ms - now(); if (left > 0) await ctx.wait(left) } })
    // To the end of the take, then what was heard in it.
    const left = ctx.durationMs - now() - 1000 / ctx.fps
    if (left > 0) await ctx.wait(left)
    const sfx = await ctx.evaluate((z) => window.__preview.sfxLog().map(e => ({ ...e, t: (e.t - z) / 1000 })), t0)
    mkdirSync(SHOTS_DIR, { recursive: true })
    writeFileSync(join(SHOTS_DIR, `${id}.sfx.json`), JSON.stringify(sfx))
    ctx.log.info(`${id}: ${sfx.length} sounds`)
  }
})
