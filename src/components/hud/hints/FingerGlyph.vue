<template lang="pug">
  //- A fingertip doing the gesture: dragging the stick, swiping to look,
  //- holding to aim, letting go to fire, tapping in time; looking round
  //- (#169) is a finger running an endless loop, any way at all.
  div.finger-glyph(:class="mode" aria-hidden="true")
    svg.loop-line(v-if="mode === 'loop'" viewBox="0 0 100 100")
      path(d="M86.0 50.0 L85.8 52.3 L85.1 54.6 L84.0 56.6 L82.6 58.4 L80.9 59.9 L79.0 61.1 L77.0 61.9 L74.9 62.5 L72.9 62.7 L70.8 62.7 L68.9 62.4 L67.0 62.0 L65.2 61.4 L63.4 60.7 L61.8 59.8 L60.3 58.9 L58.8 57.9 L57.4 56.9 L56.1 55.8 L54.8 54.7 L53.6 53.5 L52.4 52.3 L51.2 51.2 L50.0 50.0 L48.8 48.8 L47.6 47.7 L46.4 46.5 L45.2 45.3 L43.9 44.2 L42.6 43.1 L41.2 42.1 L39.7 41.1 L38.2 40.2 L36.6 39.3 L34.8 38.6 L33.0 38.0 L31.1 37.6 L29.2 37.3 L27.1 37.3 L25.1 37.5 L23.0 38.1 L21.0 38.9 L19.1 40.1 L17.4 41.6 L16.0 43.4 L14.9 45.4 L14.2 47.7 L14.0 50.0 L14.2 52.3 L14.9 54.6 L16.0 56.6 L17.4 58.4 L19.1 59.9 L21.0 61.1 L23.0 61.9 L25.1 62.5 L27.1 62.7 L29.2 62.7 L31.1 62.4 L33.0 62.0 L34.8 61.4 L36.6 60.7 L38.2 59.8 L39.7 58.9 L41.2 57.9 L42.6 56.9 L43.9 55.8 L45.2 54.7 L46.4 53.5 L47.6 52.3 L48.8 51.2 L50.0 50.0 L51.2 48.8 L52.4 47.7 L53.6 46.5 L54.8 45.3 L56.1 44.2 L57.4 43.1 L58.8 42.1 L60.3 41.1 L61.8 40.2 L63.4 39.3 L65.2 38.6 L67.0 38.0 L68.9 37.6 L70.8 37.3 L72.9 37.3 L74.9 37.5 L77.0 38.1 L79.0 38.9 L80.9 40.1 L82.6 41.6 L84.0 43.4 L85.1 45.4 L85.8 47.7 L86.0 50.0Z")
    //- What the hold fills while the finger stays put.
    svg.hold-ring(v-if="mode === 'hold' || mode === 'release'" viewBox="0 0 40 40")
      circle.track(cx="20" cy="20" r="17")
      circle.fill(cx="20" cy="20" r="17")
    //- A mobile game's tutorial hand: shaded skin, a nail on the pointing
    //- finger, the other three curled with their creases, the thumb, a cuff
    //- in the game's cyan. The fingertip is the point that does the gesture
    //- (the same spot the old flat glyph had, so every animation still lands).
    div.tip
      svg(viewBox="0 0 64 88")
        defs
          linearGradient(:id="`${uid}-skin`" x1="0" y1="0" x2="1" y2="1")
            stop(offset="0" stop-color="#ffe2cc")
            stop(offset="0.55" stop-color="#f7b994")
            stop(offset="1" stop-color="#e08f6b")
          linearGradient(:id="`${uid}-cuff`" x1="0" y1="0" x2="0" y2="1")
            stop(offset="0" stop-color="#a8f5ff")
            stop(offset="1" stop-color="#1fa9cf")
        path.hand(:fill="`url(#${uid}-skin)`" d="M23.5 46L23.5 11.5A6.5 6.5 0 0 1 36.5 11.5L36.5 33C37 29.5 45 29.5 45.5 34C46 31 53 31 53.5 36C54 33.5 59.5 34.5 59.5 39.5L59.5 56C59.5 66 54 72 47 73.5L47 80L25 80L25 72C17 69 12 62 11 55C10 51 7 45 8.5 41.5C10 38.5 15 39 17.5 42Z")
        path.crease(d="M37 41Q41 43.5 45.5 41.5M45.5 42.5Q49.5 45 53.5 42.5M53.5 44Q56.5 45.5 59.5 44.5M17.5 42Q21.5 46 21.5 53M30 26.5Q33 27.5 36 26.5")
        rect.nail(x="26.3" y="6.6" width="7.4" height="7.4" rx="3.6")
        path.shine(d="M26.6 17V31")
        rect.cuff(:fill="`url(#${uid}-cuff)`" x="21" y="71.5" width="30" height="12" rx="3")
        path.cuff-line(d="M24 76.5H48")
</template>

<script setup lang="ts">
defineProps<{ mode: 'drag' | 'swipe' | 'hold' | 'release' | 'push' | 'tap' | 'loop' }>()
// Gradient ids are per glyph: a hidden copy owning a shared id would leave the others unfilled.
const uid = `fg${Math.random().toString(36).slice(2, 9)}`
</script>

<style scoped lang="sass">
.finger-glyph
  --size: clamp(3rem, 15vmin, 5rem)
  position: relative
  width: var(--size)
  height: var(--size)
