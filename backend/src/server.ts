import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { TmdbClient } from './tmdb/client.js';
import { openDatabase } from './db/db.js';

const config = loadConfig();

if (!config.TMDB_TOKEN && !config.TMDB_API_KEY) {
  console.error(
    '\nMissing TMDB credentials. Copy backend/.env.example to backend/.env and set TMDB_TOKEN\n' +
      '(TMDB > Settings > API > "API Read Access Token").\n',
  );
  process.exit(1);
}

// Presence only, never the value. Shows at a glance that backend/.env was found and parsed.
console.log(`TMDB token present: ${Boolean(config.TMDB_TOKEN)}${config.TMDB_API_KEY ? ' (v3 api key also present)' : ''}`);

const tmdb = new TmdbClient({
  baseUrl: config.TMDB_BASE_URL,
  token: config.TMDB_TOKEN,
  apiKey: config.TMDB_API_KEY,
  timeoutMs: config.TMDB_TIMEOUT_MS,
  ratePerSec: config.TMDB_RATE_PER_SEC,
});
const db = await openDatabase(config.DATABASE_URL, config.DATABASE_AUTH_TOKEN);
const app = createApp({ config, tmdb, db });

const server = app.listen(config.PORT, () => console.log(`API listening on http://localhost:${config.PORT}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => {
      db.close(); // no-op over Turso's HTTP transport; closes the local connection when using a file: URL
      process.exit(0);
    });
  });
}
