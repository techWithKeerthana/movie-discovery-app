/**
 * Outbound rate limiter. Spaces upstream calls at least 1/ratePerSec apart by handing
 * out time slots; callers wait for their slot instead of failing. So a burst of 200
 * cache-misses becomes a smooth ~40 req/s stream that stays under TMDB's soft limit,
 * rather than a wave of 429s. (Spacing is simpler than a token bucket and never bursts.)
 */
export class RateLimiter {
  private nextSlot = 0;
  private readonly intervalMs: number;
  private waiting = 0;

  constructor(
    ratePerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.intervalMs = 1000 / ratePerSec;
  }

  async acquire(): Promise<void> {
    const t = this.now();
    const slot = Math.max(t, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - t;
    if (wait <= 0) return;
    this.waiting++;
    await new Promise((r) => setTimeout(r, wait));
    this.waiting--;
  }

  get queued(): number {
    return this.waiting;
  }
}
