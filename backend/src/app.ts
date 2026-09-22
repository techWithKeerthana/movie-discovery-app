import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import type { ApiErrorBody } from '@trackzio/shared';
import type { Config } from './config.js';
import type { Db } from './db/db.js';
import { TmdbClient } from './tmdb/client.js';
import { MovieService } from './services/movieService.js';
import { WishlistService } from './services/wishlistService.js';
import { moviesRouter } from './routes/movies.js';
import { wishlistRouter } from './routes/wishlist.js';
import { errorHandler, notFound } from './middleware/common.js';

export interface AppDeps {
  config: Pick<Config, 'CORS_ORIGIN' | 'TMDB_TOKEN' | 'TMDB_API_KEY'>;
  tmdb: TmdbClient;
  db: Db;
}

/** Composition root: everything is injected, so tests can swap in a fake fetch + in-memory DB. */
export function createApp({ config, tmdb, db }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.CORS_ORIGIN, exposedHeaders: ['X-Cache'] }));
  app.use(express.json({ limit: '10kb' }));

  // Protects OUR server (and indirectly our TMDB quota) from a misbehaving client. Generous: infinite
  // scroll + typing are legitimate bursts. The client debounces; this is the backstop.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) => {
        const body: ApiErrorBody = { error: { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true } };
        res.status(429).json(body);
      },
    }),
  );

  // `tmdb` is a quick boolean for "is a credential configured at all" (the first thing to check from a
  // phone browser); `tmdbStats` has the resilience internals (cache, breaker) for deeper debugging.
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', tmdb: Boolean(config.TMDB_TOKEN || config.TMDB_API_KEY), tmdbStats: tmdb.stats() }),
  );
  app.use('/api', moviesRouter(new MovieService(tmdb)));
  app.use('/api/wishlist', wishlistRouter(new WishlistService(db)));
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
