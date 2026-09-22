import { Router, type Response } from 'express';
import { z } from 'zod';
import type { SortOption } from '@trackzio/shared';
import { MovieService } from '../services/movieService.js';
import { cleanQuery } from '../middleware/common.js';
import { TMDB_MAX_PAGE } from '../tmdb/mappers.js';

const SORTS = [
  'popularity.desc',
  'popularity.asc',
  'rating.desc',
  'rating.asc',
  'release.desc',
  'release.asc',
  'title.asc',
  'title.desc',
] as const satisfies readonly SortOption[];

const listQuery = z.object({
  query: z.string().trim().min(1).max(100).optional(),
  genre: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1870).max(2100).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  sort: z.enum(SORTS).default('popularity.desc'),
  page: z.coerce.number().int().min(1).max(TMDB_MAX_PAGE).default(1),
});

const idParam = z.coerce.number().int().positive();

const recommendedQuery = z.object({
  genreId: z.coerce.number().int().positive(),
  excludeIds: z
    .string()
    .max(2000)
    .optional()
    .transform((s) =>
      (s ?? '')
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 200),
    ),
});

/** Tells the client (and the browser network tab) that TMDB was down and this is saved data. */
function send<T>(res: Response, r: { data: T; stale: boolean }) {
  if (r.stale) res.setHeader('X-Cache', 'stale');
  res.json(r.data);
}

export function moviesRouter(svc: MovieService) {
  const r = Router();

  r.get('/genres', async (_req, res) => send(res, await svc.genres()));

  // Declared before /movies/:id so these literal segments aren't parsed as an id.
  r.get('/movies/trending', async (req, res) => {
    const page = z.coerce.number().int().min(1).max(TMDB_MAX_PAGE).default(1).parse(req.query.page ?? undefined);
    send(res, await svc.trending(page));
  });

  r.get('/movies/surprise', async (_req, res) => send(res, await svc.surprise()));

  r.get('/movies/recommended', async (req, res) => {
    const q = recommendedQuery.parse(cleanQuery(req.query));
    send(res, await svc.recommended(q.genreId, q.excludeIds));
  });

  r.get('/movies', async (req, res) => {
    const q = listQuery.parse(cleanQuery(req.query));
    send(res, await svc.list(q));
  });

  r.get('/movies/:id', async (req, res) => {
    send(res, await svc.detail(idParam.parse(req.params.id)));
  });

  return r;
}
