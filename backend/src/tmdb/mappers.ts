import { z } from 'zod';
import type { CastMember, Genre, MovieDetail, MovieSummary, Page } from '@trackzio/shared';
import { AppError } from '../errors.js';

/**
 * TMDB -> our domain model. TMDB fields are frequently null/missing (no poster, no release
 * date, zero votes, empty overview) and occasionally a whole item is garbage. Rules:
 *  - schemas are deliberately lenient (`nullish`) so one odd field never rejects a response
 *  - an item without a usable id or title is DROPPED, not fatal to the page
 *  - every optional value leaves here as explicit `null` / '' / [] so the client needs no guards
 *  - a response whose top-level shape is wrong throws UPSTREAM_INVALID (and is never cached)
 */

const IMG = 'https://image.tmdb.org/t/p';
const img = (path: string | null | undefined, size: string): string | null =>
  path && path.startsWith('/') ? `${IMG}/${size}${path}` : null;

const rawMovie = z.object({
  id: z.number().int().positive(),
  title: z.string().nullish(),
  original_title: z.string().nullish(),
  release_date: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  vote_average: z.number().nullish(),
  vote_count: z.number().nullish(),
  genre_ids: z.array(z.number()).nullish(),
  overview: z.string().nullish(),
});

const rawPage = z.object({
  page: z.number().int().nullish(),
  total_pages: z.number().int().nullish(),
  total_results: z.number().int().nullish(),
  results: z.array(z.unknown()),
});

// TMDB refuses page > 500 for discover/search; advertise the real ceiling.
export const TMDB_MAX_PAGE = 500;

function parseYear(date: string | null | undefined): number | null {
  const m = date ? /^(\d{4})-/.exec(date) : null;
  const y = m ? Number(m[1]) : NaN;
  return Number.isInteger(y) && y >= 1870 ? y : null;
}

export function toSummary(raw: unknown): MovieSummary | null {
  const parsed = rawMovie.safeParse(raw);
  if (!parsed.success) return null;
  const m = parsed.data;
  const title = m.title?.trim() || m.original_title?.trim();
  if (!title) return null;
  const votes = m.vote_count ?? 0;
  return {
    id: m.id,
    title,
    year: parseYear(m.release_date),
    posterUrl: img(m.poster_path, 'w342'),
    backdropUrl: img(m.backdrop_path, 'w780'),
    // A 0.0 average with 0 votes means "unrated", not "terrible".
    rating: votes > 0 && m.vote_average != null ? Math.round(m.vote_average * 10) / 10 : null,
    voteCount: votes,
    genreIds: m.genre_ids ?? [],
    overview: m.overview?.trim() ?? '',
  };
}

export function parseMoviePage(raw: unknown): Page<MovieSummary> {
  const p = rawPage.safeParse(raw);
  if (!p.success) throw new AppError('UPSTREAM_INVALID', 'Movie service returned an unexpected list shape');
  const seen = new Set<number>();
  const items: MovieSummary[] = [];
  for (const r of p.data.results) {
    const s = toSummary(r);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      items.push(s);
    }
  }
  return {
    items,
    page: p.data.page ?? 1,
    totalPages: Math.min(p.data.total_pages ?? 1, TMDB_MAX_PAGE),
    totalResults: p.data.total_results ?? items.length,
  };
}

export function parseGenres(raw: unknown): Genre[] {
  const p = z.object({ genres: z.array(z.unknown()) }).safeParse(raw);
  if (!p.success) throw new AppError('UPSTREAM_INVALID', 'Movie service returned an unexpected genre list');
  const g = z.object({ id: z.number().int(), name: z.string().min(1) });
  return p.data.genres.flatMap((x) => {
    const r = g.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

const rawDetail = rawMovie.extend({
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })).nullish(),
  runtime: z.number().nullish(),
  tagline: z.string().nullish(),
  status: z.string().nullish(),
  credits: z.object({ cast: z.array(z.unknown()).nullish() }).nullish(),
  videos: z.object({ results: z.array(z.unknown()).nullish() }).nullish(),
  similar: z.object({ results: z.array(z.unknown()).nullish() }).nullish(),
});

const rawCast = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  character: z.string().nullish(),
  profile_path: z.string().nullish(),
  order: z.number().nullish(),
});

const rawVideo = z.object({
  key: z.string().min(1),
  site: z.string().nullish(),
  type: z.string().nullish(),
  official: z.boolean().nullish(),
});

export function parseMovieDetail(raw: unknown): MovieDetail {
  const p = rawDetail.safeParse(raw);
  if (!p.success) throw new AppError('UPSTREAM_INVALID', 'Movie service returned an unexpected movie shape');
  const d = p.data;
  const genres = d.genres ?? [];
  const base = toSummary({ ...d, genre_ids: genres.map((g) => g.id) });
  if (!base) throw new AppError('UPSTREAM_INVALID', 'Movie is missing a title');

  const cast: CastMember[] = (d.credits?.cast ?? [])
    .flatMap((c) => {
      const r = rawCast.safeParse(c);
      return r.success ? [r.data] : [];
    })
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character?.trim() ?? '',
      profileUrl: img(c.profile_path, 'w185'),
    }));

  const videos = (d.videos?.results ?? []).flatMap((v) => {
    const r = rawVideo.safeParse(v);
    return r.success && r.data.site === 'YouTube' ? [r.data] : [];
  });
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.official) ??
    videos.find((v) => v.type === 'Trailer') ??
    videos.find((v) => v.type === 'Teaser');

  const similar: MovieSummary[] = [];
  for (const s of d.similar?.results ?? []) {
    const m = toSummary(s);
    if (m && m.id !== base.id) similar.push(m);
  }

  return {
    ...base,
    posterUrl: img(d.poster_path, 'w500'),
    backdropUrl: img(d.backdrop_path, 'w1280'),
    tagline: d.tagline?.trim() ?? '',
    runtimeMinutes: d.runtime && d.runtime > 0 ? d.runtime : null,
    releaseDate: d.release_date && /^\d{4}-\d{2}-\d{2}$/.test(d.release_date) ? d.release_date : null,
    genres,
    status: d.status ?? null,
    trailerKey: trailer?.key ?? null,
    cast,
    similar: similar.slice(0, 12),
  };
}
