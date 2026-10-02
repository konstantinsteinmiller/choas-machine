import { defineConfig } from 'vitest/config'

/**
 * The end-to-end suite: the real game in a headless Chrome.
 *
 *   pnpm test:e2e
 *
 * Kept apart from the unit suite (`vitest.config.ts`): it starts a dev server
 * and a browser, takes minutes, and needs a Chrome on the machine
 * (`E2E_CHROME` to point at one). One file at a time, one browser: it is a
 * single job for the machine's worker budget.
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    environment: 'node',
    globalSetup: ['./e2e/globalSetup.ts'],
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    retry: 0
  }
})
