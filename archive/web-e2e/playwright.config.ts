import { defineConfig } from '@playwright/test';

// Real-browser tests. They use the system Chrome (no browser download) against a mock TMDB, so they need no
// token or network. `npm run e2e` starts the mock, the backend (fresh temp DB) and the Vite dev server itself.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1, // one shared backend cache; tests are written to be order-independent but not parallel-safe
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node e2e/mock-tmdb.mjs', url: 'http://localhost:4100/__log', reuseExistingServer: false },
    {
      command: 'npm run start -w backend',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: false,
      env: {
        TMDB_TOKEN: 'e2e-fake-token',
        TMDB_BASE_URL: 'http://localhost:4100/3',
        DB_PATH: '../e2e/.tmp/e2e.db',
        PORT: '4000',
      },
    },
    { command: 'npm run dev -w frontend', url: 'http://localhost:5173', reuseExistingServer: false },
  ],
});