.tip
  position: absolute
  left: 50%
  top: 50%
  width: 46%
  height: 64%
  margin: -12% 0 0 -18%
  svg
    display: block
    width: 100%
    height: 100%
    overflow: visible
    filter: drop-shadow(0 0.18rem 0.12rem rgba(10, 4, 24, 0.55))
  .hand
    stroke: #3a1f14
    stroke-width: 2.6
    stroke-linejoin: round
  .crease
    fill: none
    stroke: #b4644a
    stroke-width: 1.6
    stroke-linecap: round
    opacity: 0.85
  .nail
    fill: #fff1ea
    stroke: #d98c75
    stroke-width: 1.1
  .shine
    fill: none
    stroke: #fff
    stroke-width: 2.6
    stroke-linecap: round
    opacity: 0.55
  .cuff
    stroke: #0d2a3a
    stroke-width: 2.4
  .cuff-line
    stroke: rgba(255, 255, 255, 0.7)
    stroke-width: 1.4
    stroke-linecap: round
.hold-ring
  position: absolute
  inset: 0
  rotate: -90deg
  // A host may colour and weigh the ring to its control (the bellows' amber, #185).
  circle
    fill: none
    stroke-width: var(--ring-width, 2.5)
  .track
    stroke: var(--ring-track, rgba(246, 241, 255, 0.3))
  .fill
    stroke: var(--ring-color, var(--cm-pink))
    stroke-linecap: round
    stroke-dasharray: 106.9
    stroke-dashoffset: 106.9

// The stick: round and round.
.drag .tip
  animation: finger-circle 1.8s linear infinite
// The camera: side to side.
.swipe .tip
  animation: finger-swipe 1.6s ease-in-out infinite
// Looking round (#169): the fingertip runs the loop, round and round (360°
// every way), its line drawn under it. The tip's point sits on the line.
.loop-line
  position: absolute
  inset: 0
  overflow: visible
  path
    fill: none
    stroke: var(--cm-cyan-hi)
    stroke-width: 4.5
    stroke-linecap: round
    stroke-dasharray: 2 7
    opacity: 0.85
.loop .tip
  width: 34%
  height: 47%
  margin: -3% 0 0 -12%
  animation: finger-loop 2.6s linear infinite
@keyframes finger-loop
  0.00%
    left: 86.0%
    top: 50.0%
  4.17%
    left: 82.6%
    top: 58.4%
  8.33%
    left: 74.9%
    top: 62.5%
  12.50%
    left: 67.0%
    top: 62.0%
  16.67%
    left: 60.3%
    top: 58.9%
  20.83%
    left: 54.8%
    top: 54.7%
  25.00%
    left: 50.0%
    top: 50.0%
  29.17%
    left: 45.2%
    top: 45.3%
  33.33%
    left: 39.7%
    top: 41.1%
  37.50%
    left: 33.0%
    top: 38.0%
  41.67%
    left: 25.1%
    top: 37.5%
  45.83%
    left: 17.4%
    top: 41.6%
  50.00%
    left: 14.0%
    top: 50.0%
  54.17%
    left: 17.4%
    top: 58.4%
  58.33%
    left: 25.1%
    top: 62.5%
  62.50%
    left: 33.0%
    top: 62.0%
  66.67%
    left: 39.7%
    top: 58.9%
  70.83%
    left: 45.2%
    top: 54.7%
  75.00%
    left: 50.0%
    top: 50.0%
  79.17%
    left: 54.8%
    top: 45.3%
  83.33%
    left: 60.3%
    top: 41.1%
  87.50%
    left: 67.0%
    top: 38.0%
  91.67%
    left: 74.9%
    top: 37.5%
  95.83%
    left: 82.6%
    top: 41.6%
  100.00%
    left: 86.0%
    top: 50.0%

// The stick pushed forward: toward the ladder, onto the cable.
.push .tip
  animation: finger-push 1.2s ease-in-out infinite
// Aim: the finger rests and the ring closes.
.hold .fill
  animation: finger-fill 1.6s ease-in-out infinite
// A tap: down, a flash where it lands, and up again.
.tap .tip
  animation: finger-tap 0.95s ease-in-out infinite
.tap::after
  content: ''
  position: absolute
  left: 50%
  top: 46%
  width: 0
  height: 0
  border-radius: 50%
  border: 0.16rem solid var(--cm-cyan-hi)
  translate: -50% -50%
  opacity: 0
  animation: finger-tap-ring 0.95s ease-out infinite
// Fire: the ring is full, and the finger comes off.
.release .fill
  stroke-dashoffset: 0
.release .tip
  animation: finger-lift 1.1s ease-in-out infinite

@keyframes finger-circle
  0%
    translate: 0 -28%
  25%
    translate: 28% 0
  50%
    translate: 0 28%
  75%
    translate: -28% 0
  100%
    translate: 0 -28%
@keyframes finger-swipe
  0%, 100%
    translate: -45% 0
  50%
    translate: 45% 0
@keyframes finger-push
  0%, 100%
    translate: 0 20%
  50%
    translate: 0 -35%
@keyframes finger-fill
  0%
    stroke-dashoffset: 106.9
  70%, 100%
    stroke-dashoffset: 0
@keyframes finger-tap
  0%, 100%
    translate: 0 -30%
  40%, 52%
    translate: 0 0
@keyframes finger-tap-ring
  0%, 40%
    width: 0
    height: 0
    opacity: 0
  45%
    opacity: 0.9
  100%
    width: 70%
    height: 70%
    opacity: 0
@keyframes finger-lift
  0%, 30%
    translate: 0 0
    opacity: 1
  80%, 100%
    translate: 12% -45%
    opacity: 0.25

@media (prefers-reduced-motion: reduce)
  .tip, .fill, .tap::after
    animation: none
</style>
