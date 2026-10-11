<template lang="pug">
  //- The attention arrow: a machined yellow arrow, its tip on a point (the
  //- element's own origin), turned by `--angle`, bouncing toward what it
  //- points at. Plated like the rest of the HUD: a chamfered shaft with its
  //- rivets and side notches, a lit stripe down its spine, two chevrons cut
  //- into the head, a dark rim and a glow.
  div.attention-arrow(aria-hidden="true")
    div.bounce
      svg(viewBox="0 0 48 64")
        //- The body: chamfered shaft, notched at the sides, into the head.
        path.body(d="M24 62L3 37h11V9l3-4V2h14v3l3 4v28h11z")
        //- Side notches on the shaft (the tech plate's cuts).
        path.notch(d="M14 20h3v5h-3zM31 20h3v5h-3z")
        //- The lit spine.
        path.spine(d="M22.5 8h3v26h-3z")
        //- Two chevrons cut into the head, pointing on.
        path.chev(d="M15 40l9 10 9-10h-4.5L24 45l-4.5-5zM18.5 34.5L24 40.5l5.5-6h-3.6L24 37l-1.9-2.5z")
        //- Rivets on the shaft.
        circle.rivet(cx="19.5" cy="13" r="1.3")
        circle.rivet(cx="28.5" cy="13" r="1.3")
        circle.rivet(cx="19.5" cy="30" r="1.3")
        circle.rivet(cx="28.5" cy="30" r="1.3")
</template>

<style scoped lang="sass">
// A point, turned toward its target; the arrow hangs above it with its tip on
// the point and bounces away and back.
.attention-arrow
  position: fixed
  width: 0
  height: 0
  rotate: var(--angle, 0deg)
  pointer-events: none
.bounce
  // Big and fat: it must not be missed (`arrowAim.ts` reads the same size).
  --w: clamp(3.6rem, 16vmin, 6rem)
  position: absolute
  width: var(--w)
  height: calc(var(--w) * 1.33)
  left: calc(var(--w) * -0.5)
  bottom: 0
  animation: attention-bounce 0.8s ease-in-out infinite
  svg
    display: block
    width: 100%
    height: 100%
    overflow: visible
    filter: drop-shadow(0 0 0.45rem rgba(255, 210, 63, 0.9)) drop-shadow(0 0.15rem 0.1rem rgba(10, 4, 24, 0.6))
  .body
    fill: #ffd23f
    stroke: #3a2600
    stroke-width: 2.6
    stroke-linejoin: round
  .notch
    fill: #b8860b
  .spine
    fill: #fff6c8
    opacity: 0.9
  .chev
    fill: #a86d00
  .rivet
    fill: #fff3b0
    stroke: #8a5a00
    stroke-width: 0.8
@keyframes attention-bounce
  0%, 100%
    translate: 0 0
  50%
    translate: 0 -0.9rem
@media (prefers-reduced-motion: reduce)
  .bounce
    animation: none
</style>
