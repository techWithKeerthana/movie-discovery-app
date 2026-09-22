import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortOption } from '@trackzio/shared';
import { SORT_OPTIONS } from '@trackzio/shared';

export interface Filters {
  q: string;
  genre?: number;
  year?: number;
  minRating?: number;
  sort: SortOption;
}

const int = (v: string | null) => {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Search/filter/sort state lives in the URL, not in component state. That is what makes
 * "back from a movie" restore exactly what you were looking at, makes views linkable, and
 * gives us one source of truth (the query key for the list is derived from it).
 * Values are validated on the way in, so a hand-edited URL cannot send garbage to the API.
 */
export function useFilters() {
  const [params, setParams] = useSearchParams();

  const filters: Filters = useMemo(() => {
    const sort = params.get('sort');
    return {
      q: (params.get('q') ?? '').trim(),
      genre: int(params.get('genre')),
      year: int(params.get('year')),
      minRating: int(params.get('minRating')),
      sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortOption) : 'popularity.desc',
    };
  }, [params]);

  const update = useCallback(
    (patch: Partial<Record<keyof Filters, string | number | undefined>>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '' || (k === 'sort' && v === 'popularity.desc')) next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: true }, // filter tweaks should not pile up history entries; "back" leaves the page
      );
    },
    [setParams],
  );

  const reset = useCallback(() => setParams({}, { replace: true }), [setParams]);
  const active = Boolean(filters.q || filters.genre || filters.year || filters.minRating || filters.sort !== 'popularity.desc');

  return { filters, update, reset, active };
}
