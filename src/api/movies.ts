import type { Genre, MovieDetail, MovieQuery, MovieSummary, Page } from '@trackzio/shared';
import { api } from './client';

function qs(q: MovieQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const moviesApi = {
  list: (q: MovieQuery, signal?: AbortSignal) => api<Page<MovieSummary>>(`/movies${qs(q)}`, { signal }),
  detail: (id: number, signal?: AbortSignal) => api<MovieDetail>(`/movies/${id}`, { signal }),
  genres: (signal?: AbortSignal) => api<Genre[]>('/genres', { signal }),
  surprise: (signal?: AbortSignal) => api<MovieSummary>('/movies/surprise', { signal }),
  recommended: (genreId: number, excludeIds: number[], signal?: AbortSignal) =>
    api<MovieSummary[]>(`/movies/recommended?genreId=${genreId}&excludeIds=${excludeIds.join(',')}`, { signal }),
};

export const wishlistApi = {
  list: (signal?: AbortSignal) => api<{ items: MovieSummary[] }>('/wishlist', { signal }),
  add: (m: MovieSummary) => api<{ ok: true }>(`/wishlist/${m.id}`, { method: 'PUT', body: toSummary(m) }),
  remove: (id: number) => api<void>(`/wishlist/${id}`, { method: 'DELETE' }),
};

/** Detail objects carry extra fields; the wishlist stores only the summary snapshot. */
export function toSummary(m: MovieSummary): MovieSummary {
  const { id, title, year, posterUrl, backdropUrl, rating, voteCount, genreIds, overview } = m;
  return { id, title, year, posterUrl, backdropUrl, rating, voteCount, genreIds, overview };
}
