import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db/db.js';
import { openDatabase } from '../src/db/db.js';
import { fakeFetch, json, makeClient, movie, pageOf, rmSyncRetry } from './helpers.js';

const tmdb = fakeFetch((url) => {
  if (url.pathname.endsWith('/genre/movie/list')) return json({ genres: [{ id: 27, name: 'Horror' }] });
  if (url.pathname.endsWith('/discover/movie')) return json(pageOf([movie(), movie({ id: 2, title: 'Zed', vote_average: 9, release_date: '2020-01-01' })]));
  if (url.pathname.endsWith('/search/movie'))
    return json(
      pageOf([
        movie({ id: 10, title: 'B Movie', vote_average: 5, vote_count: 10, genre_ids: [35] }),
        movie({ id: 11, title: 'A Movie', vote_average: 8, vote_count: 10, genre_ids: [27] }),
        movie({ id: 12, title: 'Unrated', vote_count: 0, vote_average: 0, genre_ids: [27] }),
      ]),
    );
  if (url.pathname.endsWith('/movie/404')) return json({}, 404);
  if (url.pathname.match(/\/movie\/\d+$/)) return json({ ...movie(), genres: [{ id: 27, name: 'Horror' }] });
  return json({}, 404);
});

const dir = mkdtempSync(join(tmpdir(), 'trackzio-'));
const dbs: Db[] = [];
let nextFile = 0;
// Each call opens its own file by default (many separate libSQL connections piling up against ONE file
// slows Windows' handle release enough to make cleanup flaky). Pass a fixed `file` only for a test that
// specifically needs to reopen the same database, e.g. to prove persistence across an app restart.
const build = async (file = `db${nextFile++}.db`, corsOrigin = '*') => {
  const db = await openDatabase(`file:${join(dir, file)}`);
  dbs.push(db);
  return createApp({ config: { CORS_ORIGIN: corsOrigin }, tmdb: makeClient(tmdb), db });
};
afterAll(async () => {
  dbs.forEach((d) => d.close()); // Windows can't delete a directory holding open libSQL files
  await rmSyncRetry(dir);
});

describe('movie routes', () => {
  let app: Awaited<ReturnType<typeof build>>;
  beforeAll(async () => {
    app = await build();
  });

  it('GET /api/movies returns a normalised page', async () => {
    const r = await request(app).get('/api/movies?genre=27&sort=rating.desc&page=1&year=');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ page: 1, totalPages: 3 });
    expect(r.body.items[0]).toHaveProperty('posterUrl');
    const upstream = tmdb.calls.find((c) => c.startsWith('/3/discover/movie'))!;
    expect(upstream).toContain('sort_by=vote_average.desc');
    expect(upstream).toContain('with_genres=27');
    expect(upstream).toContain('vote_count.gte=300');
    expect(upstream).not.toContain('primary_release_year'); // empty param dropped
  });

  it('search mode applies genre/rating to the page itself and ignores sort', async () => {
    const r = await request(app).get('/api/movies?query=movie&genre=27&minRating=1&sort=title.asc');
    expect(r.body.items.map((m: { id: number }) => m.id)).toEqual([11]); // 10 wrong genre, 12 unrated
  });

  it('validates input with a BAD_REQUEST error contract', async () => {
    const r = await request(app).get('/api/movies?page=9999&sort=nope');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: 'BAD_REQUEST', retryable: false });
  });

  it('maps upstream 404 to NOT_FOUND and serves genres', async () => {
    expect((await request(app).get('/api/movies/404')).body.error.code).toBe('NOT_FOUND');
    expect((await request(app).get('/api/genres')).body).toEqual([{ id: 27, name: 'Horror' }]);
    expect((await request(app).get('/api/movies/1')).body.genres).toHaveLength(1);
  });

  it('GET /api/movies/surprise returns a single normalised movie', async () => {
    const r = await request(app).get('/api/movies/surprise');
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('posterUrl');
    expect(typeof r.body.id).toBe('number');
  });

  it('GET /api/movies/recommended filters by genre and excludes given ids', async () => {
    const r = await request(app).get('/api/movies/recommended?genreId=27&excludeIds=1');
    expect(r.status).toBe(200);
    expect(r.body.map((m: { id: number }) => m.id)).toEqual([2]);
    const upstream = tmdb.calls.filter((c) => c.startsWith('/3/discover/movie')).at(-1)!;
    expect(upstream).toContain('with_genres=27');
  });

  it('GET /api/movies/recommended requires genreId', async () => {
    expect((await request(app).get('/api/movies/recommended')).status).toBe(400);
  });

  it('unknown api route returns JSON 404', async () => {
    const r = await request(app).get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('wishlist persistence', () => {
  const device = randomUUID();
  const snap = { id: 1, title: 'Alien', year: 1979, posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg', backdropUrl: null, rating: 8, voteCount: 5, genreIds: [27], overview: '' };

  it('requires a valid device id', async () => {
    expect((await request(await build()).get('/api/wishlist')).status).toBe(400);
    expect((await request(await build()).get('/api/wishlist').set('X-Device-Id', 'abc')).status).toBe(400);
  });

  it('adds idempotently, survives an app+db restart, and is isolated per device', async () => {
    const a = await build('persist.db');
    expect((await request(a).put('/api/wishlist/1').set('X-Device-Id', device).send(snap)).status).toBe(201);
    expect((await request(a).put('/api/wishlist/1').set('X-Device-Id', device).send(snap)).status).toBe(200);

    const restarted = await build('persist.db'); // brand-new app + reopened libSQL file, same path as `a`
    const list = await request(restarted).get('/api/wishlist').set('X-Device-Id', device);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ id: 1, title: 'Alien' });

    const other = await request(restarted).get('/api/wishlist').set('X-Device-Id', randomUUID());
    expect(other.body.items).toHaveLength(0);

    expect((await request(restarted).delete('/api/wishlist/1').set('X-Device-Id', device)).status).toBe(204);
    expect((await request(restarted).get('/api/wishlist').set('X-Device-Id', device)).body.items).toHaveLength(0);
  });

  it('rejects mismatched ids and non-TMDB image URLs', async () => {
    const app = await build();
    expect((await request(app).put('/api/wishlist/2').set('X-Device-Id', device).send(snap)).status).toBe(400);
    const evil = { ...snap, posterUrl: 'https://evil.example/x.jpg' };
    expect((await request(app).put('/api/wishlist/1').set('X-Device-Id', device).send(evil)).status).toBe(400);
  });
});

describe('CORS (comma-separated allow-list, "*." subdomain wildcards)', () => {
  const allowlist = 'http://localhost:8081,https://trackzio.vercel.app,*.vercel.app';

  it('allows an exact-match origin and any subdomain matching a "*." pattern', async () => {
    const app = await build(undefined, allowlist);
    const dev = (await request(app).get('/api/movies').set('Origin', 'http://localhost:8081')).headers['access-control-allow-origin'];
    expect(dev).toBe('http://localhost:8081');
    const preview = (await request(app).get('/api/movies').set('Origin', 'https://my-preview-abc123.vercel.app')).headers['access-control-allow-origin'];
    expect(preview).toBe('https://my-preview-abc123.vercel.app');
  });

  it('rejects an origin that is not on the allow-list', async () => {
    const app = await build(undefined, allowlist);
    const res = await request(app).get('/api/movies').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never blocks a request with no Origin header (native app, curl, server-to-server)', async () => {
    const app = await build(undefined, allowlist);
    expect((await request(app).get('/api/movies')).status).toBe(200);
  });
});
