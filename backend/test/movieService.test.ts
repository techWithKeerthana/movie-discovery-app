import { describe, expect, it } from 'vitest';
import { MovieService } from '../src/services/movieService.js';
import { fakeFetch, json, makeClient, movie, pageOf } from './helpers.js';

function setup(results: unknown[] = [movie()]) {
  const f = fakeFetch(() => json(pageOf(results)));
  return { f, svc: new MovieService(makeClient(f)) };
}
const lastQuery = (f: ReturnType<typeof fakeFetch>) => new URL('https://x' + f.calls.at(-1)!).searchParams;

describe('MovieService -> TMDB parameter mapping (discover mode)', () => {
  it('maps filters and sort onto TMDB discover parameters', async () => {
    const { f, svc } = setup();
    await svc.list({ genre: 18, year: 1999, minRating: 7, sort: 'popularity.desc', page: 3 });
    const q = lastQuery(f);
    expect(f.calls.at(-1)).toContain('/discover/movie');
    expect(q.get('with_genres')).toBe('18');
    expect(q.get('primary_release_year')).toBe('1999');
    expect(q.get('vote_average.gte')).toBe('7');
    expect(q.get('vote_count.gte')).toBe('50'); // rating filter needs a vote floor too
    expect(q.get('sort_by')).toBe('popularity.desc');
    expect(q.get('page')).toBe('3');
    expect(q.get('include_adult')).toBe('false');
  });

  it('adds a vote-count floor to rating sorts so 1-vote 10.0 films do not win', async () => {
    const { f, svc } = setup();
    await svc.list({ sort: 'rating.desc' });
    expect(lastQuery(f).get('sort_by')).toBe('vote_average.desc');
    expect(Number(lastQuery(f).get('vote_count.gte'))).toBeGreaterThanOrEqual(100);
  });

  it('excludes unreleased titles when sorting newest first, but not otherwise', async () => {
    const { f, svc } = setup();
    await svc.list({ sort: 'release.desc' });
    expect(lastQuery(f).get('primary_release_date.lte')).toBe(new Date().toISOString().slice(0, 10));
    await svc.list({ sort: 'popularity.desc', page: 2 });
    expect(lastQuery(f).has('primary_release_date.lte')).toBe(false);
  });

  it('omits unset filters entirely rather than sending empty values', async () => {
    const { f, svc } = setup();
    await svc.list({});
    const q = lastQuery(f);
    for (const k of ['with_genres', 'primary_release_year', 'vote_average.gte']) expect(q.has(k)).toBe(false);
  });
});

describe('MovieService search mode (relevance order; genre/rating refine each page)', () => {
  const results = [
    movie({ id: 1, title: 'Bravo', release_date: '2001-01-01', vote_average: 6, genre_ids: [18] }),
    movie({ id: 2, title: 'Alpha', release_date: '1999-01-01', vote_average: 9, genre_ids: [18, 35] }),
    movie({ id: 3, title: 'Charlie', release_date: '', vote_average: 8, genre_ids: [35] }),
    movie({ id: 4, title: 'Unrated', release_date: '2005-01-01', vote_count: 0, vote_average: 0, genre_ids: [18] }),
  ];
  const ids = async (q: Parameters<MovieService['list']>[0]) => (await setup(results).svc.list({ query: 'x', ...q })).data.items.map((m) => m.id);

  it('uses /search/movie and passes only what TMDB supports (query, year) upstream', async () => {
    const { f, svc } = setup(results);
    await svc.list({ query: 'alien', year: 1979, genre: 18, sort: 'rating.desc' });
    const q = lastQuery(f);
    expect(f.calls.at(-1)).toContain('/search/movie');
    expect(q.get('query')).toBe('alien');
    expect(q.get('primary_release_year')).toBe('1979');
    expect(q.has('with_genres')).toBe(false);
    expect(q.has('sort_by')).toBe(false);
  });

  it('filters by genre and min rating, treating unrated movies as not meeting a rating floor', async () => {
    expect(await ids({ genre: 18 })).toEqual([1, 2, 4]);
    expect(await ids({ minRating: 7 })).toEqual([2, 3]);
  });

  it('ignores sort entirely: results stay in TMDB relevance order whatever sort is requested', async () => {
    for (const sort of ['rating.desc', 'release.asc', 'title.asc', 'popularity.asc'] as const) {
      expect(await ids({ sort })).toEqual([1, 2, 3, 4]);
    }
  });

  it('does not send sort_by upstream and still applies genre + rating together', async () => {
    const { f, svc } = setup(results);
    const r = await svc.list({ query: 'x', sort: 'rating.desc', genre: 18, minRating: 7 });
    expect(lastQuery(f).has('sort_by')).toBe(false);
    expect(r.data.items.map((m) => m.id)).toEqual([2]);
  });
});
