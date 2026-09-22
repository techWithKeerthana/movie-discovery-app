import { z } from 'zod';
import type { MovieSummary } from '@trackzio/shared';
import type { Db } from '../db/db.js';

export const MAX_WISHLIST_PER_DEVICE = 1000;

/** Client-supplied snapshot. Treated as untrusted display data: validated and constrained to TMDB image hosts. */
const tmdbImage = z
  .string()
  .max(300)
  .refine((u) => u.startsWith('https://image.tmdb.org/'), 'must be a TMDB image URL')
  .nullable();

export const movieSnapshotSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable(),
  posterUrl: tmdbImage,
  backdropUrl: tmdbImage,
  rating: z.number().min(0).max(10).nullable(),
  voteCount: z.number().int().min(0),
  genreIds: z.array(z.number().int()).max(20),
  overview: z.string().transform((s) => s.slice(0, 1000)), // truncate rather than reject long overviews
});

export class WishlistService {
  constructor(private db: Db) {}

  async list(deviceId: string): Promise<MovieSummary[]> {
    const { rows } = await this.db.execute({
      sql: 'SELECT snapshot FROM wishlist WHERE device_id = ? ORDER BY added_at DESC, movie_id DESC',
      args: [deviceId],
    });
    return rows.flatMap((r) => {
      try {
        const parsed = movieSnapshotSchema.safeParse(JSON.parse(r.snapshot as string));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return []; // a corrupt row must not take the whole wishlist down
      }
    });
  }

  /** Returns 'created' | 'exists' | 'full'. */
  async add(deviceId: string, movie: MovieSummary): Promise<'created' | 'exists' | 'full'> {
    const count = await this.db.execute({ sql: 'SELECT COUNT(*) AS n FROM wishlist WHERE device_id = ?', args: [deviceId] });
    const n = Number(count.rows[0]?.n ?? 0);
    if (n >= MAX_WISHLIST_PER_DEVICE) return 'full';
    // DO NOTHING on conflict => PUT is idempotent and keeps the original added_at.
    const r = await this.db.execute({
      sql: 'INSERT INTO wishlist (device_id, movie_id, snapshot, added_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      args: [deviceId, movie.id, JSON.stringify(movie), Date.now()],
    });
    return r.rowsAffected > 0 ? 'created' : 'exists';
  }

  async remove(deviceId: string, movieId: number): Promise<void> {
    await this.db.execute({ sql: 'DELETE FROM wishlist WHERE device_id = ? AND movie_id = ?', args: [deviceId, movieId] });
  }
}
