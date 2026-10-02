import { createServer, type ViteDevServer } from 'vite'

/**
 * Starts the game's own dev server on a free port for the run, and stops it
 * afterwards. The specs read its address from `E2E_URL`.
 *
 * An already running server can be used instead: set `E2E_URL` yourself.
 */
let server: ViteDevServer | null = null

export const setup = async (): Promise<void> => {
  if (process.env.E2E_URL) return
  server = await createServer({
    // Any free port: never the one a developer's own server is on.
    // No hot reload and no file watching: a page that reloads itself because
    // somebody saved a file elsewhere in the repo fails a test that did
    // nothing wrong.
    server: { port: 0, strictPort: false, host: '127.0.0.1', open: false, hmr: false, watch: null },
    logLevel: 'warn'
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('[e2e] the dev server gave no address')
  process.env.E2E_URL = `http://127.0.0.1:${address.port}/`
  // The served page must be THIS game, not a stale server answering happily.
  const html = await (await fetch(process.env.E2E_URL)).text()
  if (!/<title>\s*Chaos Machine\s*<\/title>/.test(html)) throw new Error(`[e2e] ${process.env.E2E_URL} is not serving Chaos Machine`)
}

export const teardown = async (): Promise<void> => {
  await server?.close()
  server = null
}
