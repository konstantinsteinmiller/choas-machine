# Chaos Machine

A casual stealth-action / sniper game for the web. A silent mech infiltrates
neon fortresses: snipe guards and drones, strike with the energy blade, lure
patrols with holographic decoys, and go loud with minigun and rockets when the
base goes on full alert. Design: [GDD.md](GDD.md).

Vue 3 + Vite + TypeScript, pug templates, Tailwind CSS, three.js.

## Develop

```
pnpm install
pnpm dev          # http://localhost:2196  (tab title "Chaos Machine")
pnpm test         # vitest
pnpm type-check
```

## Where things are

- [game-implementation-plan.md](game-implementation-plan.md) — the phase list
  and the resume point for every work session.
- `src/game/` — engine, world, models, simulation.
- `src/platforms/`, `src/utils/save/`, `src/use/ads/` — portal builds, the
  save layer (one `cmachine_state` blob) and the ad providers.
- `src/i18n/locales/` — 39 locales; English is the source.

## Build for a portal

`pnpm build:<portal>` for `crazy-web`, `poki`, `playgama`, `gamepix`,
`gamemonetize`, `yandex`, `wavedash`, `itch`, `glitch`. Portal ids and tokens
live in the `.env.<portal>` files and are empty until the game is registered.
