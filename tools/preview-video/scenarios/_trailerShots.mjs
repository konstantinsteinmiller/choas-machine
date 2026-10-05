import { shot } from './_trailer.mjs'

/**
 * ─── The trailer's shot library (#X1) ────────────────────────────────────────
 *
 * One entry per shot; `trailer-<id>.mjs` exposes each to the recorder, and
 * `trailer/edit.mjs` cuts them together. Coordinates are metres. `level: 4`
 * is the rebuilt Bastion at threat IV: every kind of defender, and the open
 * strip outside its north gate (x 44 … 100, z 4 … 26, the curtain wall along
 * z 28) where most of the action is staged, as the stills (#130) were.
 *
 * God mode is on in every shot (`_trailer.mjs`): a take never ends early
 * because the mech went down. The defenders play themselves: the staging
 * picks where they stand when the take starts and lets go of them.
 */

const f = (ctx) => 1000 / ctx.fps

/** Put defenders on alert, as if they had seen the mech where it stands. */
const alarm = (ctx, ...units) => ctx.evaluate(async (list) => {
  const { alarmUnit } = await import('/src/game/sim/garrison.ts')
  const t = window.__t, m = t.m
  for (const [kind, n] of list) { const u = t.unit(kind, n); if (u) alarmUnit(m.garrison, u.id, m.player.x, m.player.z) }
}, units)

/** Keep the trigger on whoever is nearest in sight until `untilMs`. */
const hose = async (ctx, t, untilMs) => {
  await ctx.evaluate(() => window.__preview.trigger(true))
  while (t.now() < untilMs) {
    const id = await ctx.evaluate(() => window.__preview.nearest())
    if (id >= 0) { await ctx.evaluate((i) => window.__preview.aimAt(i, 240), id); await ctx.wait(280) } else await ctx.wait(200)
  }
  await ctx.evaluate(() => window.__preview.trigger(false))
}

