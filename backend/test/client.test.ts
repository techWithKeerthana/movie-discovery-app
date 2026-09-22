import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { RateLimiter } from '../src/tmdb/rateLimiter.js';
import { fakeFetch, json, makeClient, movie, pageOf } from './helpers.js';
import { parseMoviePage } from '../src/tmdb/mappers.js';

const get = (c: ReturnType<typeof makeClient>, ttl = 60_000, params = { page: 1 }) =>
  c.get('/discover/movie', params, ttl, parseMoviePage);

describe('caching', () => {
  it('serves repeated identical requests from cache (param order does not matter)', async () => {
    const f = fakeFetch(() => json(pageOf([movie()])));
    const c = makeClient(f);
    await c.get('/x', { a: 1, b: 2 }, 60_000, parseMoviePage);
    await c.get('/x', { b: 2, a: 1 }, 60_000, parseMoviePage);
    expect(f.calls).toHaveLength(1);
  });

  it('refetches after the TTL expires', async () => {
    let t = 0;
    const f = fakeFetch(() => json(pageOf([movie()])));
    const c = makeClient(f, { now: () => t });
    await get(c, 1000);
    t = 1001;
    await get(c, 1000);
    expect(f.calls).toHaveLength(2);
  });
});

describe('single-flight de-duplication', () => {
  it('collapses concurrent identical requests into one upstream call', async () => {
    const f = fakeFetch(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return json(pageOf([movie()]));
    });
    const c = makeClient(f);
    const results = await Promise.all(Array.from({ length: 25 }, () => get(c)));
    expect(f.calls).toHaveLength(1);
    expect(results.every((r) => r.data.items.length === 1)).toBe(true);
  });

  it('does not merge different queries', async () => {
    const f = fakeFetch(() => json(pageOf([movie()])));
    const c = makeClient(f);
    await Promise.all([get(c, 1000, { page: 1 }), get(c, 1000, { page: 2 })]);
    expect(f.calls).toHaveLength(2);
  });
});

describe('failure handling', () => {
  it('retries once on 5xx then succeeds', async () => {
    const f = fakeFetch((_u, n) => (n === 1 ? json({}, 502) : json(pageOf([movie()]))));
    const r = await get(makeClient(f));
    expect(r.data.items).toHaveLength(1);
    expect(f.calls).toHaveLength(2);
  });

  it('honours Retry-After on 429', async () => {
    const f = fakeFetch((_u, n) => (n === 1 ? json({}, 429, { 'retry-after': '0.01' }) : json(pageOf([movie()]))));
    expect((await get(makeClient(f))).stale).toBe(false);
    expect(f.calls).toHaveLength(2);
  });

  it('times out slow upstreams with UPSTREAM_TIMEOUT', async () => {
    const f = fakeFetch(() => new Promise(() => {})); // never resolves
    const f2 = (async (u: string, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))) as never;
    const c = makeClient(f, { fetchImpl: f2, timeoutMs: 30, retries: 0 });
    await expect(get(c)).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });

  it('does not retry 404 and maps it to NOT_FOUND', async () => {
    const f = fakeFetch(() => json({}, 404));
    await expect(get(makeClient(f))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.calls).toHaveLength(1);
  });

  it('rejects malformed payloads with UPSTREAM_INVALID and never caches them', async () => {
    let bad = true;
    const f = fakeFetch(() => (bad ? json({ nope: 1 }) : json(pageOf([movie()]))));
    const c = makeClient(f);
    await expect(get(c)).rejects.toMatchObject({ code: 'UPSTREAM_INVALID' });
    bad = false;
    expect((await get(c)).data.items).toHaveLength(1);
  });

  it('serves STALE cached data when TMDB fails after the entry expired', async () => {
    let t = 0;
    let down = false;
    const f = fakeFetch(() => (down ? json({}, 503) : json(pageOf([movie()]))));
    const c = makeClient(f, { now: () => t, retries: 0 });
    await get(c, 1000);
    t = 5000;
    down = true;
    const r = await get(c, 1000);
    expect(r.stale).toBe(true);
    expect(r.data.items[0]?.title).toBe('Alien');
    expect(c.stats().staleServed).toBe(1);
  });

  it('errors (no stale available) when TMDB is down and nothing is cached', async () => {
    const c = makeClient(fakeFetch(() => json({}, 503)), { retries: 0 });
    await expect(get(c)).rejects.toBeInstanceOf(AppError);
    await expect(get(c)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
  });

  it('opens the circuit after repeated failures and stops calling upstream', async () => {
    let t = 0;
    const f = fakeFetch(() => json({}, 503));
    const c = makeClient(f, { retries: 0, breakerThreshold: 3, breakerCooldownMs: 10_000, now: () => t });
    for (let i = 0; i < 3; i++) await get(c, 1000, { page: i }).catch(() => {});
    expect(f.calls).toHaveLength(3);
    await get(c, 1000, { page: 99 }).catch(() => {});
    expect(f.calls).toHaveLength(3); // short-circuited
    expect(c.stats().breakerOpen).toBe(true);
    t = 10_001; // cooldown over: probes again
    await get(c, 1000, { page: 100 }).catch(() => {});
    expect(f.calls).toHaveLength(4);
  });
});

describe('RateLimiter', () => {
  it('spaces a burst of calls at the configured rate instead of rejecting them', async () => {
    const limiter = new RateLimiter(100); // 10ms apart
    const start = Date.now();
    await Promise.all(Array.from({ length: 6 }, () => limiter.acquire()));
    expect(Date.now() - start).toBeGreaterThanOrEqual(45); // 5 gaps * 10ms, minus timer slack
  });
});
