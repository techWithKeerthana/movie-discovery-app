import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { MovieSummary } from '@trackzio/shared';
import type { Db } from '../src/db/db.js';
import { openDatabase } from '../src/db/db.js';
import { MAX_WISHLIST_PER_DEVICE, WishlistService } from '../src/services/wishlistService.js';
import { rmSyncRetry } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'trackzio-wl-'));
const opened: Db[] = [];
const open = async (file = 'wl.db') => {
  const db = await openDatabase(`file:${join(dir, file)}`);
  opened.push(db);
  return db;
};
afterAll(async () => {
  opened.forEach((d) => {
    try {
      d.close();
    } catch {
      /* already closed by the test */
    }
  });
  await rmSyncRetry(dir);
});

const m = (id: number): MovieSummary => ({
  id,
  title: `Movie ${id}`,
  year: 2000,
  posterUrl: null,
  backdropUrl: null,
  rating: 7,
  voteCount: 1,
  genreIds: [],
  overview: '',
});
const D1 = '11111111-1111-4111-8111-111111111111';
const D2 = '22222222-2222-4222-8222-222222222222';

describe('WishlistService (libSQL)', () => {
  it('returns newest first and keeps the original position when re-added', async () => {
    const svc = new WishlistService(await open('order.db'));
    await svc.add(D1, m(1));
    await new Promise((r) => setTimeout(r, 3));
    await svc.add(D1, m(2));
    await new Promise((r) => setTimeout(r, 3));
    expect(await svc.add(D1, m(1))).toBe('exists'); // re-adding must not bump it to the top
    expect((await svc.list(D1)).map((x) => x.id)).toEqual([2, 1]);
  });

  it('persists to disk: a second connection to the same file sees the data', async () => {
    const a = await open('persist.db');
    await new WishlistService(a).add(D1, m(5));
    a.close();
    const b = await open('persist.db');
    expect((await new WishlistService(b).list(D1)).map((x) => x.id)).toEqual([5]);
  });

  it('runs migrations once: reopening an existing database does not fail or wipe data', async () => {
    const first = await open('migrate.db');
    await new WishlistService(first).add(D1, m(9));
    expect(Number((await first.execute('PRAGMA user_version')).rows[0]?.user_version)).toBe(1);
    first.close();
    const again = await open('migrate.db');
    expect(Number((await again.execute('PRAGMA user_version')).rows[0]?.user_version)).toBe(1);
    expect(await new WishlistService(again).list(D1)).toHaveLength(1);
  });

  it('isolates devices from each other, including removals', async () => {
    const svc = new WishlistService(await open('iso.db'));
    await svc.add(D1, m(1));
    await svc.add(D2, m(1));
    await svc.remove(D1, 1);
    expect(await svc.list(D1)).toHaveLength(0);
    expect(await svc.list(D2)).toHaveLength(1);
    await svc.remove(D1, 999); // removing something absent is a no-op, not an error
  });

  it('skips a corrupt or schema-invalid row instead of failing the whole wishlist', async () => {
    const db = await open('corrupt.db');
    const svc = new WishlistService(db);
    await svc.add(D1, m(1));
    await db.execute({ sql: 'INSERT INTO wishlist VALUES (?, ?, ?, ?)', args: [D1, 2, '{not json', Date.now()] });
    await db.execute({ sql: 'INSERT INTO wishlist VALUES (?, ?, ?, ?)', args: [D1, 3, JSON.stringify({ id: 3 }), Date.now()] });
    expect((await svc.list(D1)).map((x) => x.id)).toEqual([1]);
  });

  it(
    'enforces the per-device cap, and other devices are unaffected',
    async () => {
      const svc = new WishlistService(await open('cap.db'));
      for (let i = 1; i <= MAX_WISHLIST_PER_DEVICE; i++) await svc.add(D1, m(i));
      expect(await svc.add(D1, m(MAX_WISHLIST_PER_DEVICE + 1))).toBe('full');
      expect(await svc.add(D2, m(1))).toBe('created');
    },
    30_000, // 1000 sequential round trips over the libSQL client; each has promise/IPC overhead node:sqlite's sync API didn't
  );

  it('stores values safely: SQL metacharacters in a title are data, not SQL', async () => {
    const svc = new WishlistService(await open('sql.db'));
    await svc.add(D1, { ...m(1), title: "Robert'); DROP TABLE wishlist;--" });
    expect((await svc.list(D1))[0]?.title).toContain('DROP TABLE');
    expect(await svc.list(D1)).toHaveLength(1);
  });
});
