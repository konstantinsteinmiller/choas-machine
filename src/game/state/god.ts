import { reactive } from 'vue'

/**
 * God mode (the dev cheat panel, `game/CheatPanel.vue`): the mech takes no
 * damage while it is on. A plain flag the sim reads; it lives outside the
 * cheat module so the sim never imports dev tooling, and nothing in a release
 * build can switch it on.
 */
export const god = reactive({ on: false })
