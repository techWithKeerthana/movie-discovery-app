import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MovieSummary, Page } from '@trackzio/shared';
import { CompareBanner } from '../components/CompareBanner';
import { CompareProvider } from '../components/CompareContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { ToastProvider } from '../components/Toast';
import { useOnline } from '../hooks/useOnline';
import { useSyncOfflineWishlist } from '../hooks/useWishlist';
import { navTheme, RootNavigator } from '../navigation/RootNavigator';
import type { RootStackParamList } from '../navigation/types';
import { createQueryClient } from '../queryClient';

function OfflineSync() {
  useSyncOfflineWishlist(useOnline());
  return null;
}

export const summary = (id: number, over: Partial<MovieSummary> = {}): MovieSummary => ({
  id,
  title: `Movie ${id}`,
  year: 2000 + (id % 20),
  posterUrl: `https://image.tmdb.org/t/p/w342/${id}.jpg`,
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

export const detailOf = (id: number, over: Record<string, unknown> = {}) => ({
  ...summary(id),
  tagline: '',
  runtimeMinutes: null,
  releaseDate: null,
  genres: [],
  status: null,
  trailerKey: null,
  cast: [],
  similar: [],
  ...over,
});

export const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const apiError = (code: string, message: string, retryable: boolean, status = 503) =>
  jsonRes({ error: { code, message, retryable } }, status);

export interface Call {
  url: URL;
  init: RequestInit | undefined;
}
/** Return a Response to take over a request, or undefined to fall through to the fake backend. */
type Override = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

const IDS = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
export const deviceOf = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.['X-Device-Id'];

/**
 * Replaces global fetch with a small in-memory backend: genres, paged movie lists, and a wishlist store keyed by the
 * X-Device-Id header, so persistence across "app restarts" can be asserted. Every request is recorded in `calls`.
 */
export function mockApi(override?: Override) {
  const calls: Call[] = [];
  const wishlists = new Map<string, MovieSummary[]>();

  const standard: Override = (url, init) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/genres') return jsonRes([{ id: 18, name: 'Drama' }, { id: 28, name: 'Action' }]);
    if (url.pathname === '/api/movies/surprise') return jsonRes(summary(999, { title: 'Surprise Movie' }));
    if (url.pathname === '/api/movies/recommended') return jsonRes([]);
    if (url.pathname === '/api/wishlist') return jsonRes({ items: wishlists.get(deviceOf(init) ?? '') ?? [] });
    const w = url.pathname.match(/^\/api\/wishlist\/(\d+)$/);
    if (w) {
      const dev = deviceOf(init) ?? '';
      const cur = wishlists.get(dev) ?? [];
      if (method === 'PUT') {
        const m = JSON.parse(String(init?.body)) as MovieSummary;
        if (!cur.some((x) => x.id === m.id)) wishlists.set(dev, [m, ...cur]);
        return jsonRes({ ok: true }, 201);
      }
      wishlists.set(dev, cur.filter((x) => x.id !== Number(w[1])));
      return jsonRes(null, 204);
    }
    if (url.pathname === '/api/movies') {
      const page = Number(url.searchParams.get('page') ?? 1);
      return jsonRes(pageOf(IDS(20, (page - 1) * 20 + 1), page));
    }
    const d = url.pathname.match(/^\/api\/movies\/(\d+)$/);
    if (d) return jsonRes(detailOf(Number(d[1])));
    return jsonRes({ error: { code: 'NOT_FOUND', message: 'nope', retryable: false } }, 404);
  };

  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return (await override?.(url, init)) ?? standard(url, init)!;
  });
  globalThis.fetch = fn as unknown as typeof fetch;

  return {
    calls,
    fn,
    wishlists,
    lists: () => calls.filter((c) => c.url.pathname === '/api/movies'),
    param: (c: Call | undefined, k: string) => c?.url.searchParams.get(k),
  };
}

/** Full app: providers + the real navigators, exactly as App.tsx composes them. */
export async function renderApp() {
  const navRef = createNavigationContainerRef<RootStackParamList>();
  const queryClient = createQueryClient();
  const d = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...d, queries: { ...d.queries, retryDelay: 0 } }); // keep the retry, drop the wait
  // A function, not a stored element: React bails out of re-rendering a subtree when the exact same element
  // REFERENCE is passed again (props unchanged by Object.is), so reusing one `const tree` for every `settle()`
  // call would silently skip re-invoking OfflineBanner/OfflineSync — they read a jest-mocked global (NetInfo),
  // not props or context, so nothing in React's own data flow would otherwise tell it to redo that work.
  const buildTree = () => (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <CompareProvider>
            <ToastProvider>
              <NavigationContainer ref={navRef} theme={navTheme}>
                <RootNavigator />
              </NavigationContainer>
              <OfflineBanner />
              <CompareBanner />
              <OfflineSync />
            </ToastProvider>
          </CompareProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
  const utils = await render(buildTree());
  /** Re-runs every hook in the tree (e.g. after changing the NetInfo mock's return value). */
  const settle = () => utils.rerender(buildTree());
  return { navRef, queryClient, settle, ...utils };
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
