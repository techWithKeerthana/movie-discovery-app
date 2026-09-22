import { describe, expect, it } from 'vitest';
import { parseMovieDetail, parseMoviePage, toSummary } from '../src/tmdb/mappers.js';
import { AppError } from '../src/errors.js';
import { movie, pageOf } from './helpers.js';

describe('toSummary (incomplete / unexpected TMDB data)', () => {
  it('normalises a complete movie', () => {
    expect(toSummary(movie())).toEqual({
      id: 1,
      title: 'Alien',
      year: 1979,
      posterUrl: 'https://image.tmdb.org/t/p/w342/a.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w780/b.jpg',
      rating: 8,
      voteCount: 1000,
      genreIds: [27, 878],
      overview: 'In space...',
    });
  });

  it('turns every missing field into explicit null / empty values', () => {
    const s = toSummary({ id: 5, title: 'Bare', release_date: '', poster_path: null, vote_average: 0, vote_count: 0 });
    expect(s).toMatchObject({ year: null, posterUrl: null, backdropUrl: null, rating: null, genreIds: [], overview: '' });
  });

  it('falls back to original_title, and rejects items with no usable title or id', () => {
    expect(toSummary({ id: 2, title: '  ', original_title: 'Ran' })?.title).toBe('Ran');
    expect(toSummary({ id: 3, title: '' })).toBeNull();
    expect(toSummary({ title: 'No id' })).toBeNull();
    expect(toSummary(null)).toBeNull();
    expect(toSummary('garbage')).toBeNull();
  });

  it('ignores malformed dates and unusable poster paths', () => {
    const s = toSummary({ id: 4, title: 'X', release_date: 'soon', poster_path: 'no-slash.jpg' });
    expect(s?.year).toBeNull();
    expect(s?.posterUrl).toBeNull();
  });
});

describe('parseMoviePage', () => {
  it('drops bad and duplicate items but keeps the page', () => {
    const page = parseMoviePage(pageOf([movie(), { id: 'x' }, null, movie(), movie({ id: 2, title: 'Two' })]));
    expect(page.items.map((m) => m.id)).toEqual([1, 2]);
  });

  it('caps totalPages at the TMDB limit of 500', () => {
    expect(parseMoviePage(pageOf([], { total_pages: 44000 })).totalPages).toBe(500);
  });

  it('throws UPSTREAM_INVALID when the top-level shape is wrong', () => {
    expect(() => parseMoviePage({ oops: true })).toThrow(AppError);
    expect(() => parseMoviePage('<html>')).toThrowError(/unexpected list shape/);
  });
});

describe('parseMovieDetail', () => {
  it('picks the official trailer, limits cast, drops non-YouTube videos', () => {
    const d = parseMovieDetail({
      ...movie(),
      genres: [{ id: 27, name: 'Horror' }],
      runtime: 117,
      credits: { cast: [{ id: 9, name: 'B', order: 2 }, { id: 8, name: 'A', order: 1, character: 'Ripley' }, { bad: 1 }] },
      videos: {
        results: [
          { key: 'vimeo1', site: 'Vimeo', type: 'Trailer' },
          { key: 'teaser', site: 'YouTube', type: 'Teaser' },
          { key: 'fan', site: 'YouTube', type: 'Trailer', official: false },
          { key: 'official', site: 'YouTube', type: 'Trailer', official: true },
        ],
      },
      similar: { results: [movie({ id: 1 }), movie({ id: 7, title: 'Aliens' })] },
    });
    expect(d.trailerKey).toBe('official');
    expect(d.cast.map((c) => c.name)).toEqual(['A', 'B']);
    expect(d.similar.map((s) => s.id)).toEqual([7]); // excludes itself
    expect(d.posterUrl).toContain('/w500/');
    expect(d.runtimeMinutes).toBe(117);
  });

  it('shows only the top 10 cast members, ordered by billing order', () => {
    const cast = Array.from({ length: 15 }, (_, i) => ({ id: i, name: `Actor ${i}`, order: 14 - i })); // reverse order on purpose
    const d = parseMovieDetail({ ...movie(), credits: { cast } });
    expect(d.cast).toHaveLength(10);
    expect(d.cast.map((c) => c.name)).toEqual(['Actor 14', 'Actor 13', 'Actor 12', 'Actor 11', 'Actor 10', 'Actor 9', 'Actor 8', 'Actor 7', 'Actor 6', 'Actor 5']);
  });

  it('survives a movie with no credits/videos/similar/runtime', () => {
    const d = parseMovieDetail({ id: 1, title: 'Sparse' });
    expect(d).toMatchObject({ cast: [], similar: [], trailerKey: null, runtimeMinutes: null, tagline: '', genres: [] });
  });
});
