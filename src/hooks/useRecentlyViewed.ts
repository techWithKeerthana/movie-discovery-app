import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { MovieSummary } from '@trackzio/shared';
import { addRecentlyViewed, getRecentlyViewed } from '../lib/recentlyViewed';

const KEY = ['recentlyViewed'] as const;

/** Purely client-side (AsyncStorage), no backend involved. Read by Discover, written by the detail screen. */
export function useRecentlyViewed() {
  const { data } = useQuery({ queryKey: KEY, queryFn: getRecentlyViewed, staleTime: Infinity });
  return data ?? [];
}

/** Call once a movie's detail has actually loaded, so "opened" means the user really saw it, not just tapped a card. */
export function useRecordRecentlyViewed() {
  const qc = useQueryClient();
  return useCallback(
    (movie: MovieSummary) => {
      addRecentlyViewed(movie)
        .then((next) => qc.setQueryData(KEY, next))
        .catch(() => {}); // storage-unavailable fallback already handled inside addRecentlyViewed
    },
    [qc],
  );
}
