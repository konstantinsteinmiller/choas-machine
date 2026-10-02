import type { ENUM } from '@/types'

// Languages enabled in the OptionsModal picker. Each entry MUST have a
// matching `src/i18n/locales/<code>.ts` file — the Vite glob in
// `i18n/index.ts` registers each one as its own dynamic-import chunk so
// they only ship when the player actually switches to that language.
// English is statically bundled (fallback locale); every other code is
// fetched on demand. To add a 9th language: drop a new file under
// `locales/`, append the code here.
export const LANGUAGES: Array<string> = [
  'en',
  'ar',
  'zh',
  'de',
  'nl',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'kk',
  'pl',
  'pt',
  'ru',
  'th',
  'tr',
  'uk',
  'uz',
  'vi',
  // The rest of the portal locale set (#116: Playgama + Wavedash).
  'pt-PT',
  'zh-TW',
  'sv',
  'nb',
  'da',
  'fi',
  'ca',
  'gl',
  'az',
  'cs',
  'hr',
  'ro',
  'hu',
  'lv',
  'lt',
  'eo',
  'el',
  'bg'
]

// Native name (autonym) for each language, shown in the picker so every option
// is legible regardless of the active UI language — the standard for language
// switchers, and it avoids translating every language name into every language.
export const LANGUAGE_AUTONYMS: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
  zh: '简体中文',
  de: 'Deutsch',
  nl: 'Nederlands',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  kk: 'Қазақша',
  pl: 'Polski',
  pt: 'Português (Brasil)',
  ru: 'Русский',
  th: 'ไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  uz: 'Oʻzbekcha',
  vi: 'Tiếng Việt',
  'pt-PT': 'Português (Portugal)',
  'zh-TW': '繁體中文',
  sv: 'Svenska',
  nb: 'Norsk bokmål',
  da: 'Dansk',
  fi: 'Suomi',
  ca: 'Català',
  gl: 'Galego',
  az: 'Azərbaycanca',
  cs: 'Čeština',
  hr: 'Hrvatski',
  ro: 'Română',
  hu: 'Magyar',
  lv: 'Latviešu',
  lt: 'Lietuvių',
  eo: 'Esperanto',
  el: 'Ελληνικά',
  bg: 'Български'
}