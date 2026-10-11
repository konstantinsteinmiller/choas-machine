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

export type Speaker = 'guard' | 'sentry' | 'engineer' | 'warden' | 'drone' | 'enforcer' | 'goliath' | 'hound' | 'hero' | 'heroHush'
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
  hound: { name: 'Scrap Hound', role: ['A robot dog', 'Ein Roboterhund'], voice: ['Small, yappy, a toy speaker.', 'Klein, kläffend, ein Spielzeuglautsprecher.'] },
  hero: { name: 'CM-07', role: ['The player\'s robot, a show-off', 'Der Roboter des Spielers, ein Angeber'], voice: ['Cocky, bright, a showman on stage.', 'Großspurig, hell, ein Showmaster auf der Bühne.'] },
  heroHush: { name: 'CM-07 (whispering)', role: ['The player\'s robot, unseen', 'Der Roboter des Spielers, ungesehen'], voice: ['The same showman, whispering so nobody hears.', 'Derselbe Showmaster, flüsternd, damit es keiner hört.'] }
}

export const SCENES: ReadonlyArray<{ id: string; title: Both }> = [
  { id: 'alarm', title: ['A defender is sure', 'Ein Verteidiger ist sicher'] },
  { id: 'quip', title: ['CM-07 comments (#126)', 'CM-07 kommentiert (#126)'] }
]

/**
 * ─── CM-07's one-liners (#126) ───────────────────────────────────────────────
 *
 * The player's robot is the clown star of the show, but never chatty: a line
 * now and then on a big moment. Unseen it WHISPERS (nobody must hear it);
 * spotted, with nothing to lose, it says it out loud. Each line has a take
 * for each way it can be said (`hero.<id>.loud`, `hero.<id>.whisper`); its
 * words are `quip.<id>` (the bubble). The rules of when are `sim/quips.ts`.
 */
export const QUIP_IDS = [
  'burnHuman', 'burnMachine', 'headshot', 'alarm', 'lowHealth', 'lowAmmo', 'noAmmo', 'takedown', 'decoy', 'disguise', 'multiKill', 'allClear', 'extract', 'loot'
] as const
export type QuipId = typeof QUIP_IDS[number]

/** How each can be said: the alarm is never whispered (it is the moment it was seen), low health only unseen. */
export const QUIP_SAID: Readonly<Record<QuipId, { loud: boolean; whisper: boolean }>> = {
  burnHuman: { loud: true, whisper: true },
  burnMachine: { loud: true, whisper: true },
  headshot: { loud: true, whisper: true },
  alarm: { loud: true, whisper: false },
  lowHealth: { loud: false, whisper: true },
  lowAmmo: { loud: true, whisper: true },
  noAmmo: { loud: true, whisper: true },
  takedown: { loud: true, whisper: true },
  decoy: { loud: true, whisper: true },
  disguise: { loud: true, whisper: true },
  multiKill: { loud: true, whisper: true },
  allClear: { loud: true, whisper: true },
  extract: { loud: true, whisper: true },
  loot: { loud: true, whisper: true }
}

/** The moment each is said (for the model). */
const QUIP_WHEN: Readonly<Record<QuipId, Both>> = {
  burnHuman: ['It has just burnt a guard\'s body to ash with its flamethrower', 'Er hat gerade die Leiche einer Wache mit dem Flammenwerfer zu Asche verbrannt'],
  burnMachine: ['It has just melted a wrecked machine to slag', 'Er hat gerade eine zerstörte Maschine zu Schlacke geschmolzen'],
  headshot: ['One sniper round, one headshot, one down', 'Ein Scharfschützenschuss, ein Kopftreffer, einer weniger'],
  alarm: ['The alarm is up and everything is chasing it', 'Der Alarm läuft und alles jagt ihn'],
  lowHealth: ['Its armour is nearly gone, nobody has noticed it', 'Seine Panzerung ist fast hin, keiner hat ihn bemerkt'],
  lowAmmo: ['Its gun is nearly empty', 'Seine Waffe ist fast leer'],
  noAmmo: ['It pulls the trigger and the gun is empty: nothing left to fire (#199)', 'Er drückt ab und die Waffe ist leer: nichts mehr zu schießen (#199)'],
  takedown: ['It has just taken a guard down from behind, silently', 'Er hat gerade eine Wache lautlos von hinten ausgeschaltet'],
  decoy: ['A guard walks over to its hologram decoy', 'Eine Wache geht zu seinem Hologramm-Köder'],
  disguise: ['A guard inspected its disguise and walked away', 'Eine Wache hat seine Tarnung untersucht und ist weitergegangen'],
  multiKill: ['One rocket took out two at once', 'Eine Rakete hat zwei auf einmal erwischt'],
  allClear: ['The base gave up looking for it', 'Die Basis hat die Suche nach ihm aufgegeben'],
  extract: ['It is riding out of the base', 'Er reitet aus der Basis hinaus'],
  loot: ['It has just stripped a pile of scrap', 'Er hat gerade einen Schrotthaufen ausgeschlachtet']
}

const QUIP_LOUD: Both = ['Out loud, cocky and delighted with itself, a showman playing to the crowd.', 'Laut, großspurig und hochzufrieden mit sich, ein Showmaster vor Publikum.']
const QUIP_HUSH: Both = ['Whispered, close and conspiratorial, still very pleased with itself.', 'Geflüstert, nah und verschwörerisch, immer noch sehr zufrieden mit sich.']

/** Its words run longer than a shout: a breath more than the words take. */
const QUIP_MAX: Readonly<Record<QuipId, number>> = {
  burnHuman: 3, burnMachine: 3, headshot: 2.4, alarm: 1.6, lowHealth: 2.4, lowAmmo: 3.6, noAmmo: 1.4, takedown: 2,
  decoy: 2.4, disguise: 2.4, multiKill: 2.2, allClear: 2.4, extract: 2.8, loot: 1.6
}

/** CM-07's lines, both takes of each, in catalogue order. */
export const quipLines = (): VoiceLine[] => QUIP_IDS.flatMap((id) => {
  const out: VoiceLine[] = []
  if (QUIP_SAID[id].loud) out.push({ key: `hero.${id}.loud`, speaker: 'hero', scene: 'quip', status: 'live', text: `quip.${id}`, when: QUIP_WHEN[id], direction: QUIP_LOUD, max: QUIP_MAX[id] })
  if (QUIP_SAID[id].whisper) out.push({ key: `hero.${id}.whisper`, speaker: 'heroHush', scene: 'quip', status: 'live', text: `quip.${id}`, when: QUIP_WHEN[id], direction: QUIP_HUSH, max: QUIP_MAX[id] + 0.3 })
  return out
})

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
  }),
  ...quipLines()
]

/** Which voice a unit speaks with (a type-only import: the tools strip it). */
export const SPEAKER_OF = (kind: PostKind, role: 'engineer' | 'grenadier' | 'marksman' | null): Speaker => {
  switch (kind) {
    case 'guard': return role === 'engineer' ? 'engineer' : 'guard'
    case 'sentry': return 'sentry'
    case 'commander': return 'warden'
    case 'drone': return 'drone'
    case 'enforcer': return 'enforcer'
    case 'goliath': return 'goliath'
    case 'hound': return 'hound'
    // A Roomba speaks with a drone's little machine voice (#72).
    case 'roomba': return 'drone'
    default: return 'guard'
  }
}

/** A key's file name, without the extension. */
export const fileName = (key: string): string => key.replace(/\./g, '_')
