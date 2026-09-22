import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MovieSummary } from '@trackzio/shared';

export function Poster({ url, title, className = '' }: { url: string | null; title: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  // Posters come in many shapes; a fixed 2:3 box + object-fit: cover keeps the grid uniform,
  // and a missing/broken poster falls back to a title placeholder instead of a broken-image icon.
  return (
    <div className={`poster ${className}`}>
      {url && !failed ? (
        <img src={url} alt={`${title} poster`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="poster-fallback" aria-label={`${title} (no poster available)`}>
          <span>{title}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  movie: MovieSummary;
  wished: boolean;
  onToggle: (movie: MovieSummary, add: boolean) => void;
}

/** memo'd: in a long infinite list, toggling one heart must not re-render hundreds of cards. */
export const MovieCard = memo(function MovieCard({ movie, wished, onToggle }: Props) {
  return (
    <article className="card">
      <Link to={`/movie/${movie.id}`} className="card-link">
        <Poster url={movie.posterUrl} title={movie.title} />
        <div className="card-info">
          <h3 className="card-title" title={movie.title}>
            {movie.title}
          </h3>
          <p className="card-meta">
            <span>{movie.year ?? 'TBA'}</span>
            {movie.rating !== null && <span className="rating">★ {movie.rating.toFixed(1)}</span>}
          </p>
        </div>
      </Link>
      {/* Sibling of the link, not a child: interactive elements must not be nested. */}
      <button
        className={`heart ${wished ? 'on' : ''}`}
        aria-pressed={wished}
        aria-label={wished ? `Remove ${movie.title} from wishlist` : `Add ${movie.title} to wishlist`}
        onClick={() => onToggle(movie, !wished)}
      >
        {wished ? '♥' : '♡'}
      </button>
    </article>
  );
});
