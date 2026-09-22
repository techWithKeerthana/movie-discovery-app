import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';

/**
 * libSQL (SQLite-compatible). `url` is `file:./data/trackzio.db` for local dev/tests (no external
 * service, no credentials) or `libsql://<db>.turso.io` for the deployed Turso database, with
 * `authToken` required only in the remote case. Same schema, same queries, either way.
 */
export type Db = Client;

/**
 * Versioned migrations tracked with `PRAGMA user_version`. Append new entries; never edit old ones.
 * `wishlist` stores a JSON snapshot of the display fields next to (device_id, movie_id), so the
 * wishlist renders without TMDB, while all other movie metadata stays cache-only.
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
  const { rows } = await db.execute('PRAGMA user_version');
  let version = Number(rows[0]?.user_version ?? 0);
  for (; version < MIGRATIONS.length; version++) {
    // The migration's statements AND the version bump run as one batch (libSQL runs a batch as a single
    // transaction), so a crash mid-migration can never leave the version bumped without the schema, or
    // the schema changed without the version bumped.
    const statements = MIGRATIONS[version]!
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    statements.push(`PRAGMA user_version = ${version + 1}`);
    await db.batch(statements, 'write');
  }
  return db;
}
