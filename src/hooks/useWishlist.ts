import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import type { MovieSummary } from '@trackzio/shared';
import { wishlistApi } from '../api/movies';
import { ApiError, type ApiResult } from '../api/client';
import { useToast } from '../components/Toast';
import { cacheWishlist, clearQueuedOps, enqueueOp, getCachedWishlist, getQueuedOps } from '../lib/offlineWishlist';

export const WISHLIST_KEY = ['wishlist'] as const;
const KEY = WISHLIST_KEY;
type Cache = ApiResult<{ items: MovieSummary[] }>;

async function fetchWishlist(signal: AbortSignal): Promise<Cache> {
  try {
    const r = await wishlistApi.list(signal);
    await cacheWishlist(r.data.items); // keep the offline fallback fresh
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NETWORK') {
      // Offline (or truly unreachable): the last successfully-fetched list, flagged the same way a stale
      // backend answer is, so the existing StaleBanner/UI needs no new concept for "this might be old".
      const items = await getCachedWishlist();
      return { data: { items }, stale: true };
    }
    throw e;
  }
}

/** The wishlist is fetched once and shared: every card derives its heart state from `ids`. */
export function useWishlist() {
  const query = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => fetchWishlist(signal),
    staleTime: Infinity, // we are the only writer; mutations update the cache directly
    select: (r) => r.data.items,
  });
  const items = query.data;
  const list = useMemo(() => items ?? [], [items]);
  const ids = useMemo(() => new Set(list.map((m) => m.id)), [list]);
  return { query, items: list, ids };
}

/**
 * Optimistic add/remove: the heart flips instantly, the request runs in the background.
 *  - A real failure (server up, request rejected) rolls back and tells the user.
 *  - Offline (network unreachable) does NOT roll back: the change is queued (`enqueueOp`) and replayed by
 *    `useSyncOfflineWishlist` once connectivity returns, and the user sees "Will sync when online" instead
 *    of an error. `onSettled` skips its usual refetch for a queued op, so that refetch (which would still
 *    fail offline and fall back to the on-disk cache) can't overwrite the optimistic change in the meantime.
 */
export function useToggleWishlist() {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ movie, add }: { movie: MovieSummary; add: boolean }): Promise<{ queued: boolean }> => {
      try {
        await (add ? wishlistApi.add(movie) : wishlistApi.remove(movie.id));
        return { queued: false };
      } catch (e) {
        if (e instanceof ApiError && e.code === 'NETWORK') {
          await enqueueOp(add ? { type: 'add', movieId: movie.id, movie } : { type: 'remove', movieId: movie.id });
          return { queued: true };
        }
        throw e;
      }
    },
    onMutate: async ({ movie, add }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Cache>(KEY);
      const cur = prev?.data.items ?? [];
      const items = add ? [movie, ...cur.filter((m) => m.id !== movie.id)] : cur.filter((m) => m.id !== movie.id);
      qc.setQueryData<Cache>(KEY, { data: { items }, stale: prev?.stale ?? false });
      return { prev };
    },
    onSuccess: (result) => {
      if (result.queued) toast('Will sync when online.');
    },
    onError: (_e, { add }, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast(add ? 'Could not add to your wishlist. Please try again.' : 'Could not remove from your wishlist. Please try again.');
    },
    onSettled: (result) => {
      if (!result?.queued) qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Flushes queued offline wishlist changes the moment connectivity returns, then refetches to reconcile. */
export function useSyncOfflineWishlist(online: boolean) {
  const qc = useQueryClient();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return; // was already online: nothing could have been queued
    wasOffline.current = false;

    (async () => {
      const ops = await getQueuedOps();
      if (ops.length === 0) return;
      for (const op of ops) {
        try {
          if (op.type === 'add' && op.movie) await wishlistApi.add(op.movie);
          else if (op.type === 'remove') await wishlistApi.remove(op.movieId);
        } catch {
          return; // leave the whole queue for the next reconnect rather than lose ops after one flaky flush
        }
      }
      await clearQueuedOps();
      qc.invalidateQueries({ queryKey: KEY });
    })();
  }, [online, qc]);
}
