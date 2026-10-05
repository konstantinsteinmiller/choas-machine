<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  leaderboardEnabled, leaderboardFailed, playerTotal, rankFor, rankTotalFor
} from '@/use/useLeaderboard'
import { formatCount } from '@/utils/localeNumber'

/**
 * ─── "#1130 of 2345" ────────────────────────────────────────────────────────
 *
 * The whole leaderboard, reduced to one pill on the result screen. It is the
 * only part of this feature most players ever see, and the population is the
 * half that makes the placing mean something: a bare "#1130" says nothing.
 *
 * THREE STATES, and only one of them is a number:
 *
 *   • a rank        → `#1130`, plus `of 2345` once the population has landed
 *                     — both GROUPED for the player's locale, so a big board
 *                     reads as `#41,032 of 154,331` rather than as two strings
 *                     of digits somebody has to count
 *   • still waiting → `…`, holding the cell's width so the row of chips does
 *                     not jump sideways when the rank arrives a beat later
 *   • nothing to say → the badge does not render AT ALL
 *
 * THERE IS NO "#100+" STATE, and adding one back is a regression. A placing
 * this component cannot state as a number is not shown as prose instead — the
 * ladder in `useLeaderboard` guarantees a real number from a histogram, or an
 * estimated one, or nothing. `rankFor` returns no sentinel for a template to
 * decorate, which is the point: the rule is enforced where the number is made,
 * not in every screen that shows one.
 *
 * The empty state is the one to respect. An empty plaque is a question the
 * screen cannot answer, and a permanent "Loading…" on a player with no
 * connection reads as a broken game. Once the fetch has actually failed the
 * badge is gone and stays gone — though it rarely comes to that, because the
 * offline ladder usually has a cached or baked board to rank against, and the
 * player never learns which one answered.
 *
 * `score` is a PROP rather than an import so this component is drop-in: it does
 * not know where the game keeps its lifetime best. Pass the same number
 * `reportRun` is called with.
 */

const props = withDefaults(defineProps<{
  /** The player's LIFETIME BEST — the same number passed to `reportRun`, not
   *  this run's result. Ranking a run total against a board of bests would show
   *  a player their rank falling after a bad run. */
  score: number
  /** Hide the "of N" tail (a cramped HUD corner, say). The placing alone is a
   *  weaker line, so only do this where the width genuinely is not there. */
  compact?: boolean
}>(), { compact: false })

const { t, locale } = useI18n()

/**
 * Both numbers in this pill are grouped for the active locale. Reading
 * `locale.value` inside a render is what keeps it REACTIVE: change the language
 * in an options screen and the separators follow, instead of the pill keeping
 * whichever convention happened to be active when it first painted.
 */
const fmt = (n: number): string => formatCount(n, locale.value)

/** The population, grouped — shared by the visible tail and the aria label. */
// `rankTotalFor`, not `playerTotal`: a build that ranks an unplayed player last
// counts them into the population. See `useLeaderboard`.
const totalLabel = computed(() => fmt(rankTotalFor(props.score)))

/**
 * The rank as PROSE — `#42`, `…`, or empty.
 *
 * The `#` is built here rather than in the template because `#{}` is Pug
 * interpolation: a literal `#` in front of a mustache is a parse error, not a
 * hash sign. (Costs an hour the first time.)
 */
const label = computed<string>(() => {
  if (!leaderboardEnabled) return ''
  const rank = rankFor(props.score)
  if (rank > 0) return `#${fmt(rank)}`
  // `0` is the only non-answer `rankFor` has, and it means "nothing honest to
  // say yet" — not "unknowable". Until the endpoint has actually failed that is
  // a request still in flight, so hold the slot; after it, give the slot back.
  return leaderboardFailed.value ? '' : '…'
})

/** Only once the population has actually landed. Before that there is no "of N"
 *  to print, and a placeholder there would be a second unanswered question. */
const showTotal = computed(() => !props.compact && playerTotal.value > 0)

/** One accessible name for the whole pill. Without it a screen reader reads
 *  "number 1130 of 2345" with no idea what is being counted. */
const ariaLabel = computed(() =>
  showTotal.value
    ? `${t('leaderboard.title')}: ${label.value} ${t('leaderboard.of', { n: totalLabel.value })}`
    : `${t('leaderboard.title')}: ${label.value}`
)
</script>

<template lang="pug">
  //- No cell at all when there is nothing honest to say.
  div.rank-badge(v-if="label" role="img" :aria-label="ariaLabel")
    //- Inline rather than an <img>: it inherits `currentColor`, so the glyph
    //- and the number can never drift apart, and it costs no request. Swap it
    //- for the project's own icon component if there is one.
    //- The trophy in a gold hex socket, the plaque's badge of office.
    span.rank-badge__socket
      svg.rank-badge__icon(viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
        path(d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h3.5v2h-9v-2H11v-2.1a6 6 0 0 1-3.4-3.9A5 5 0 0 1 3 8V5h3V3Zm0 4H5v1a3 3 0 0 0 1.6 2.7A8 8 0 0 1 6 8V7Zm12 0v1a8 8 0 0 1-.6 2.7A3 3 0 0 0 19 8V7h-1Z")
    span.rank-badge__rank {{ label }}
    span.rank-badge__of(v-if="showTotal") {{ t('leaderboard.of', { n: totalLabel }) }}
</template>

<style scoped lang="sass">
@use '@/assets/css/tech' as *
// A gold plaque in the game's machined style: the plate with its cut corners
// and brackets, the trophy in a gold hex socket, the placing in white on the
// hard black shadow every number wears, the population after a gold rule.
// Gold because it is the one number on the screen that is not about this run:
// it is about everyone else. Its own dark fill reads on the open sky too.
.rank-badge
  display: inline-flex
  align-items: center
  gap: clamp(0.3rem, 1.4vmin, 0.5rem)
  min-height: clamp(1.9rem, 7.5vmin, 2.5rem)
  padding: 0.2rem clamp(0.6rem, 2.6vmin, 0.95rem) 0.2rem 0.3rem
  box-sizing: border-box
  color: var(--cm-warn)
  white-space: nowrap
  +tech-plate(var(--cm-warn), linear-gradient(180deg, #3d2a6e, #23154c 60%, #170d33), 0.6rem, var(--cm-edge))

.rank-badge__socket
  flex: 0 0 auto
  width: clamp(1.45rem, 5.8vmin, 1.95rem)
  height: clamp(1.3rem, 5.2vmin, 1.75rem)
  padding: 0.24em 0.3em
  box-sizing: border-box
  color: #2a1a05
  +tech-hex(#fff1a8, linear-gradient(180deg, #ffe680, var(--cm-warn) 55%, #c98a12))

.rank-badge__icon
  display: block
  width: 100%
  height: 100%

.rank-badge__rank
  color: #fff
  font-weight: 700
  font-size: clamp(0.85rem, 4.2vmin, 1.3rem)
  line-height: 1
  font-variant-numeric: tabular-nums
  // Every number in this game sits on a hard black shadow; without it the pill
  // looks like a different app's component.
  text-shadow: 0.08em 0.08em 0 #000

.rank-badge__of
  padding-left: clamp(0.3rem, 1.4vmin, 0.5rem)
  border-left: var(--cm-edge) solid color-mix(in srgb, var(--cm-warn) 55%, transparent)
  color: #f3dfa0
  text-transform: uppercase
  letter-spacing: 0.04em
  font-size: clamp(0.5rem, 2.4vmin, 0.7rem)
  line-height: 1.1
</style>