export const SHOTS = {
  // ── The drop: the robo dog's jet board brings the mech in over the fortress ──
  drop: shot('drop', {
    fort: 'bastion', level: 1, intro: true,
    async stage(ctx) {
      await ctx.waitFor(() => { const c = window.__game.app.mode.cine; return c && c.kind === 'intro' && c.t / c.dur > 0.03 }, null, { timeout: 90_000 })
      // Placed by the game's own frame, every frame: no step behind the board.
      await ctx.evaluate(() => window.__preview.followBoard(5, 9, 4.5, 60))
    }
  }),

  // ── The fortress at rest: patrols on their rounds, vision cones, a drone ──
  yard: shot('yard', {
    level: 1,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t
        t.calm()
        t.mech(20, 140, 20, 150)
        window.__preview.dolly({ px: 34, py: 12, pz: 122, lx: 54, ly: 1, lz: 102, fov: 55 }, { px: 44, py: 10, pz: 124, lx: 58, ly: 1, lz: 99, fov: 52 }, 7000)
      })
    }
  }),

  // ── The blade: creeping up behind a posted guard, the takedown ──
  takedown: shot('takedown', {
    level: 4,
    async stage(ctx) {
      const id = await ctx.evaluate(() => { const t = window.__t; const u = t.unit('guard', 0); t.pin(u, 72, 16, 72, 30); return u.id })
      await ctx.wait(400)
      await ctx.evaluate((i) => { window.__preview.behind(i, 4.4); window.__preview.crouch() }, id)
      await ctx.wait(700)
      await ctx.evaluate(() => { window.__t.calm(); window.__preview.ride(-1, [3.4, 1.5, 1.4], [0, 1.0, 2.2], 50) })
    },
    async play(ctx) {
      // `?bs=neck|kneel|throat` picks the backstab's variant (a check of one); otherwise the dice do.
      await ctx.evaluate(() => { const v = new URLSearchParams(location.search).get('bs'); if (v) window.__preview.backstab(v); window.__preview.move(0, 0.55) })
      await ctx.stepUntil(() => window.__game.hud.strike === 'backstab', { timeoutMs: 3500 })
      // The kill is filmed by the game's own kill-cam (`backstabCam`): the director's camera lets go.
      await ctx.evaluate(() => { window.__preview.move(0, 0); window.__preview.unpin(); window.__preview.act(); window.__preview.shot(null) })
    }
  }),

  // ── The decoy: a hologram of the mech where a guard can see it; he goes to look ──
  decoy: shot('decoy', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => { const t = window.__t; t.pin(t.unit('guard', 1), 76, 15, 76, 30); t.mech(67, 11, 75, 21, true) })
      await ctx.wait(600)
      await ctx.evaluate(() => { window.__t.calm(); window.__preview.ride(-1, [2.0, 1.9, -2.2], [1.4, 1.0, 7], 50) })
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.unpin())
      await ctx.wait(500)
      await ctx.evaluate(() => { const m = window.__t.m, y = window.__t.ground(75, 21); m.throwDecoy({ x: 75, y, z: 21 }) })
    }
  }),

  // ── Off the cable onto a guard below: the assassination ──
  assassinate: shot('assassinate', {
    level: 2,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t, m = t.m, p = m.player, g = m.fortress.grid
        const c = g.cables.find(k => k.ax === 52 && k.az === 11)
        p.mode = 'cable'; p.cable = c; p.cableT = 0.87
        m.cam.yaw = Math.atan2((c.bx - c.ax), (c.bz - c.az))
      })
      await ctx.wait(300)
      const ok = await ctx.evaluate(() => {
        const t = window.__t, p = t.m.player
        for (const r of [2.5, 3.2, 4]) for (let a = 0; a < 6.28; a += 0.4) {
          const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r, h = t.ground(x, z)
          if (h > -100 && p.y - h > 1.8 && p.y - h < 8.8) {
            const u = t.unit('guard', 3)
            t.pin(u, x, z, x + Math.sin(a) * 5, z + Math.cos(a) * 5)
            t.m.cam.yaw = a; t.m.cam.pitch = -0.6
            window.__aid = u.id
            window.__preview.shot({ ...t.clear(x + 4.2, p.y - 0.2, z - 4.6, x + (p.x - x) * 0.5, h + (p.y - h) * 0.55 + 0.6, z + (p.z - z) * 0.5), fov: 62 })
            return true
          }
        }
        return false
      })
      if (!ok) throw new Error('no floor under the rope')
      await ctx.waitFor(() => window.__game.app.mode.offer?.kind === 'air', null, { timeout: 8000 })
      await ctx.evaluate(() => window.__t.calm())
    },
    async play(ctx) {
      await ctx.wait(700)
      // Off the rope the game's own kill-cam (`airCam`) films it: the director's camera lets go.
      await ctx.evaluate(() => { window.__preview.unpin(); window.__preview.act(); window.__preview.shot(null) })
    }
  }),

  // ── The sniper: scoped on a sentry, the camera riding the round ──
  snipe: shot('snipe', {
    level: 4,
    async stage(ctx) {
      const id = await ctx.evaluate(() => window.__preview.unit('sentry', 0).id)
      await ctx.evaluate((i) => window.__preview.vantage(i, 30, true), id)
      await ctx.evaluate(() => window.__preview.crouch())
      await ctx.wait(500)
      await ctx.evaluate(() => { window.__t.weapon('sniper'); window.__preview.aim(true) })
      await ctx.wait(900)
      await ctx.evaluate((i) => { window.__preview.aimAt(i, 1); window.__sid = i }, id)
      await ctx.wait(300)
      await ctx.evaluate(() => window.__t.calm())
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.aimAt(window.__sid, 500))
      await ctx.wait(700)
      await ctx.evaluate(() => { window.__preview.forceKillcam(); window.__preview.fire() })
      await ctx.wait(200)
      await ctx.evaluate(() => window.__preview.aim(false))
    }
  }),

  // ── A noise: a round into the wall beside a guard; he turns, and goes to look ──
  noise: shot('noise', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t
        t.pin(t.unit('guard', 2), 84, 22, 96, 22)
        t.mech(62, 10, 80, 27.9, true)
        t.weapon('sniper')
      })
      await ctx.wait(500)
      await ctx.evaluate(() => { window.__preview.aim(true) })
      await ctx.wait(900)
      await ctx.evaluate(() => { window.__preview.aimPoint(80, 2.4, 27.95, 1); window.__t.calm(); window.__t.cam(90, 2.1, 17.5, 82, 1.7, 25.5, 50) })
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.unpin())
      await ctx.wait(500)
      await ctx.evaluate(() => window.__preview.fire())
    }
  }),

  // ── A drone shot out of the sky, the kill-cam on it ──
  drone: shot('drone', {
    level: 4,
    async stage(ctx) {
      const id = await ctx.evaluate(() => window.__preview.unit('drone', 0).id)
      await ctx.evaluate((i) => window.__preview.vantage(i, 26, false), id)
      await ctx.wait(400)
      await ctx.evaluate(() => { window.__t.weapon('sniper'); window.__preview.aim(true) })
      await ctx.wait(900)
      await ctx.evaluate((i) => { window.__preview.aimAt(i, 1); window.__did = i; window.__t.calm() }, id)
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.aimAt(window.__did, 400))
      await ctx.wait(500)
      await ctx.evaluate(() => { window.__preview.forceKillcam(); window.__preview.fire() })
      await ctx.wait(200)
      await ctx.evaluate(() => window.__preview.aim(false))
    }
  }),

  // ── Seen: the "!", the shout, a guard runs to the alarm post and cranks it ──
  spotted: shot('spotted', {
    level: 4,
    async stage(ctx) {
      const ok = await ctx.evaluate(() => {
        const t = window.__t, m = t.m, g = m.fortress.grid, G = t.grid
        // Open floor round a beacon: the guard a few steps from it, the mech
        // about nine metres off in his plain view, on the same level.
        for (const b of m.garrison.beacons) {
          // Under open sky: the siren reads, and the camera has room.
          if (G.roofAt(g, G.toCell(b.x), G.toCell(b.z)) !== G.VOID) continue
          for (let a = 0; a < 6.28; a += 0.5) {
            const gx = b.x + Math.sin(a) * 3.5, gz = b.z + Math.cos(a) * 3.5
            const gy = t.ground(gx, gz)
            if (Math.abs(gy - b.y) > 0.2) continue
            for (let c = 0; c < 6.28; c += 0.4) {
              const mx = gx + Math.sin(c) * 9, mz = gz + Math.cos(c) * 9
              if (Math.abs(t.ground(mx, mz) - gy) > 0.2) continue
              if (!G.hasLineOfSight(g, gx, gy + 1.6, gz, mx, gy + 1.6, mz)) continue
              // The camera over the guard's shoulder: his "!" big, the mech
              // across the yard, the post beside him.
              const ux = (mx - gx) / 9, uz = (mz - gz) / 9
              const cx = gx - ux * 3.2 + uz * 2.2, cz = gz - uz * 3.2 - ux * 2.2
              if (Math.abs(t.ground(cx, cz) - gy) > 0.3) continue
              if (G.roofAt(g, G.toCell(cx), G.toCell(cz)) !== G.VOID) continue
              if (!G.hasLineOfSight(g, cx, gy + 2.2, cz, mx, gy + 1.5, mz)) continue
              const u = t.unit('guard', 3)
              window.__gid = u.id
              t.pin(u, gx, gz, mx, mz)
              t.mech(mx, mz, gx, gz)
              window.__cam = { px: cx, py: gy + 2.2, pz: cz, lx: gx + ux * 4.5, ly: gy + 1.2, lz: gz + uz * 4.5, fov: 60 }
              return true
            }
          }
        }
        return false
      })
      if (!ok) throw new Error('no open floor by a beacon')
      await ctx.wait(500)
      await ctx.evaluate(() => {
        const t = window.__t
        t.calm()
        t.m.garrison.units[window.__gid].detect = 0.55
        window.__preview.shot(window.__cam)
      })
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.unpin())
    }
  }),

  // ── The hunt: on full alert they come running ──
  chase: shot('chase', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t
        t.pin(t.unit('guard', 0), 84, 13, 60, 12)
        t.pin(t.unit('guard', 1), 87, 16.5, 60, 12)
        t.pin(t.unit('guard', 2), 88, 10, 60, 12)
        t.pin(t.unit('enforcer', 0), 92, 14, 60, 12)
        t.mech(62, 12, 86, 13)
      })
      await ctx.wait(500)
      await alarm(ctx, ['guard', 0], ['guard', 1], ['guard', 2], ['enforcer', 0])
      await ctx.evaluate(() => { const u = window.__t.unit('guard', 0); window.__preview.ride(u.id, [0.9, 1.3, 3.4], [0, 1.25, -1], 60) })
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.unpin())
    }
  }),

  // ── The minigun: the Goliath and its escort in front of it, the belt runs out on them ──
  // Over the mech's shoulder down the line of fire: the tank rolls in behind
  // the guards, the stream drops two or three of them (ragdolls), the tank
  // takes the rest.
  minigun: shot('minigun', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t
        t.pin(t.unit('goliath', 0), 77, 13, 60, 12)
        t.pin(t.unit('enforcer', 0), 72.5, 16.5, 60, 12)
        t.pin(t.unit('guard', 0), 66.5, 10.8, 60, 12)
        t.pin(t.unit('guard', 1), 67.8, 13.8, 60, 12)
        t.pin(t.unit('guard', 2), 69, 9.4, 60, 12)
        t.mech(60, 12, 72, 12)
        t.weapon('minigun')
      })
      await ctx.wait(500)
      await alarm(ctx, ['goliath', 0], ['enforcer', 0], ['guard', 0], ['guard', 1], ['guard', 2])
      await ctx.evaluate(() => { window.__preview.aim(true); window.__preview.aimAt(window.__t.unit('guard', 0).id, 1) })
      await ctx.wait(400)
      await ctx.evaluate(() => { const t = window.__t, g = t.ground(60, 12); t.cam(56.6, g + 2.0, 15.6, 68.5, g + 1.4, 12.2, 56) })
    },
    async play(ctx, t) {
      // Let go: the guards come on, the machines fight from where they stand.
      await ctx.evaluate(() => window.__preview.unpin())
      await hose(ctx, t, 6200)
      const down = await ctx.evaluate(() => ['guard'].flatMap(k => window.__game.app.mode.garrison.units.filter(u => u.kind === k && u.state === 'dead')).length)
      ctx.log.info(`minigun: ${down} guards down`)
    }
  }),

  // ── A red barrel, three guards, one round ──
  barrels: shot('barrels', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t
        const b = t.m.barrels.find(b => b.live)
        b.x = 76; b.z = 15; b.y = t.ground(76, 15); b.cx = 38; b.cz = 7
        window.__bar = b
        t.pin(t.unit('guard', 0), 74, 13.5, 64, 12)
        t.pin(t.unit('guard', 1), 78.5, 14, 64, 12)
        t.pin(t.unit('guard', 2), 75.5, 17.6, 64, 12)
        t.mech(62, 11, 76, 15)
        t.weapon('sniper')
      })
      await ctx.wait(500)
      await ctx.evaluate(() => { window.__preview.aim(true) })
      await ctx.wait(900)
      await ctx.evaluate(() => { const b = window.__bar; window.__preview.aimPoint(b.x, b.y + 0.7, b.z, 1); window.__t.calm(); window.__t.cam(69.5, 2.8, 8.5, 76, 1.5, 15.5, 52) })
    },
    async play(ctx) {
      await ctx.wait(700)
      await ctx.evaluate(() => window.__preview.fire())
      await ctx.wait(350)
      await ctx.evaluate(async () => { const { ignite } = await import('/src/game/sim/barrels.ts'); const b = window.__bar; if (b.live && b.fuse < 0) ignite(b, 0.01) })
    }
  }),

  // ── The robo dog: a hound on the hunt, flat out ──
  hound: shot('hound', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => { const t = window.__t; t.pin(t.unit('hound', 0), 90, 15, 60, 12); t.mech(60, 12, 90, 15) })
      await ctx.wait(500)
      await alarm(ctx, ['hound', 0])
      await ctx.evaluate(() => { const u = window.__t.unit('hound', 0); window.__preview.ride(u.id, [0.9, 0.7, 3.4], [0, 0.6, 0], 62) })
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.unpin())
    }
  }),

  // ── The rocket: off the shoulder, across the yard, into a squad of guards ──
  // Four guards in a huddle (a squad being briefed); the round goes into the
  // floor in their middle and the blast throws all four.
  rocket: shot('rocket', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t
        const c = [80, 15]
        const ring = [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]
        for (let k = 0; k < 4; k++) { const [ox, oz] = ring[k]; t.pin(t.unit('guard', k), c[0] + ox, c[1] + oz, c[0], c[1]) }
        t.mech(62, 12, c[0], c[1])
        t.weapon('rocket')
        window.__squad = [0, 1, 2, 3].map(k => t.unit('guard', k).id)
      })
      await ctx.wait(500)
      await ctx.evaluate(() => { window.__preview.aim(true) })
      await ctx.wait(800)
      await ctx.evaluate(() => {
        const t = window.__t
        window.__preview.aimPoint(80, t.ground(80, 15) + 0.05, 15, 1)
        t.calm()
        window.__preview.ride(-1, [-2.4, 1.5, -3.2], [0.8, 1.4, 12], 52)
      })
    },
    async play(ctx) {
      await ctx.wait(600)
      await ctx.evaluate(() => { const t = window.__t; window.__preview.aimPoint(80, t.ground(80, 15) + 0.05, 15, 1) })
      await ctx.wait(60)
      await ctx.evaluate(() => window.__t.m.fireRound())
      await ctx.stepUntil(() => window.__game.app.mode.rockets.length === 0, { timeoutMs: 3000 })
      await ctx.evaluate(() => window.__preview.unpin())
      const dead = await ctx.evaluate(() => window.__squad.filter(i => window.__game.app.mode.garrison.units[i].state === 'dead').length)
      ctx.log.info(`rocket landed at ${(ctx.frame() / ctx.fps).toFixed(2)} s, ${dead} of 4 down`)
    }
  }),

  // ── The flamethrower on a fallen guard ──
  flamer: shot('flamer', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(async () => {
        const { killUnit } = await import('/src/game/sim/garrison.ts')
        const t = window.__t, m = t.m
        const u = t.unit('guard', 4)
        t.pin(u, 72, 16, 72, 30)
        await new Promise(r => setTimeout(r, 400))
        window.__preview.unpin()
        killUnit(m.garrison, u.id, 72, 14, 'blade')
        u.deadT = 30; u.hold = 0
        window.__fid = u.id
      })
      await ctx.wait(1600)
      await ctx.evaluate(() => {
        const t = window.__t, m = t.m, u = m.garrison.units[window.__fid]
        t.mech(u.x - 2.2, u.z - 0.6, u.x, u.z)
        m.fuelLeft = 4
        t.calm()
        t.cam(u.x + 1.6, 1.8, u.z - 4.4, u.x - 0.6, 0.9, u.z - 0.2, 55)
      })
    },
    async play(ctx) {
      await ctx.wait(400)
      await ctx.evaluate(() => window.__t.m.startBurn(window.__fid))
    }
  }),

  // ── The grappling hook: up the curtain wall ──
  grapple: shot('grapple', {
    level: 4,
    async stage(ctx) {
      await ctx.evaluate(() => { const t = window.__t; t.mech(70, 25.4, 70, 40); t.calm(); t.cam(63.5, 2.4, 21.5, 70, 4, 27, 55) })
    },
    async play(ctx) {
      await ctx.wait(400)
      await ctx.evaluate(() => window.__preview.press('grappleQueued'))
    }
  }),

  // ── Balancing along the cable to the Sea Fort's summit ──
  rope: shot('rope', {
    level: 2,
    async stage(ctx) {
      await ctx.evaluate(() => {
        const t = window.__t, m = t.m, p = m.player, g = m.fortress.grid
        const c = g.cables.find(k => k.ax === 52 && k.az === 11)
        p.mode = 'cable'; p.cable = c; p.cableT = 0.3
        m.cam.yaw = Math.atan2((c.bx - c.ax), (c.bz - c.az))
        t.calm()
      })
      await ctx.wait(300)
      await ctx.evaluate(() => {
        const t = window.__t, p = t.m.player, c = p.cable
        const dx = c.bx - c.ax, dz = c.bz - c.az, l = Math.hypot(dx, dz)
        const ux = dx / l, uz = dz / l
        const ax = p.x + ux * 3, az = p.z + uz * 3
        window.__preview.shot({ px: ax - uz * 5.5, py: p.y - 1.2, pz: az + ux * 5.5, lx: ax, ly: p.y + 1.0, lz: az, fov: 56 })
      })
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.move(0, 1))
    }
  }),

  // ── The Warden: the boss comes on, blade out; one round, the kill-cam ──
  warden: shot('warden', {
    level: 2,
    async stage(ctx) {
      const id = await ctx.evaluate(() => window.__preview.unit('commander', 0).id)
      await ctx.evaluate((i) => window.__preview.vantage(i, 18, false), id)
      await ctx.wait(400)
      await ctx.evaluate(async (i) => {
        const t = window.__t, u = t.m.garrison.units[i]
        t.weapon('sniper')
        u.hp = Math.round(u.maxHp * 0.45)
        window.__wid = i
      }, id)
      await alarm(ctx, ['commander', 0])
      await ctx.evaluate(() => window.__preview.aim(true))
      await ctx.wait(800)
      await ctx.evaluate(() => window.__preview.aimAt(window.__wid, 1))
    },
    async play(ctx) {
      await ctx.evaluate(() => window.__preview.aimAt(window.__wid, 300))
      await ctx.wait(1500)
      await ctx.evaluate(() => { const u = window.__t.m.garrison.units[window.__wid]; u.hp = Math.min(u.hp, 10); window.__preview.aimAt(window.__wid, 1) })
      await ctx.wait(100)
      await ctx.evaluate(() => { window.__preview.forceKillcam(); window.__preview.fire() })
      await ctx.wait(200)
      await ctx.evaluate(() => window.__preview.aim(false))
    }
  }),

  // ── Salvage: the pile stripped, sparks and all ──
  loot: shot('loot', {
    level: 1,
    async stage(ctx) {
      await ctx.evaluate(() => { window.__preview.atPile(); window.__t.calm() })
      await ctx.wait(400)
      await ctx.evaluate(() => window.__preview.ride(-1, [2.0, 1.5, 1.8], [0, 0.6, 1.0], 50))
    },
    async play(ctx) {
      await ctx.wait(300)
      await ctx.evaluate(() => window.__preview.act())
    }
  }),

  // ── Out: the robo dog swoops in and takes the mech away ──
  extract: shot('extract', {
    level: 1,
    async stage(ctx) {
      await ctx.evaluate(() => window.__t.calm())
    },
    async play(ctx) {
      await ctx.wait(200)
      await ctx.evaluate(() => window.__t.m.cheatExtract())
    }
  })
}
