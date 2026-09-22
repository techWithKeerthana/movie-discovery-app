import { describe, expect, it } from 'vitest';
import { StaleCache } from '../src/tmdb/cache.js';
import { SingleFlight } from '../src/tmdb/singleFlight.js';
import { parseMoviePage } from '../src/tmdb/mappers.js';
import { fakeFetch, json, makeClient, movie, pageOf } from './helpers.js';

const get = (c: ReturnType<typeof makeClient>, ttl = 1000, params: Record<string, number> = { page: 1 }) =>
  c.get('/discover/movie', params, ttl, parseMoviePage);
const ok = () => json(pageOf([movie()]));

describe('SingleFlight', () => {
  it('shares a rejection with every waiter and then forgets it, so the next call retries', async () => {
    const sf = new SingleFlight<string>();
    let calls = 0;
    const failing = () => sf.run('k', async () => (++calls, Promise.reject(new Error('boom'))));
    const results = await Promise.allSettled([failing(), failing(), failing()]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(calls).toBe(1);
    expect(sf.size).toBe(0); // entry removed once settled
    await expect(sf.run('k', async () => 'recovered')).resolves.toBe('recovered');
  });
});

describe('StaleCache', () => {
  it('evicts least-recently-used entries beyond its capacity', () => {
    const c = new StaleCache<number>(2);
    c.set('a', 1, 1000);
    c.set('b', 2, 1000);
    c.getFresh('a'); // touch a: b is now least recently used
    c.set('c', 3, 1000);
    expect(c.getAny('b')).toBeUndefined();
    expect(c.getFresh('a')).toBe(1);
    expect(c.getFresh('c')).toBe(3);
  });

  it('keeps expired entries retrievable as stale, but only within the retention window', () => {
    let t = 0;
    const c = new StaleCache<number>(10, 10_000, () => t);
    c.set('a', 1, 100);
    t = 500;
    expect(c.getFresh('a')).toBeUndefined();
    expect(c.getAny('a')).toEqual({ value: 1, fresh: false });
    t = 20_000;
    expect(c.getAny('a')).toBeUndefined();
  });
});

describe('single-flight + stale fallback combined', () => {
  it('when TMDB is down, N concurrent waiters cause ONE attempt and ALL receive the stale copy', async () => {
    let t = 0;
    let down = false;
    const f = fakeFetch(() => (down ? json({}, 503) : ok()));
    const c = makeClient(f, { now: () => t, retries: 0 });
    await get(c);
    t = 5000;
    down = true;
    const before = f.calls.length;
    const results = await Promise.all(Array.from({ length: 10 }, () => get(c)));
    expect(f.calls.length - before).toBe(1);
    expect(results.every((r) => r.stale && r.data.items.length === 1)).toBe(true);
  });

  it('a successful refresh after an outage replaces the stale entry and clears the stale flag', async () => {
    let t = 0;
    let down = false;
    const f = fakeFetch(() => (down ? json({}, 503) : ok()));
    const c = makeClient(f, { now: () => t, retries: 0 });
    await get(c);
    t = 5000;
    down = true;
    expect((await get(c)).stale).toBe(true);
    down = false;
    expect((await get(c)).stale).toBe(false);
  });
});

describe('retry policy', () => {
  it('makes exactly retries+1 attempts, then reports the failure as retryable', async () => {
    const f = fakeFetch(() => json({}, 500));
    const c = makeClient(f, { retries: 2 });
    await expect(get(c)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
    expect(f.calls).toHaveLength(3);
  });

  it('retries a network-level failure (fetch throws) and recovers', async () => {
    let n = 0;
    const f = fakeFetch(() => {
      if (++n === 1) throw new TypeError('fetch failed');
      return ok();
    });
    expect((await get(makeClient(f))).data.items).toHaveLength(1);
    expect(f.calls).toHaveLength(2);
  });

  it('a 429 that persists is surfaced as UPSTREAM_UNAVAILABLE (never leaks RATE_LIMITED as our own status)', async () => {
    const f = fakeFetch(() => json({}, 429, { 'retry-after': '0' }));
    await expect(get(makeClient(f, { retries: 1 }))).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
    expect(f.calls).toHaveLength(2);
  });

  it('does not retry rejected credentials (401) and reports UPSTREAM_INVALID', async () => {
    const f = fakeFetch(() => json({}, 401));
    await expect(get(makeClient(f, { retries: 3 }))).rejects.toMatchObject({ code: 'UPSTREAM_INVALID', retryable: false });
    expect(f.calls).toHaveLength(1);
  });

  it('sends the bearer token, or api_key when only a v3 key is configured', async () => {
    const seen: { auth: string | null; url: string }[] = [];
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ auth: new Headers(init?.headers).get('authorization'), url: String(input) });
      return ok();
    }) as never;
    await makeClient(f, { token: 'TOK' }).get('/a', {}, 1000, parseMoviePage);
    await makeClient(f, { token: undefined, apiKey: 'KEY' }).get('/b', {}, 1000, parseMoviePage);
    expect(seen[0]).toMatchObject({ auth: 'Bearer TOK' });
    expect(seen[0]!.url).not.toContain('api_key');
    expect(seen[1]!.auth).toBeNull();
    expect(seen[1]!.url).toContain('api_key=KEY');
  });
});

describe('circuit breaker', () => {
  const trip = async (c: ReturnType<typeof makeClient>, n: number) => {
    for (let i = 0; i < n; i++) await get(c, 1000, { page: 1000 + i }).catch(() => {});
  };

  it('counts a fully-retried request as ONE failure, not one per attempt', async () => {
    const f = fakeFetch(() => json({}, 503));
    const c = makeClient(f, { retries: 2, breakerThreshold: 2 });
    await trip(c, 1);
    expect(f.calls).toHaveLength(3);
    expect(c.stats().breakerOpen).toBe(false);
    await trip(c, 1);
    expect(c.stats().breakerOpen).toBe(true);
  });

  it('while open, serves stale data for cached keys without touching upstream', async () => {
    let t = 0;
    let down = false;
    const f = fakeFetch(() => (down ? json({}, 503) : ok()));
    const c = makeClient(f, { retries: 0, breakerThreshold: 2, breakerCooldownMs: 10_000, now: () => t });
    await get(c, 1000, { page: 1 });
    t = 5000; // page 1 now expired
    down = true;
    await trip(c, 2); // open the breaker with unrelated keys
    const calls = f.calls.length;
    const r = await get(c, 1000, { page: 1 });
    expect(r.stale).toBe(true);
    expect(f.calls.length).toBe(calls); // no upstream call while open
  });

  it('closes after the cooldown on a successful probe and resets the failure count', async () => {
    let t = 0;
    let down = true;
    const f = fakeFetch(() => (down ? json({}, 503) : ok()));
    const c = makeClient(f, { retries: 0, breakerThreshold: 2, breakerCooldownMs: 1000, now: () => t });
    await trip(c, 2);
    expect(c.stats().breakerOpen).toBe(true);
    t = 1001;
    down = false;
    await get(c, 1000, { page: 1 }); // probe succeeds
    expect(c.stats().breakerOpen).toBe(false);
    down = true;
    await trip(c, 1); // one new failure must NOT immediately re-open (count was reset)
    expect(c.stats().breakerOpen).toBe(false);
  });

  it('does not count NOT_FOUND or bad credentials as an outage', async () => {
    const f = fakeFetch(() => json({}, 404));
    const c = makeClient(f, { retries: 0, breakerThreshold: 2 });
    await trip(c, 5);
    expect(c.stats().breakerOpen).toBe(false);
    expect(f.calls).toHaveLength(5);
  });
});
