/**
 * Voice cards (#65): how each NPC sounds, and the tone of every line. Input
 * for `tools/voice/` only. A card describes a clean, natural HUMAN voice; the
 * robot, the helmet and the toy speaker come from the speaker's FX chain
 * (`tools/voice/fx.mjs`), so the cloned voice stays stable.
 *
 * `referenceText` is read once, neutral, to make the frozen reference clip
 * every line is cloned from. A test keeps the cards, the tones and the
 * catalogue in step.
 */
import type { Speaker } from './voiceCatalog'

export const TONES_LIST = ['neutral', 'calm', 'warm', 'cheeky', 'excited', 'urgent', 'shout', 'whisper', 'menacing', 'sad', 'deadpan', 'pained', 'laugh'] as const
export type Tone = typeof TONES_LIST[number]

export interface VoiceCard {
  name: string
  gender: 'female' | 'male' | 'neutral'
  age: string
  pitch: 'low' | 'mid-low' | 'mid' | 'mid-high' | 'high'
  pace: 'slow' | 'measured' | 'medium' | 'brisk' | 'fast'
  timbre: string
  personality: string
  accent: { en: string; de: string }
  designPrompt: { en: string; de: string }
  referenceText: { en: string; de: string }
  notes: string
}

const STUDIO = { en: 'Clean, close-miked studio recording with no reverb.', de: 'Saubere, nah mikrofonierte Studioaufnahme ohne Hall.' }

