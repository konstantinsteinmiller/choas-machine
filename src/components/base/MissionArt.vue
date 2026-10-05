<template lang="pug">
  //- A mission card's picture (jam build): its fortress in silhouette, drawn
  //- in lines of light. I the Bastion (curtain wall, gate, keep, the perch's
  //- cable), II the Sea Fort (a palisade on the waves, a stepped keep), III the
  //- Steel Keep (two rings of towers, the tall keep).
  svg.mission-art(viewBox="0 0 96 54" aria-hidden="true")
    defs
      linearGradient(:id="'sky' + n" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#2a1660")
        stop(offset="1" stop-color="#6a3a9a")
      pattern(:id="'scan' + n" width="4" height="3" patternUnits="userSpaceOnUse")
        rect(y="2" width="4" height="1" fill="rgba(0, 0, 0, 0.16)")
    rect(width="96" height="54" :fill="`url(#sky${n})`")
    //- Distant clouds and the scan lines over everything.
    path.cloud(d="M0 42 Q14 36 28 41 T58 40 T96 39 V54 H0 Z")
    template(v-if="n === 1")
      path.wall(d="M10 44 V30 H18 V24 H24 V30 H38 V36 H44 V30 H62 V24 H68 V30 H84 V44 Z")
      path.keep(d="M44 30 V14 H48 V10 H52 V14 H56 V30")
      path.gate(d="M50 44 V38 Q53 35 56 38 V44")
      path.line(d="M4 18 L22 26")
      circle.lamp(cx="52" cy="12" r="1.4")
    template(v-else-if="n === 2")
      path.wave(d="M0 46 Q8 43 16 46 T32 46 T48 46 T64 46 T80 46 T96 46 V54 H0 Z")
      path.wall(d="M8 45 V32 L10 30 L12 32 L14 30 L16 32 L18 30 V45 M78 45 V30 L80 32 L82 30 L84 32 L86 30 L88 32 V45")
      path.wall(d="M18 45 V35 H78 V45")
      path.keep(d="M34 35 V28 H40 V22 H46 V14 H50 V22 H56 V28 H62 V35")
      path.line(d="M86 30 L50 16")
      circle.lamp(cx="13" cy="28" r="1.6")
      circle.lamp(cx="83" cy="28" r="1.6")
    template(v-else)
      path.wall.far(d="M14 40 V28 H20 V24 H26 V28 H70 V24 H76 V28 H82 V40 Z")
      path.wall(d="M6 46 V36 H12 V32 H18 V36 H40 V32 H46 V36 H50 V32 H56 V36 H78 V32 H84 V36 H90 V46 Z")
      path.keep(d="M64 28 V10 H66 V8 H70 V10 H72 V28")
      path.line(d="M15 32 L66 9")
      circle.lamp(cx="68" cy="7" r="1.5")
    rect(width="96" height="54" :fill="`url(#scan${n})`")
</template>

<script setup lang="ts">
defineProps<{ n: number }>()
</script>

<style scoped lang="sass">
.mission-art
  --ma-line: var(--cm-cyan-hi)
  display: block
  width: 100%
  height: 100%
.cloud
  fill: rgba(255, 143, 210, 0.16)
.wave
  fill: rgba(77, 232, 255, 0.16)
  stroke: var(--cm-cyan)
  stroke-width: 0.8
.wall, .keep, .gate
  fill: #150c2b
  stroke: var(--ma-line)
  stroke-width: 1
  stroke-linejoin: round
.wall.far
  opacity: 0.6
.keep
  stroke: var(--cm-pink-hi)
.line
  fill: none
  stroke: var(--cm-pink)
  stroke-width: 0.7
  stroke-dasharray: 2 1.5
.lamp
  fill: var(--cm-warn)
  filter: drop-shadow(0 0 1.5px var(--cm-warn))
</style>
