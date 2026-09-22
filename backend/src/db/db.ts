import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client, type InArgs } from '@libsql/client';

/**
 * libSQL (SQLite-compatible). `url` is `file:./data/trackzio.db` for local dev/tests (no external
 * service, no credentials) or `libsql://<db>.turso.io` for the deployed Turso database, with
 * `authToken` required only in the remote case. Same schema, same queries, either way.
 */
export type Db = Client;

/**
 * Versioned migrations, tracked in `_schema_migrations` (one row per applied migration, id = its index).
 * NOT `PRAGMA user_version`: Turso's remote (Hrana) protocol accepts reading it but rejects writing it
 * ("SQL not allowed statement"), even though it works over a local `file:` connection — a real gap
 * between the two transports that a plain table sidesteps identically on both. Append new entries; never
 * edit a shipped one. `wishlist` stores a JSON snapshot of the display fields next to (device_id,
 * movie_id), so the wishlist renders without TMDB, while all other movie metadata stays cache-only.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE wishlist (
     device_id TEXT    NOT NULL,
     movie_id  INTEGER NOT NULL,
     snapshot  TEXT    NOT NULL,
     added_at  INTEGER NOT NULL,
     PRIMARY KEY (device_id, movie_id)
   );
   CREATE INDEX wishlist_by_added ON wishlist (device_id, added_at DESC);`,
];

export async function openDatabase(url: string, authToken?: string): Promise<Db> {
  if (url.startsWith('file:')) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  const db = createClient({ url, authToken });
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute('CREATE TABLE IF NOT EXISTS _schema_migrations (id INTEGER PRIMARY KEY)');
  const { rows } = await db.execute('SELECT COUNT(*) AS n FROM _schema_migrations');
  let version = Number(rows[0]?.n ?? 0);
  for (; version < MIGRATIONS.length; version++) {
    // The migration's statements AND recording it as applied run as one batch (libSQL runs a batch as a
    // single transaction), so a crash mid-migration can never leave one applied without the other.
    const statements: (string | { sql: string; args: InArgs })[] = MIGRATIONS[version]!
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    statements.push({ sql: 'INSERT INTO _schema_migrations (id) VALUES (?)', args: [version] });
    await db.batch(statements, 'write');
  }
  return db;
}
