<template lang="pug">
  //- A weapon drawn side on (#161), in its own colour: the rifle cyan, the
  //- mini-gun violet, the launcher red. No chip round it: the weapon is the button.
  svg.weapon-art(:class="`w-${weapon}`" viewBox="0 0 100 40" aria-hidden="true")
    //- ── The rifle: stock, receiver, the long barrel and its brake, the scope on its mounts, bolt, magazine, grip, the folded bipod.
    g(v-if="weapon === 'sniper'")
      path.body(d="M3 21 L23 18.5 L27 18.5 L27 27 L19 31 L7 31.5 Q3 31.5 3 28 Z")
      path.dark(d="M6 24 L20 22.5 L20 25.5 L6 27.5 Z")
      rect.body(x="26" y="17.5" width="28" height="9" rx="1.5")
      rect.dark(x="53" y="19.6" width="38" height="3.6" rx="1")
      rect.body(x="88" y="18.4" width="9" height="6" rx="1.2")
      rect.dark(x="91" y="19.2" width="1.4" height="4.4")
      rect.dark(x="94" y="19.2" width="1.4" height="4.4")
      rect.dark(x="36" y="14.5" width="3" height="3.5")
      rect.dark(x="47" y="14.5" width="3" height="3.5")
      rect.body(x="30" y="9.5" width="25" height="5.5" rx="2.6")
      path.body(d="M54 9.5 L61 8 L61 16.5 L54 15 Z")
      rect.body(x="26" y="10.2" width="5" height="4.1" rx="1.2")
      rect.glass(x="58.6" y="9.4" width="1.6" height="5.6" rx="0.6")
      rect.dark(x="38" y="26" width="6" height="7" rx="1")
      path.dark(d="M29 26 L34 26 L32 34.5 L27 34.5 Z")
      circle.hi(cx="49" cy="29" r="2")
      path.line(d="M46.5 27.4 L49 29")
      path.line(d="M60 23.6 L82 26")
      path.line(d="M27.5 18.6 L53 18.6")
    //- ── The mini-gun: six barrels (three seen) in their clamps, the motor housing and its cap, the carry handle, the grip, the belt into its box.
    g(v-else-if="weapon === 'minigun'")
      path.dark(d="M4 27 L19 27 L19 37 L4 37 Z")
      path.line.dash(d="M19 30 Q24 33 28 30")
      rect.dark(x="40" y="13" width="54" height="3" rx="1.2")
      rect.dark(x="40" y="18.5" width="54" height="3" rx="1.2")
      rect.dark(x="40" y="24" width="54" height="3" rx="1.2")
      rect.body(x="56" y="11" width="5" height="18" rx="1.2")
      rect.body(x="80" y="11" width="5" height="18" rx="1.2")
      rect.body(x="91" y="11.5" width="6" height="17" rx="1.5")
      rect.glass(x="95.4" y="13" width="1" height="14" rx="0.5")
      rect.body(x="18" y="10" width="25" height="20" rx="4")
      circle.dark(cx="18" cy="20" r="7")
      circle.hi(cx="18" cy="20" r="2.4")
      path.body(d="M22 10 Q22 4 30 4 Q38 4 38 10 L35 10 Q35 7 30 7 Q25 7 25 10 Z")
      path.dark(d="M27 30 L33 30 L31.5 37 L26 37 Z")
      path.line(d="M21 13 L40 13")
      path.line(d="M36 15 L36 26")
    //- ── The launcher: the tube and its rings, the flared muzzle with the rocket's nose in it, the back blast vent, the sight, both grips, a hazard band.
    g(v-else)
      rect.body(x="10" y="14" width="76" height="12" rx="3")
      path.body(d="M84 13 L97 10 L97 30 L84 27 Z")
      path.glass(d="M90 16 L96 20 L90 24 Z")
      path.dark(d="M3 11.5 L11 14 L11 26 L3 28.5 Z")
      rect.dark(x="20" y="13" width="3.5" height="14" rx="1")
      rect.dark(x="74" y="13" width="3.5" height="14" rx="1")
      rect.stripe(x="60" y="14" width="10" height="12")
      path.dark(d="M60.5 14 L63 14 L60.5 17.5 Z M63.5 14 L66 14 L60.5 21.5 L60.5 18 Z M66.5 14 L69.5 14 L61.5 26 L60.5 26 L60.5 22.5 Z M69.5 16 L69.5 20 L65.5 26 L62.5 26 Z M69.5 21 L69.5 26 L66.5 26 Z")
      rect.dark(x="40" y="7.5" width="12" height="5" rx="1")
      rect.dark(x="44.5" y="12" width="3" height="2.5")
      circle.glass(cx="49.5" cy="10" r="1.4")
      path.dark(d="M33 26 L39 26 L37.5 34.5 L32 34.5 Z")
      path.dark(d="M55 26 L60 26 L59 33 L54.5 33 Z")
      path.line(d="M12 16.5 L84 16.5")
</template>

<script setup lang="ts">
import type { WeaponId } from '@/game/data/ids'

defineProps<{ weapon: WeaponId }>()
</script>

<style scoped lang="sass">
// Each weapon in its own colour (#161): its body in the tone, the steel a
// deep shade of it, a lit edge, the ink outline the whole game draws with.
.weapon-art
  --art: var(--cm-cyan)
  --art-hi: var(--cm-cyan-hi)
  display: block
  width: 100%
  height: 100%
  overflow: visible
  filter: drop-shadow(0 0 0.35em color-mix(in srgb, var(--art) 45%, transparent))
  .body, .dark, .glass, .hi, .stripe
    stroke: var(--cm-ink)
    stroke-width: 1.1
    stroke-linejoin: round
    paint-order: stroke
  .body
    fill: var(--art)
  .dark
    fill: color-mix(in srgb, var(--art) 30%, #120a28)
  .glass
    fill: var(--art-hi)
  .hi
    fill: var(--art-hi)
  .stripe
    fill: var(--cm-warn)
  .line
    fill: none
    stroke: var(--art-hi)
    stroke-width: 0.9
    stroke-linecap: round
    opacity: 0.85
  .dash
    stroke-dasharray: 1.6 1.2
    stroke-width: 1.6
.w-minigun
  --art: var(--cm-violet)
  --art-hi: var(--cm-lilac)
.w-rocket
  --art: var(--cm-danger)
  --art-hi: color-mix(in srgb, var(--cm-danger) 45%, white)
</style>
