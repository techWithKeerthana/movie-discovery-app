import { rmSync } from 'node:fs';
import { TmdbClient, type TmdbClientOptions } from '../src/tmdb/client.js';

/**
 * `rmSync` a directory that just held open libSQL files. On Windows the OS/AV can hold a file handle
 * for a while after `Client.close()` returns (unlike node:sqlite's close, this isn't synchronous release
 * of the underlying handle), so the first attempts can hit EPERM; retry with backoff. This is best-effort
 * housekeeping, not an assertion: every run uses a fresh `mkdtempSync` directory, so if cleanup still loses
 * the race, we log and move on rather than fail the suite over a leftover scratch directory in the OS's own
 * temp folder (it does not affect correctness or any other test).
 */
export async function rmSyncRetry(path: string, tries = 10): Promise<void> {
  for (let i = 1; i <= tries; i++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (e) {
      if (i < tries) {
        await new Promise((r) => setTimeout(r, 100 * i)); // up to ~5.5s total across 10 tries
        continue;
      }
      console.warn(`rmSyncRetry: giving up deleting ${path} after ${tries} tries (${(e as Error).message}); leaving it for the OS to reap`);
    }
  }
}

export type FakeFetch = ((url: string | URL | Request, init?: RequestInit) => Promise<Response>) & {
  calls: string[];
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** fetch stub: `handler` gets the URL and returns a Response (or throws). Records every call. */
export function fakeFetch(handler: (url: URL, n: number) => Response | Promise<Response>): FakeFetch {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname + url.search);
    return handler(url, calls.length);
  }) as FakeFetch;
  f.calls = calls;
  return f;
}

export function makeClient(fetchImpl: FakeFetch, over: Partial<TmdbClientOptions> = {}) {
  return new TmdbClient({
    baseUrl: 'https://tmdb.test/3',
    token: 't',
    timeoutMs: 200,
    ratePerSec: 10_000,
    retryDelayMs: 1,
    fetchImpl,
    ...over,
  });
}

export const movie = (over: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Alien',
  release_date: '1979-05-25',
  poster_path: '/a.jpg',
  backdrop_path: '/b.jpg',
  vote_average: 8.04,
  vote_count: 1000,
  genre_ids: [27, 878],
  overview: 'In space...',
  ...over,
});

export const pageOf = (results: unknown[], extra: Record<string, unknown> = {}) => ({
  page: 1,
  total_pages: 3,
  total_results: 50,
  results,
  ...extra,
});
