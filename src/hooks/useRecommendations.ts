import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MovieSummary } from '@trackzio/shared';
import { moviesApi } from '../api/movies';
import { useWishlist } from './useWishlist';

function mostFrequentGenre(items: MovieSummary[]): number | null {
  const counts = new Map<number, number>();
  for (const m of items) for (const g of m.genreIds) counts.set(g, (counts.get(g) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [genreId, count] of counts) {
    if (count > bestCount) {
      best = genreId;
      bestCount = count;
    }
  }
  return best;
}

/**
 * "Because you liked..." row: derived from the wishlist, not TMDB's own recommendation endpoint, so it needs no
 * extra data on the backend. Only meaningful with >= 2 wishlisted movies (one movie has no "most frequent" genre
 * worth trusting), which is also when the row is shown.
 */
export function useRecommendations() {
  const { items } = useWishlist();
  const genreId = items.length >= 2 ? mostFrequentGenre(items) : null;
  const excludeIds = useMemo(() => items.map((m) => m.id).sort((a, b) => a - b), [items]);

  const query = useQuery({
    queryKey: ['recommended', genreId, excludeIds],
    queryFn: ({ signal }) => moviesApi.recommended(genreId!, excludeIds, signal),
    enabled: genreId !== null,
    select: (r) => r.data,
  });

  return { movies: genreId !== null ? (query.data ?? []) : [] };
}
