/**
 * Request de-duplication: concurrent callers asking for the same key share ONE
 * in-flight promise. Ten users (or ten rapid identical requests) → one upstream call.
 * The entry is removed as soon as the promise settles, so this never serves old data;
 * that job belongs to the cache.
 */
export class SingleFlight<T> {
  private inflight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  get size(): number {
    return this.inflight.size;
  }
}
