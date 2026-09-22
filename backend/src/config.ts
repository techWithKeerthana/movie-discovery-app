import { z } from 'zod';

// Node 21.7+ built-in .env loader — no dotenv dependency. Missing file is fine (CI/prod set real env vars).
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  /* no .env file */
}

const schema = z.object({
  PORT: z.coerce.number().int().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TMDB_TOKEN: z.string().optional(), // v4 "API Read Access Token" (preferred)
  TMDB_API_KEY: z.string().optional(), // v3 key fallback
  TMDB_BASE_URL: z.string().default('https://api.themoviedb.org/3'),
  TMDB_TIMEOUT_MS: z.coerce.number().int().default(5000),
  TMDB_RATE_PER_SEC: z.coerce.number().default(40), // TMDB soft limit is ~50/s
  // libSQL connection. Local dev/tests: default file: URL, no account needed. Deployed (Render): a
  // libsql://<db>.turso.io URL + DATABASE_AUTH_TOKEN, so the wishlist survives redeploys and sleep/wake
  // (Render's own disk is ephemeral; Turso's free tier is not).
  DATABASE_URL: z.string().default('file:./data/trackzio.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
