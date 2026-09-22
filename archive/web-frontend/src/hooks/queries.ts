import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { MovieSummary } from '@trackzio/shared';
import { moviesApi } from '../api/movies';
import type { Filters } from './useFilters';

/**
 * Infinite list of movies for the current filters.
 *  - the filters are the query key, so changing them starts a new list (page 1) automatically
 *  - TanStack passes an AbortSignal; when the key changes mid-flight the stale request is cancelled
 *  - `placeholderData: keepPreviousData` keeps the old grid visible (dimmed) while the new one loads
 *  - pages stay cached (staleTime/gcTime set globally), so coming back from a detail page is instant
 *    and the scroll position can be restored against real content
 */
export function useMovieList(f: Filters) {
  const query = useInfiniteQuery({
    queryKey: ['movies', f],
    queryFn: ({ pageParam, signal }) =>
      moviesApi.list(
        { query: f.q || undefined, genre: f.genre, year: f.year, minRating: f.minRating, sort: f.sort, page: pageParam },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.data.page < last.data.totalPages ? last.data.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });

  const pages = query.data?.pages ?? [];
  // TMDB pages can overlap when the underlying ranking shifts between requests; dedupe by id.
  const seen = new Set<number>();
  const items: MovieSummary[] = [];
  for (const p of pages) {
    for (const m of p.data.items) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        items.push(m);
      }
    }
  }

  return {
    query,
    items,
    totalResults: pages[0]?.data.totalResults ?? 0,
    stale: pages.some((p) => p.stale),
  };
}

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: ({ signal }) => moviesApi.genres(signal),
    staleTime: 24 * 60 * 60 * 1000,
    select: (r) => r.data,
  });
}

export function useMovieDetail(id: number) {
  return useQuery({
    queryKey: ['movie', id],
    queryFn: ({ signal }) => moviesApi.detail(id, signal),
    enabled: Number.isInteger(id) && id > 0,
    retry: (count, err) => (err as { code?: string }).code !== 'NOT_FOUND' && count < 1,
  });
}
