// @vitest-environment jsdom
// The portal mute has to stop music that has not STARTED yet.
//
// This pins the exact flow portal QA runs and the exact way the obvious
// implementation fails it (Playgama filed it against tower-siege after the
// initial-state read was already in place):
//
//   1. the portal is muted, and the player RELOADS;
//   2. the SDK reports "muted" during boot, before any audio element exists;
//   3. `setPlatformAudioMuted(true)` suspends an audio layer that is still
//      empty — there is nothing to pause, so nothing happens;
//   4. a second later the run starts and `startBattleMusic()` plays.
//
// Every mid-session test passes and the graded one fails. The fix is that the
// mute is a REACTIVE ref the music start READS (`playWithFade`), not an edge it
// is merely notified of — plus the false-edge re-fire, without which a player
// who unmutes gets a permanently silent game.
//
// The assertion is on `HTMLMediaElement.prototype.play` call COUNTS, which is
// the same thing the real-browser check counts, so the two agree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { useMusic } from '@/use/useSound'
import { resourceCache } from '@/use/useAssets'
import { setPlatformAudioMuted } from '@/use/useGamePauseAudio'
import { prependBaseUrl } from '@/utils/function'

let playSpy: ReturnType<typeof vi.fn>
let originalPlay: typeof HTMLMediaElement.prototype.play

/**
 * Mount a host component that owns the music singleton, and hand back its
 * controls. `initMusic` registers its hooks in `onMounted`, so it needs a real
 * component instance.
 */
const mountMusic = () => {
  let api!: ReturnType<typeof useMusic>
  const wrapper = mount(defineComponent({
    setup() {
      api = useMusic()
      api.initMusic()
      return () => null
    }
  }))
  return { wrapper, api: api! }
}

beforeEach(() => {
  playSpy = vi.fn(() => Promise.resolve())
  originalPlay = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = playSpy as unknown as typeof originalPlay

  // Seed the decoded-audio cache for the default track so `loadAndPlayTrack`
  // takes its CACHED branch and reaches `playWithFade()` synchronously.
  //
  // This is what stops the test being vacuous. Uncached, the start waits on a
  // `canplaythrough` event jsdom never fires, so `play()` would go uncalled
  // whether the mute worked or not — and a game that simply never plays music
  // would pass. The control case below is the proof that it does not.
  const src = prependBaseUrl('audio/music/theme.ogg')
  resourceCache.audio.set(src, { src } as unknown as HTMLAudioElement)
})

afterEach(async () => {
  // Clear the mute BEFORE restoring `play`, and let the false-edge watcher run:
  // it may re-fire the music start, and it must find the spy rather than jsdom's
  // real `play` (which returns undefined and would reject inside `.then`).
  setPlatformAudioMuted(false)
  await nextTick()
  HTMLMediaElement.prototype.play = originalPlay
  resourceCache.audio.clear()
})

describe('portal mute gates the music START, not just running audio', () => {
  it('CONTROL: unmuted, starting a battle really does call play()', () => {
    // Without this the mute assertions below prove nothing.
    const { wrapper, api } = mountMusic()
    api.startBattleMusic()
    expect(playSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('a mute that lands BEFORE the music exists still silences it', () => {
    // The reload flow: the portal reports muted during boot, then the run
    // starts. Nothing was playing when the mute arrived, so suspending had
    // nothing to suspend — the start itself has to refuse.
    setPlatformAudioMuted(true)

    const { wrapper, api } = mountMusic()
    api.startBattleMusic()

    expect(playSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('unmuting brings the music back for a run that is still going', async () => {
    // The other half, and the one a naive "just don't play while muted" fix
    // misses: `shouldPlay` is already true and `resumeAllAudio` only restarts
    // elements it actually paused — a track that never started is not one of
    // them. Without the false-edge watcher the game stays silent for good.
    setPlatformAudioMuted(true)
    const { wrapper, api } = mountMusic()
    api.startBattleMusic()
    expect(playSpy).not.toHaveBeenCalled()

    setPlatformAudioMuted(false)
    await nextTick()

    expect(playSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('a mute arriving MID-RUN blocks the NEXT start as well', () => {
    // The mid-run mute itself is covered by the suspend-stack assertions in
    // `useGamePauseAudio.test.ts`. What this adds is the follow-on: once muted,
    // the next stage's `startBattleMusic()` must not sound either. Stopping the
    // music that is playing and refusing the music that is about to play are
    // different code paths, and only the first one used to exist.
    const { wrapper, api } = mountMusic()
    api.startBattleMusic()
    expect(playSpy).toHaveBeenCalledTimes(1)

    setPlatformAudioMuted(true)
    api.stopBattleMusic()   // stage over
    api.startBattleMusic()  // next stage begins, portal still muted

    expect(playSpy).toHaveBeenCalledTimes(1) // no second start
    wrapper.unmount()
  })
})
