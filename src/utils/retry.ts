/**
 * Bounded retry with backoff for loads the game cannot do without (its own
 * code chunks, locale bundles). A dropped request on a flaky network surfaces
 * as `TypeError: NetworkError when attempting to fetch resource.` (Firefox) /
 * `Failed to fetch dynamically imported module` (Chromium); one more try a
 * moment later usually lands. Same origin only — nothing here adds a host.
 */
export const withRetry = async <T>(load: () => Promise<T>, tries = 3, baseMs = 400): Promise<T> => {
  for (let i = 1; ; i++) {
    try {
      return await load()
    } catch (e) {
      if (i >= tries) throw e
      await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** (i - 1)))
    }
  }
}

/** A readable one-liner for logs: an Error serialises to `{}` in error reports. */
export const describeError = (e: unknown): { name?: string; message: string; stack?: string } =>
  e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { message: String(e) }
