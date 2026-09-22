import { AppError } from '../errors.js';
import { StaleCache } from './cache.js';
import { RateLimiter } from './rateLimiter.js';
import { SingleFlight } from './singleFlight.js';

export interface TmdbClientOptions {
  baseUrl: string;
  token?: string;
  apiKey?: string;
  timeoutMs: number;
  ratePerSec: number;
  /** Extra attempts after the first (network error / timeout / 429 / 5xx only). */
  retries?: number;
  retryDelayMs?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface TmdbResult<T> {
  data: T;
  /** True when TMDB failed and we answered from an expired cache entry. */
  stale: boolean;
}

type Params = Record<string, string | number | boolean | undefined>;
type RetryAfterError = AppError & { retryAfterMs?: number };

/**
 * The only place that talks to TMDB. Every call flows through:
 *   fresh cache -> single-flight -> circuit breaker -> rate limiter -> fetch(timeout, retry)
 *   -> validate/parse -> cache, and on failure -> expired cache ("stale-while-error").
 * Callers get typed, already-validated data and a `stale` flag, never a raw Response.
 */
export class TmdbClient {
  private cache: StaleCache<unknown>;
  private flights = new SingleFlight<TmdbResult<unknown>>();
  private limiter: RateLimiter;
  private consecutiveFailures = 0;
  private breakerOpenUntil = 0;
  upstreamCalls = 0;

  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opts: TmdbClientOptions) {
    this.now = opts.now ?? Date.now;
    this.cache = new StaleCache(2000, undefined, this.now);
    this.limiter = new RateLimiter(opts.ratePerSec, this.now);
    this.retries = opts.retries ?? 1;
    this.retryDelayMs = opts.retryDelayMs ?? 250;
    this.breakerThreshold = opts.breakerThreshold ?? 5;
    this.breakerCooldownMs = opts.breakerCooldownMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get<T>(
    path: string,
    params: Params,
    ttlMs: number,
    parse: (raw: unknown) => T,
  ): Promise<TmdbResult<T>> {
    const key = this.cacheKey(path, params);

    const fresh = this.cache.getFresh(key);
    if (fresh !== undefined) return { data: fresh as T, stale: false };

    // Everything below is shared by concurrent identical requests, including the stale fallback.
    const result = await this.flights.run(key, async () => {
      try {
        const raw = await this.fetchWithRetry(path, params);
        const data = parse(raw); // throws UPSTREAM_INVALID on unusable shape, so it is never cached
        this.consecutiveFailures = 0;
        this.cache.set(key, data, ttlMs);
        return { data, stale: false } as TmdbResult<unknown>;
      } catch (err) {
        const fallback = this.staleFallback(key, err);
        if (fallback) return fallback;
        throw err;
      }
    });
    return result as TmdbResult<T>;
  }

  stats() {
    return {
      cacheSize: this.cache.size,
      cacheHits: this.cache.hits,
      cacheMisses: this.cache.misses,
      staleServed: this.cache.staleServed,
      upstreamCalls: this.upstreamCalls,
      queuedForRateLimit: this.limiter.queued,
      inflight: this.flights.size,
      breakerOpen: this.now() < this.breakerOpenUntil,
    };
  }

  private staleFallback(key: string, err: unknown): TmdbResult<unknown> | null {
    // NOT_FOUND and our own bad requests are real answers; only infrastructure failures fall back.
    if (!(err instanceof AppError) || err.code === 'NOT_FOUND' || err.code === 'BAD_REQUEST') return null;
    const hit = this.cache.getAny(key);
    if (!hit) return null;
    this.cache.staleServed++;
    return { data: hit.value, stale: true };
  }

  private cacheKey(path: string, params: Params): string {
    const q = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== '')
      .sort() // normalise param order so equivalent requests share a key
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return `${path}?${q}`;
  }

  private buildUrl(path: string, params: Params): string {
    const url = new URL(this.opts.baseUrl.replace(/\/$/, '') + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    if (!this.opts.token && this.opts.apiKey) url.searchParams.set('api_key', this.opts.apiKey);
    return url.toString();
  }

  private async fetchWithRetry(path: string, params: Params): Promise<unknown> {
    if (!this.opts.token && !this.opts.apiKey) {
      throw new AppError('UPSTREAM_UNAVAILABLE', 'TMDB credentials are not configured on the server');
    }
    if (this.now() < this.breakerOpenUntil) {
      // Circuit open: fail fast instead of queueing more requests behind a dead service.
      throw new AppError('UPSTREAM_UNAVAILABLE', 'Movie service is temporarily unavailable');
    }

    let lastErr: AppError | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await this.attempt(path, params);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        lastErr = err;
        const transient =
          err.code === 'UPSTREAM_TIMEOUT' || err.code === 'UPSTREAM_UNAVAILABLE' || err.code === 'RATE_LIMITED';
        if (!transient) throw err; // NOT_FOUND / invalid credentials: not an outage, don't retry or trip the breaker
        if (attempt === this.retries) break;
        const wait = (err as RetryAfterError).retryAfterMs ?? this.retryDelayMs * (1 + Math.random());
        await new Promise((r) => setTimeout(r, Math.min(wait, 2000)));
      }
    }

    this.recordFailure();
    // A 429 that outlasted our retries is reported to the client as "service busy, retry later".
    if (lastErr!.code === 'RATE_LIMITED') {
      throw new AppError('UPSTREAM_UNAVAILABLE', 'Movie service is busy, try again shortly');
    }
    throw lastErr!;
  }

  private recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.breakerThreshold) {
      this.breakerOpenUntil = this.now() + this.breakerCooldownMs;
    }
  }

  private async attempt(path: string, params: Params): Promise<unknown> {
    await this.limiter.acquire();
    this.upstreamCalls++;
    let res: Response;
    try {
      res = await this.fetchImpl(this.buildUrl(path, params), {
        headers: {
          accept: 'application/json',
          ...(this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {}),
        },
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AppError('UPSTREAM_TIMEOUT', 'Movie service took too long to respond');
      }
      throw new AppError('UPSTREAM_UNAVAILABLE', 'Could not reach the movie service');
    }

    if (res.status === 404) throw new AppError('NOT_FOUND', 'Not found');
    if (res.status === 401 || res.status === 403) {
      // Our credentials are wrong: retrying is pointless and it is not the user's fault.
      throw new AppError('UPSTREAM_INVALID', 'Movie service rejected the server credentials');
    }
    if (res.status === 429) {
      const err: RetryAfterError = new AppError('RATE_LIMITED', 'Rate limited by movie service');
      const ra = Number(res.headers.get('retry-after'));
      if (Number.isFinite(ra) && ra > 0) err.retryAfterMs = ra * 1000;
      throw err;
    }
    if (res.status >= 500) throw new AppError('UPSTREAM_UNAVAILABLE', `Movie service error (${res.status})`);
    if (!res.ok) throw new AppError('UPSTREAM_INVALID', `Unexpected response (${res.status})`);

    try {
      return await res.json();
    } catch {
      throw new AppError('UPSTREAM_INVALID', 'Movie service returned malformed data');
    }
  }
}
