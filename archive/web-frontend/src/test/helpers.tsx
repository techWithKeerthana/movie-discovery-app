import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { MovieSummary, Page } from '@trackzio/shared';
import { appRoutes, createAppQueryClient } from '../App';

export const summary = (id: number, over: Partial<MovieSummary> = {}): MovieSummary => ({
  id,
  title: `Movie ${id}`,
  year: 2000 + (id % 20),
  posterUrl: null,
  backdropUrl: null,
  rating: 7.5,
  voteCount: 100,
  genreIds: [18],
  overview: 'An overview.',
  ...over,
});

export const pageOf = (ids: number[], page = 1, totalPages = 3, totalResults = 60): Page<MovieSummary> => ({
  items: ids.map((i) => summary(i)),
  page,
  totalPages,
  totalResults,
});

export const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const apiError = (code: string, message: string, retryable: boolean, status = 503) =>
  jsonRes({ error: { code, message, retryable } }, status);

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

/** Replaces global fetch. Every request (path + query) is recorded in `calls` for assertions. */
export function mockApi(handler: Handler) {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url);
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return {
    calls,
    fn,
    list: () => calls.filter((c) => c.pathname === '/api/movies'),
  };
}

/** Default backend: genres, empty wishlist, and paged movie lists (20 ids per page starting at (page-1)*20+1). */
export const standardHandler: Handler = (url, init) => {
  if (url.pathname === '/api/genres') return jsonRes([{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }]);
  if (url.pathname === '/api/wishlist') return jsonRes({ items: [] });
  if (url.pathname.startsWith('/api/wishlist/')) return jsonRes({ ok: true }, init?.method === 'DELETE' ? 204 : 201);
  if (url.pathname === '/api/movies') {
    const page = Number(url.searchParams.get('page') ?? 1);
    return jsonRes(pageOf(Array.from({ length: 20 }, (_, i) => (page - 1) * 20 + i + 1), page));
  }
  return jsonRes({ error: { code: 'NOT_FOUND', message: 'nope', retryable: false } }, 404);
};

export function renderApp(url = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [url] });
  const queryClient = createAppQueryClient();
  const d = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...d, queries: { ...d.queries, retryDelay: 0 } }); // keep the retry, drop the 1s wait
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...utils };
}

export const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