export const CARDS: Readonly<Record<Speaker, VoiceCard>> = {
  guard: {
    name: 'Guard', gender: 'male', age: 'mid 20s', pitch: 'mid', pace: 'brisk',
    timbre: 'rough, slightly nasal tenor',
    personality: 'A young soldier on a boring night watch, jumpy, loud when startled.',
    accent: { en: 'General American, a little street-rough', de: 'Hochdeutsch, etwas rau' },
    designPrompt: {
      en: `A young man in his mid twenties with a rough, slightly nasal tenor voice, speaking briskly, a bit jumpy. ${STUDIO.en}`,
      de: `Ein junger Mann Mitte zwanzig, deutscher Muttersprachler, mit rauer, leicht nasaler Tenorstimme, spricht zügig und etwas nervös. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Night shift again. Walk the yard, check the gate, walk the yard again. Nothing ever happens out here, and the coffee is cold before it reaches the tower. Fine. One more round.',
      de: 'Schon wieder Nachtschicht. Den Hof ablaufen, das Tor prüfen, wieder den Hof ablaufen. Hier draußen passiert nie etwas, und der Kaffee ist kalt, bevor er den Turm erreicht. Na gut. Noch eine Runde.'
    },
    notes: 'Shouts its one line.'
  },
  sentry: {
    name: 'Sentry', gender: 'female', age: 'early 30s', pitch: 'mid-high', pace: 'medium',
    timbre: 'clear, bright, carrying',
    personality: 'A sharp-eyed lookout who has been waiting for exactly this.',
    accent: { en: 'Neutral General American, crisp', de: 'Klares Hochdeutsch' },
    designPrompt: {
      en: `A woman in her early thirties with a clear, bright, carrying voice, crisp and alert. ${STUDIO.en}`,
      de: `Eine Frau Anfang dreißig, deutsche Muttersprachlerin, mit klarer, heller, tragender Stimme, knapp und wachsam. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Tower two, all quiet. Wind from the west, visibility good, the searchlight sweeping on schedule. I can see the whole south yard from up here, every crate and every shadow.',
      de: 'Turm zwei, alles ruhig. Wind aus Westen, gute Sicht, der Suchscheinwerfer schwenkt nach Plan. Von hier oben sehe ich den ganzen Südhof, jede Kiste und jeden Schatten.'
    },
    notes: 'Called down from a tower.'
  },
  engineer: {
    name: 'Engineer', gender: 'male', age: 'late 50s', pitch: 'mid-low', pace: 'measured',
    timbre: 'gravelly, smoker-rough baritone',
    personality: 'An old mechanic who fixes everything and resents every interruption.',
    accent: { en: 'Working-class American', de: 'Hochdeutsch mit leicht ruhrpöttischem Einschlag' },
    designPrompt: {
      en: `An older man in his late fifties with a gravelly, rough baritone, measured and grumpy. ${STUDIO.en}`,
      de: `Ein älterer Mann Ende fünfzig, deutscher Muttersprachler, mit kratziger, rauer Baritonstimme, bedächtig und grantig. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Who broke the beacon this time? Every night the same thing. Hand me the wrench, the long one, and hold the light steady. Twenty years of fixing what these kids smash.',
      de: 'Wer hat diesmal das Leuchtfeuer kaputt gemacht? Jede Nacht dasselbe. Gib mir den Schlüssel, den langen, und halt die Lampe ruhig. Zwanzig Jahre repariere ich, was diese Jungs zerlegen.'
    },
    notes: 'Gruff rather than frightened.'
  },
  warden: {
    name: 'The Warden', gender: 'male', age: 'mid 40s', pitch: 'low', pace: 'measured',
    timbre: 'deep, resonant, commanding bass-baritone',
    personality: 'The base commander: certain, cold, used to being obeyed.',
    accent: { en: 'Clipped military American', de: 'Knappes, militärisches Hochdeutsch' },
    designPrompt: {
      en: `A man in his mid forties with a deep, resonant, commanding bass-baritone, measured and authoritative. ${STUDIO.en}`,
      de: `Ein Mann Mitte vierzig, deutscher Muttersprachler, mit tiefer, resonanter, befehlender Bass-Baritonstimme, gemessen und autoritär. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Report. All posts manned, all lights on schedule, the tank park secured. Nothing enters this fortress without my order. Double the watch on the south wall until dawn.',
      de: 'Meldung. Alle Posten besetzt, alle Scheinwerfer nach Plan, der Panzerpark gesichert. Nichts betritt diese Festung ohne meinen Befehl. Doppelte Wache auf der Südmauer bis zum Morgengrauen.'
    },
    notes: 'Heard through his helmet (the chain).'
  },
  drone: {
    name: 'Drone', gender: 'female', age: 'early 20s', pitch: 'high', pace: 'fast',
    timbre: 'light, precise, even',
    personality: 'A machine voice: no feeling, quick.',
    accent: { en: 'Neutral, precise', de: 'Neutral, präzise' },
    designPrompt: {
      en: `A young woman with a light, precise, even voice, speaking fast and flat without emotion, like an automated announcement. ${STUDIO.en}`,
      de: `Eine junge Frau, deutsche Muttersprachlerin, mit leichter, präziser, gleichmäßiger Stimme, spricht schnell und flach ohne Gefühl, wie eine automatische Durchsage. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Patrol route seven. Sector clear. Battery at eighty percent. Next waypoint in twelve seconds. Scanning the north ward. No movement detected. Continuing patrol.',
      de: 'Patrouillenroute sieben. Sektor frei. Batterie bei achtzig Prozent. Nächster Wegpunkt in zwölf Sekunden. Scanne den Nordbereich. Keine Bewegung erkannt. Setze Patrouille fort.'
    },
    notes: 'Small machine: the chain pitches it up and rings it.'
  },
  enforcer: {
    name: 'Enforcer', gender: 'male', age: 'mid 30s', pitch: 'mid-low', pace: 'slow',
    timbre: 'flat, heavy baritone',
    personality: 'A war machine: cold, heavy, every word a statement.',
    accent: { en: 'Neutral, deliberate', de: 'Neutral, bedächtig' },
    designPrompt: {
      en: `A man in his thirties with a flat, heavy baritone, speaking slowly and deliberately without emotion. ${STUDIO.en}`,
      de: `Ein Mann in den Dreißigern, deutscher Muttersprachler, mit flacher, schwerer Baritonstimme, spricht langsam und bedächtig ohne Gefühl. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Systems online. Armor at full strength. Weapons ready. Awaiting target designation from command. Standing by in the inner ward. All functions nominal.',
      de: 'Systeme online. Panzerung bei voller Stärke. Waffen bereit. Erwarte Zielzuweisung vom Kommando. Bereit im inneren Hof. Alle Funktionen normal.'
    },
    notes: 'The chain pitches it down and rings it low.'
  },
  goliath: {
    name: 'Goliath', gender: 'male', age: 'early 50s', pitch: 'low', pace: 'slow',
    timbre: 'very deep, booming bass',
    personality: 'The tank: huge, slow, unstoppable.',
    accent: { en: 'Neutral, slow', de: 'Neutral, langsam' },
    designPrompt: {
      en: `A big man in his fifties with a very deep, booming bass voice, speaking slowly and heavily. ${STUDIO.en}`,
      de: `Ein großer Mann in den Fünfzigern, deutscher Muttersprachler, mit sehr tiefer, dröhnender Bassstimme, spricht langsam und schwer. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Engine warm. Turret ready. The tank park is quiet tonight, but I am never asleep. When the alarm sounds, I move, and nothing in front of me stays standing.',
      de: 'Motor warm. Turm bereit. Im Panzerpark ist es heute ruhig, aber ich schlafe nie. Wenn der Alarm ertönt, fahre ich los, und nichts vor mir bleibt stehen.'
    },
    notes: 'The chain pitches it far down and adds a hull.'
  },
  hound: {
    name: 'Scrap Hound', gender: 'neutral', age: 'young', pitch: 'high', pace: 'fast',
    timbre: 'light, bouncy, excitable',
    personality: 'A robot dog that thinks it is the best guard in the base.',
    accent: { en: 'Neutral, cartoonish', de: 'Neutral, comichaft' },
    designPrompt: {
      en: `A young, light, bouncy voice, very excitable and fast, like an eager cartoon puppy. ${STUDIO.en}`,
      de: `Eine junge, leichte, hüpfende Stimme, deutsche Muttersprache, sehr aufgeregt und schnell, wie ein eifriger Comic-Welpe. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Sniff, sniff, something smells new over here! Is it a bone? Is it a boot? I found it first, I always find it first, and now everyone has to come and look!',
      de: 'Schnüffel, schnüffel, hier riecht etwas neu! Ist es ein Knochen? Ist es ein Stiefel? Ich hab es zuerst gefunden, ich finde immer alles zuerst, und jetzt müssen alle kommen und schauen!'
    },
    notes: 'A toy speaker: the chain pitches it up and narrows it.'
  },
  hero: {
    name: 'CM-07', gender: 'male', age: 'young adult', pitch: 'mid-high', pace: 'brisk',
    timbre: 'bright, playful, a grin you can hear',
    personality: 'The player\'s small robot: a cocky, clown-like show-off who treats every raid as a stage and himself as its star.',
    accent: { en: 'General American, a game-show host\'s bounce', de: 'Hochdeutsch, mit dem Schwung eines Showmasters' },
    designPrompt: {
      en: `A young man with a bright, playful, slightly nasal voice, brisk and cocky, grinning as he speaks, like a cartoon action hero who loves an audience. ${STUDIO.en}`,
      de: `Ein junger Mann, deutscher Muttersprachler, mit heller, verspielter, leicht nasaler Stimme, zügig und großspurig, man hört das Grinsen, wie ein Comic-Actionheld, der Publikum liebt. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Ladies and gentlemen, the show you have all been waiting for! In, out, not a scratch on the paint, and nobody even saw me coming. Hold the applause, I have a fortress to rob.',
      de: 'Meine Damen und Herren, die Show, auf die Sie alle gewartet haben! Rein, raus, kein Kratzer im Lack, und keiner hat mich kommen sehen. Applaus bitte später, ich habe eine Festung auszurauben.'
    },
    notes: 'The player\'s robot: a light robot chain (a little pitch, a faint ring), close and dry, no yard.'
  },
  heroHush: {
    name: 'CM-07 (whispering)', gender: 'male', age: 'young adult', pitch: 'mid-high', pace: 'medium',
    timbre: 'breathy whisper, playful, close to the ear',
    personality: 'The same show-off, sneaking: he cannot keep quiet, so he whispers.',
    accent: { en: 'General American', de: 'Hochdeutsch' },
    designPrompt: {
      en: `A young man WHISPERING the whole time, breathy and close to the microphone, playful and conspiratorial, no voiced tone at all, like telling a secret in a dark room. ${STUDIO.en}`,
      de: `Ein junger Mann, deutscher Muttersprachler, der die ganze Zeit FLÜSTERT, hauchig und nah am Mikrofon, verspielt und verschwörerisch, ganz ohne Stimmton, als erzähle er in einem dunklen Raum ein Geheimnis. ${STUDIO.de}`
    },
    referenceText: {
      en: 'Psst. Over here. Nobody saw that, right? Good. Keep it down, keep it moving, and whatever you do, do not tell the guards how handsome I am.',
      de: 'Psst. Hier drüben. Das hat keiner gesehen, oder? Gut. Leise bleiben, weitergehen, und egal was passiert, verrate den Wachen nicht, wie gut ich aussehe.'
    },
    notes: 'Chatterbox cannot whisper: it clones this whispered reference. The chain is the hero\'s, softer and quieter.'
  }
}

/** One tone per catalogue line, in catalogue order. */
export const TONES: Readonly<Record<string, Tone>> = {
  'npc.guard.alarm': 'shout',
  'npc.sentry.alarm': 'shout',
  'npc.engineer.alarm': 'shout',
  'npc.warden.alarm': 'shout',
  'npc.drone.alarm': 'urgent',
  'npc.enforcer.alarm': 'menacing',
  'npc.goliath.alarm': 'menacing',
  'npc.hound.alarm': 'excited',
  // CM-07 (#126): out loud, cocky; unseen, whispered.
  'hero.burnHuman.loud': 'cheeky',
  'hero.burnHuman.whisper': 'whisper',
  'hero.burnMachine.loud': 'cheeky',
  'hero.burnMachine.whisper': 'whisper',
  'hero.headshot.loud': 'cheeky',
  'hero.headshot.whisper': 'whisper',
  'hero.alarm.loud': 'excited',
  'hero.lowHealth.whisper': 'whisper',
  'hero.lowAmmo.loud': 'cheeky',
  'hero.lowAmmo.whisper': 'whisper',
  'hero.takedown.loud': 'cheeky',
  'hero.takedown.whisper': 'whisper',
  'hero.decoy.loud': 'cheeky',
  'hero.decoy.whisper': 'whisper',
  'hero.disguise.loud': 'cheeky',
  'hero.disguise.whisper': 'whisper',
  'hero.multiKill.loud': 'excited',
  'hero.multiKill.whisper': 'whisper',
  'hero.allClear.loud': 'cheeky',
  'hero.allClear.whisper': 'whisper',
  'hero.extract.loud': 'excited',
  'hero.extract.whisper': 'whisper',
  'hero.loot.loud': 'excited',
  'hero.loot.whisper': 'whisper'
}
