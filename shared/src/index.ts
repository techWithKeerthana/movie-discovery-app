/**
 * The API contract between backend and frontend. Nothing here mirrors TMDB's
 * raw shapes: the backend normalises TMDB into these types, so the client never
 * deals with TMDB field names, image URL building, or null-vs-undefined quirks.
 */

export interface Genre {
  id: number;
  name: string;
}

/** Lightweight movie used in grids/lists. Every optional value is explicit `null`, never missing. */
export interface MovieSummary {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  rating: number | null; // 0-10, one decimal; null when TMDB has no votes
  voteCount: number;
  genreIds: number[];
  overview: string; // '' when missing
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profileUrl: string | null;
}

export interface MovieDetail extends MovieSummary {
  tagline: string;
  runtimeMinutes: number | null;
  releaseDate: string | null;
  genres: Genre[];
  status: string | null;
  trailerKey: string | null; // YouTube video key
  cast: CastMember[];
  similar: MovieSummary[];
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export type SortOption =
  | 'popularity.desc'
  | 'popularity.asc'
  | 'rating.desc'
  | 'rating.asc'
  | 'release.desc'
  | 'release.asc'
  | 'title.asc'
  | 'title.desc';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'popularity.desc', label: 'Most popular' },
  { value: 'rating.desc', label: 'Highest rated' },
  { value: 'release.desc', label: 'Newest first' },
  { value: 'release.asc', label: 'Oldest first' },
  { value: 'title.asc', label: 'Title A–Z' },
  { value: 'title.desc', label: 'Title Z–A' },
];

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_INVALID'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; retryable: boolean };
}

export interface MovieQuery {
  query?: string;
  genre?: number;
  year?: number;
  minRating?: number;
  sort?: SortOption;
  page?: number;
}
