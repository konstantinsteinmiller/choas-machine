/**
 * ─── The voice catalog (#65): every spoken line, in one place ────────────────
 *
 * Pure data, no runtime imports: `tools/voice/` reads it with Node's type
 * stripping, and the game imports it too (`voice.ts`).
 *
 * A line's key is its file name (dots → underscores):
 * `npc.guard.alarm` ships as `public/audio/voice/<lang>/npc_guard_alarm.ogg`.
 * Several NPCs say the same words in their own voice, so a line names the
 * i18n key of its words in `text` (the bubble shows that key). Keys never
 * hold an underscore (a test), so a file name maps back to one line.
 *
 * - `live`: the game speaks it now. Its words are the locale's (`text`).
 * - `planned`: written, not spoken yet: the `draft` until it has a locale key.
 */

import type { PostKind } from '../world/fortress'

export type Speaker = 'guard' | 'sentry' | 'engineer' | 'warden' | 'drone' | 'enforcer' | 'goliath' | 'hound'
/** One entry per voiced language, in the order of `PATHS.langs` (tools/voice/lib.mjs). */
export type Both = readonly [string, string]

export interface VoiceLine {
  key: string
  speaker: Speaker
  /** Where in the game, for grouping in reports. */
  scene: string
  status: 'live' | 'planned'
  /** The i18n key of the words (several speakers share one). Absent: the key itself. */
  text?: string
  /** When it plays (the situation the model is told). */
  when: Both
  /** How to say it (the stage direction). */
  direction: Both
  /** The longest the delivered line should run (s). */
  max: number
  draft?: Both
  params?: Readonly<Record<string, string>>
  neutral?: boolean
}

export interface SpeakerInfo { name: string; role: Both; voice: Both }

export const SPEAKERS: Readonly<Record<Speaker, SpeakerInfo>> = {
  guard: { name: 'Guard', role: ['A soldier on the night watch', 'Ein Soldat der Nachtwache'], voice: ['Young, rough, startled into a yell.', 'Jung, rau, aufgeschreckt, brüllt.'] },
  sentry: { name: 'Sentry', role: ['A lookout on a tower', 'Eine Wache auf einem Turm'], voice: ['Sharp, clear, carries far.', 'Scharf, klar, trägt weit.'] },
  engineer: { name: 'Engineer', role: ['The base mechanic', 'Der Mechaniker der Basis'], voice: ['Older, gravelly, more annoyed than afraid.', 'Älter, kratzig, eher genervt als ängstlich.'] },
  warden: { name: 'The Warden', role: ['The base commander, a boss', 'Der Kommandant der Basis, ein Boss'], voice: ['Deep, commanding, through a helmet.', 'Tief, befehlend, durch einen Helm.'] },
  drone: { name: 'Drone', role: ['A surveillance drone', 'Eine Überwachungsdrohne'], voice: ['Small, clipped, synthetic.', 'Klein, abgehackt, synthetisch.'] },
  enforcer: { name: 'Enforcer', role: ['A heavy combat mech', 'Ein schwerer Kampfmech'], voice: ['Heavy, flat, mechanical.', 'Schwer, flach, mechanisch.'] },
  goliath: { name: 'Goliath', role: ['The tank, a boss', 'Der Panzer, ein Boss'], voice: ['Huge, slow, booming.', 'Riesig, langsam, dröhnend.'] },
  hound: { name: 'Scrap Hound', role: ['A robot dog', 'Ein Roboterhund'], voice: ['Small, yappy, a toy speaker.', 'Klein, kläffend, ein Spielzeuglautsprecher.'] }
}

export const SCENES: ReadonlyArray<{ id: string; title: Both }> = [
  { id: 'alarm', title: ['A defender is sure', 'Ein Verteidiger ist sicher'] }
]

type Opts = Omit<VoiceLine, 'key' | 'speaker' | 'scene' | 'status' | 'max'>
const live = (key: string, speaker: Speaker, scene: string, max: number, o: Opts): VoiceLine =>
  ({ key, speaker, scene, status: 'live', ...o, max })

const WHEN: Both = ['It has just made sure it saw the intruder: the alarm', 'Er hat den Eindringling gerade sicher erkannt: Alarm']

export const VOICE_LINES: readonly VoiceLine[] = [
  live('npc.guard.alarm', 'guard', 'alarm', 1.6, {
    text: 'callout.human', when: WHEN,
    direction: ['Shouted, startled, to the whole yard.', 'Gebrüllt, erschrocken, über den ganzen Hof.']
  }),
  live('npc.sentry.alarm', 'sentry', 'alarm', 1.6, {
    text: 'callout.human', when: WHEN,
    direction: ['Called out sharp and loud from a tower.', 'Scharf und laut von einem Turm gerufen.']
  }),
  live('npc.engineer.alarm', 'engineer', 'alarm', 1.8, {
    text: 'callout.human', when: WHEN,
    direction: ['Gruff shout, annoyed more than scared.', 'Raues Rufen, eher verärgert als erschrocken.']
  }),
  live('npc.warden.alarm', 'warden', 'alarm', 1.8, {
    text: 'callout.human', when: WHEN,
    direction: ['A commander\'s order, loud and certain.', 'Ein Befehl des Kommandanten, laut und bestimmt.']
  }),
  live('npc.drone.alarm', 'drone', 'alarm', 2.4, {
    text: 'callout.machine', when: WHEN,
    direction: ['Flat, quick, clipped announcement.', 'Flache, schnelle, abgehackte Durchsage.']
  }),
  live('npc.enforcer.alarm', 'enforcer', 'alarm', 2.6, {
    text: 'callout.machine', when: WHEN,
    direction: ['Cold, heavy, every word weighted.', 'Kalt, schwer, jedes Wort betont.']
  }),
  live('npc.goliath.alarm', 'goliath', 'alarm', 2.8, {
    text: 'callout.machine', when: WHEN,
    direction: ['Slow, booming, menacing.', 'Langsam, dröhnend, bedrohlich.']
  }),
  live('npc.hound.alarm', 'hound', 'alarm', 2.4, {
    text: 'callout.machine', when: WHEN,
    direction: ['Fast and excited, like a yapping little dog.', 'Schnell und aufgeregt, wie ein kläffender kleiner Hund.']
  })
]

/** Which voice a unit speaks with (a type-only import: the tools strip it). */
export const SPEAKER_OF = (kind: PostKind, role: 'engineer' | null): Speaker => {
  switch (kind) {
    case 'guard': return role === 'engineer' ? 'engineer' : 'guard'
    case 'sentry': return 'sentry'
    case 'commander': return 'warden'
    case 'drone': return 'drone'
    case 'enforcer': return 'enforcer'
    case 'goliath': return 'goliath'
    case 'hound': return 'hound'
    default: return 'guard'
  }
}

/** A key's file name, without the extension. */
export const fileName = (key: string): string => key.replace(/\./g, '_')
