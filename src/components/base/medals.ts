import type { MedalId } from '@/game/data/ids'
import type { GameIconName } from '@/components/icons/iconNames'

/** The glyph each medal wears, wherever medals are shown. */
export const MEDAL_ICONS: Readonly<Record<MedalId, GameIconName>> = {
  ghost: 'ghost',
  marksman: 'scope',
  swift: 'bolt'
}
