import type { Genre, MovieDetail, MovieQuery, MovieSummary, Page, SortOption } from '@trackzio/shared';
import { AppError } from '../errors.js';
import { TmdbClient, type TmdbResult } from '../tmdb/client.js';
import { parseGenres, parseMovieDetail, parseMoviePage } from '../tmdb/mappers.js';

const MIN = 60_000;
const TTL = {
  genres: 24 * 60 * MIN,
  detail: 60 * MIN,
  discover: 10 * MIN,
  search: 5 * MIN,
  trending: 10 * MIN,
};

/** Our sort vocabulary -> TMDB `sort_by`, plus the guard rails each sort needs to be useful. */
const DISCOVER_SORT: Record<SortOption, string> = {
  'popularity.desc': 'popularity.desc',
  'popularity.asc': 'popularity.asc',
  'rating.desc': 'vote_average.desc',
  'rating.asc': 'vote_average.asc',
  'release.desc': 'primary_release_date.desc',
  'release.asc': 'primary_release_date.asc',
  'title.asc': 'original_title.asc',
  'title.desc': 'original_title.desc',
};

/**
 * Business logic between routes and the TMDB client. Two modes:
 *  - discover (no text): TMDB does ALL filtering/sorting, so pagination is exact.
 *  - search (text): TMDB /search cannot sort or filter by genre/rating. Results are always in TMDB's
 *    relevance order and `sort` is IGNORED (a per-page sort would only be right within one page, which
 *    is misleading, so the UI does not offer it). Genre and rating are still applied to each returned
 *    page. Consequence (documented limitation): such a page can have fewer than 20 items and
 *    totalResults counts unfiltered matches, so the UI hides the total while those filters are on.
 */
export class MovieService {
  constructor(private tmdb: TmdbClient) {}

  list(q: MovieQuery): Promise<TmdbResult<Page<MovieSummary>>> {
    return q.query ? this.search(q) : this.discover(q);
  }

  private discover(q: MovieQuery) {
    const sort = q.sort ?? 'popularity.desc';
    const today = new Date().toISOString().slice(0, 10);
    const ratingSort = sort.startsWith('rating');
    return this.tmdb.get(
      '/discover/movie',
      {
        include_adult: false,
        include_video: false,
        language: 'en-US',
        page: q.page ?? 1,
        sort_by: DISCOVER_SORT[sort],
        with_genres: q.genre,
        primary_release_year: q.year,
        'vote_average.gte': q.minRating || undefined,
        // Without a vote floor, "highest rated" is dominated by 1-vote 10.0 obscurities.
        'vote_count.gte': ratingSort ? 300 : q.minRating ? 50 : sort.startsWith('release') ? 10 : undefined,
        // Newest-first would otherwise start with unreleased, unrated placeholders.
        'primary_release_date.lte': sort === 'release.desc' ? today : undefined,
      },
      TTL.discover,
      parseMoviePage,
    );
  }

  private async search(q: MovieQuery) {
    const res = await this.tmdb.get(
      '/search/movie',
      {
        query: q.query,
        include_adult: false,
        language: 'en-US',
        page: q.page ?? 1,
        primary_release_year: q.year,
      },
      TTL.search,
      parseMoviePage,
    );
    return { stale: res.stale, data: this.refineSearchPage(res.data, q) };
  }

  private refineSearchPage(page: Page<MovieSummary>, q: MovieQuery): Page<MovieSummary> {
    let items = page.items;
    if (q.genre) items = items.filter((m) => m.genreIds.includes(q.genre!));
    if (q.minRating) items = items.filter((m) => m.rating !== null && m.rating >= q.minRating!);
    return { ...page, items };
  }

  trending(page = 1) {
    return this.tmdb.get('/trending/movie/week', { page, language: 'en-US' }, TTL.trending, parseMoviePage);
  }

  detail(id: number): Promise<TmdbResult<MovieDetail>> {
    return this.tmdb.get(
      `/movie/${id}`,
      { language: 'en-US', append_to_response: 'credits,videos,similar' },
      TTL.detail,
      parseMovieDetail,
    );
  }

  genres(): Promise<TmdbResult<Genre[]>> {
    return this.tmdb.get('/genre/movie/list', { language: 'en' }, TTL.genres, parseGenres);
  }

  /**
   * A random decently-rated popular movie: a random page (1-10) of the same discover pipeline the
   * grid uses (so it shares its cache entry, single-flight, breaker etc.), then a random item on that
   * page. `rand` is injectable so tests can make the pick deterministic.
   */
  async surprise(rand: () => number = Math.random): Promise<TmdbResult<MovieSummary>> {
    const page = 1 + Math.floor(rand() * 10);
    const res = await this.tmdb.get(
      '/discover/movie',
      {
        include_adult: false,
        include_video: false,
        language: 'en-US',
        page,
        sort_by: 'popularity.desc',
        'vote_average.gte': 6.0,
        'vote_count.gte': 300,
      },
      TTL.discover,
      parseMoviePage,
    );
    const { items } = res.data;
    if (items.length === 0) throw new AppError('NOT_FOUND', 'No movies available right now');
    return { data: items[Math.floor(rand() * items.length)]!, stale: res.stale };
  }

  /**
   * "Because you liked..." row: the most popular movies in one genre, minus whatever the caller already
   * has (the wishlist). Genre inference and exclusion happen on the client, which is the only side that
   * knows the wishlist; this just does the TMDB lookup and filtering.
   */
  async recommended(genreId: number, excludeIds: number[]): Promise<TmdbResult<MovieSummary[]>> {
    const res = await this.tmdb.get(
      '/discover/movie',
      {
        include_adult: false,
        include_video: false,
        language: 'en-US',
        page: 1,
        sort_by: 'popularity.desc',
        with_genres: genreId,
        'vote_count.gte': 100,
      },
      TTL.discover,
      parseMoviePage,
    );
    const exclude = new Set(excludeIds);
    const items = res.data.items.filter((m) => !exclude.has(m.id)).slice(0, 8);
    return { data: items, stale: res.stale };
  }
}
