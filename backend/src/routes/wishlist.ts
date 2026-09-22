import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { requireDeviceId } from '../middleware/common.js';
import { movieSnapshotSchema, WishlistService } from '../services/wishlistService.js';

const idParam = z.coerce.number().int().positive();

export function wishlistRouter(svc: WishlistService) {
  const r = Router();
  r.use(requireDeviceId);

  r.get('/', async (req, res) => {
    res.json({ items: await svc.list(req.deviceId!) });
  });

  // PUT = idempotent "ensure this movie is in my wishlist". Body is the display snapshot, so
  // adding works even if TMDB is unreachable at that moment.
  r.put('/:movieId', async (req, res) => {
    const movieId = idParam.parse(req.params.movieId);
    const movie = movieSnapshotSchema.parse(req.body);
    if (movie.id !== movieId) throw new AppError('BAD_REQUEST', 'Body id does not match URL');
    const result = await svc.add(req.deviceId!, movie);
    if (result === 'full') throw new AppError('BAD_REQUEST', 'Wishlist is full');
    res.status(result === 'created' ? 201 : 200).json({ ok: true });
  });

  r.delete('/:movieId', async (req, res) => {
    await svc.remove(req.deviceId!, idParam.parse(req.params.movieId));
    res.status(204).end();
  });

  return r;
}
