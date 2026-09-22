import { LRUCache } from 'lru-cache';

interface Entry<T> {
  value: T;
  freshUntil: number;
  retainUntil: number;
}

export interface CacheHit<T> {
  value: T;
  fresh: boolean;
}

/**
 * TTL cache with stale-while-error semantics. Each entry has a short "fresh" window
 * (per-endpoint TTL) but is physically retained much longer (`retainMs`). Normal reads
 * only use fresh entries; if TMDB is down/slow we fall back to `getStale()` and serve the
 * old data, flagged so the UI can say "showing saved results". LRU bound caps memory.
 */
export class StaleCache<T> {
  private store: LRUCache<string, Entry<T>>;
  hits = 0;
  misses = 0;
  staleServed = 0;

  constructor(
    maxEntries = 2000,
    private readonly retainMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {
    this.store = new LRUCache({ max: maxEntries, ttl: retainMs, ttlAutopurge: false });
  }

  getFresh(key: string): T | undefined {
    const e = this.store.get(key);
    if (e && e.freshUntil > this.now()) {
      this.hits++;
      return e.value;
    }
    this.misses++;
    return undefined;
  }

  /** Any retained value, fresh or expired. */
  getAny(key: string): CacheHit<T> | undefined {
    const e = this.store.get(key);
    // Retention is checked against our own (injectable) clock; lru-cache's ttl below is only memory cleanup.
    if (!e || e.retainUntil <= this.now()) return undefined;
    return { value: e.value, fresh: e.freshUntil > this.now() };
  }

  set(key: string, value: T, ttlMs: number): void {
    const t = this.now();
    this.store.set(key, { value, freshUntil: t + ttlMs, retainUntil: t + this.retainMs }, { ttl: this.retainMs });
  }

  get size(): number {
    return this.store.size;
  }
}
