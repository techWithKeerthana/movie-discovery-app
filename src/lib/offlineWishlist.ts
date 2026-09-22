import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MovieSummary } from '@trackzio/shared';

const CACHE_KEY = 'wishlist_cache';
const QUEUE_KEY = 'wishlist_pending_ops';

export interface PendingOp {
  type: 'add' | 'remove';
  movieId: number;
  /** Needed to PUT if this is an 'add'; not needed to DELETE a 'remove'. */
  movie?: MovieSummary;
}

/** Last known-good wishlist, written on every successful fetch so a cold start offline still shows something. */
export async function cacheWishlist(items: MovieSummary[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable: nothing to fall back to next time, but the app still works this session */
  }
}

export async function getCachedWishlist(): Promise<MovieSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getQueue(): Promise<PendingOp[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setQueue(ops: PendingOp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
  } catch {
    /* if we can't persist the queue, it still exists for this session via the caller's own state */
  }
}

/** A newer op for the same movie replaces an older queued one (e.g. add then remove while still offline). */
export async function enqueueOp(op: PendingOp): Promise<void> {
  const queue = (await getQueue()).filter((q) => q.movieId !== op.movieId);
  queue.push(op);
  await setQueue(queue);
}

export async function getQueuedOps(): Promise<PendingOp[]> {
  return getQueue();
}

export async function clearQueuedOps(): Promise<void> {
  await setQueue([]);
}
