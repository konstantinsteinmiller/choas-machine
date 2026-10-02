import { describe, expect, it } from 'vitest'
import { buildPlaygamaBridgeConfig } from '@/platforms/playgama/bridgeConfig'

/**
 * ─── playgama-bridge-config.json ────────────────────────────────────────────
 *
 * The file Bridge fetches on every boot. This game ships no Playgama
 * leaderboard, so the config must carry no `saas` or `leaderboards` block:
 * Bridge switches its SaaS backend on from this file alone, and the same
 * archive is the YouTube Playables submission, which forbids calls to
 * non-Google hosts.
 */
describe('the Playgama bridge config', () => {
  it('paces interstitials and switches nothing else on', () => {
    expect(buildPlaygamaBridgeConfig()).toEqual({ advertisement: { minimumDelayBetweenInterstitial: 120 } })
  })
})
