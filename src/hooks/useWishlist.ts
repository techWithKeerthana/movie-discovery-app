import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { MovieSummary } from '@trackzio/shared';
import { wishlistApi } from '../api/movies';
import type { ApiResult } from '../api/client';
import { useToast } from '../components/Toast';

const KEY = ['wishlist'] as const;
type Cache = ApiResult<{ items: MovieSummary[] }>;

/** The wishlist is fetched once and shared: every card derives its heart state from `ids`. */
export function useWishlist() {
  const query = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => wishlistApi.list(signal),
    staleTime: Infinity, // we are the only writer; mutations update the cache directly
    select: (r) => r.data.items,
  });
  const items = query.data;
  const list = useMemo(() => items ?? [], [items]);
  const ids = useMemo(() => new Set(list.map((m) => m.id)), [list]);
  return { query, items: list, ids };
}

/**
 * Optimistic add/remove: the heart flips instantly, the request runs in the background, and on failure we roll back and
 * tell the user. `onSettled` re-syncs with the server either way.
 */
export function useToggleWishlist() {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ movie, add }: { movie: MovieSummary; add: boolean }): Promise<void> => {
      await (add ? wishlistApi.add(movie) : wishlistApi.remove(movie.id));
    },
    onMutate: async ({ movie, add }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Cache>(KEY);
      const cur = prev?.data.items ?? [];
      const items = add ? [movie, ...cur.filter((m) => m.id !== movie.id)] : cur.filter((m) => m.id !== movie.id);
      qc.setQueryData<Cache>(KEY, { data: { items }, stale: false });
      return { prev };
    },
    onError: (_e, { add }, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast(add ? 'Could not add to your wishlist. Please try again.' : 'Could not remove from your wishlist. Please try again.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
