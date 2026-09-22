import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MovieSummary } from '@trackzio/shared';

const KEY = 'recently_viewed';
const MAX = 8;

/** Purely client-side "last movies opened" list. Never talks to the backend. */
export async function getRecentlyViewed(): Promise<MovieSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isMovieSummary) : [];
  } catch {
    return []; // corrupt/unavailable storage must not break Discover
  }
}

/** Records a view: moves the movie to the front, dedupes, caps at 8. Returns the new list. */
export async function addRecentlyViewed(movie: MovieSummary): Promise<MovieSummary[]> {
  const current = await getRecentlyViewed();
  const next = [movie, ...current.filter((m) => m.id !== movie.id)].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the in-memory list still updates for this session */
  }
  return next;
}

function isMovieSummary(x: unknown): x is MovieSummary {
  return typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'number' && typeof (x as { title?: unknown }).title === 'string';
}
