import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { MovieSummary, SortOption } from '@trackzio/shared';
import { moviesApi } from '../api/movies';

export interface Filters {
  q: string;
  genre?: number;
  year?: number;
  minRating?: number;
  sort: SortOption;
}

/**
 * Infinite list of movies for the current filters.
 *  - the filters are the query key, so changing them starts a new list (page 1) automatically
 *  - TanStack passes an AbortSignal to fetch; when the key changes mid-flight the superseded request is cancelled,
 *    so at most one search is ever in flight for the list
 *  - `placeholderData: keepPreviousData` keeps the previous results visible (dimmed) while the new ones load
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
  // TMDB pages can overlap when the ranking shifts between requests; dedupe by id.
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
