/**
 * A count or a currency amount, grouped the way the player's language groups
 * digits. Past a hundred thousand it is shortened (`128K`), so a wallet never
 * outgrows its pill.
 */
const cache = new Map<string, Intl.NumberFormat>()

const formatter = (locale: string, compact: boolean): Intl.NumberFormat => {
  const key = `${locale}|${compact}`
  let f = cache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, compact ? { notation: 'compact', maximumFractionDigits: 1 } : {})
    } catch {
      // A locale tag the runtime does not know: plain digits beat a throw.
      f = new Intl.NumberFormat('en', compact ? { notation: 'compact', maximumFractionDigits: 1 } : {})
    }
    cache.set(key, f)
  }
  return f
}

export const formatAmount = (n: number, locale: string): string =>
  formatter(locale, Math.abs(n) >= 100000).format(Math.round(n))

/** A duration as a clock: `0:59`, `12:05`, `3:59:59`. */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
