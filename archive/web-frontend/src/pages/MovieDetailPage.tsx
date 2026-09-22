import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { MovieDetail } from '@trackzio/shared';
import { useMovieDetail } from '../hooks/queries';
import { useToggleWishlist, useWishlist } from '../hooks/useWishlist';
import { ErrorState, SlowHint, StaleBanner, useSlowHint } from '../components/States';
import { MovieGrid } from '../components/MovieGrid';
import { Poster } from '../components/MovieCard';

const runtime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function DetailSkeleton() {
  return (
    <div className="detail" aria-hidden="true">
      <div className="detail-main">
        <div className="poster shimmer detail-poster" />
        <div className="detail-text">
          <div className="line shimmer big" />
          <div className="line shimmer short" />
          <div className="line shimmer" />
          <div className="line shimmer" />
          <div className="line shimmer short" />
        </div>
      </div>
    </div>
  );
}

function WishlistButton({ movie }: { movie: MovieDetail }) {
  const { has } = useWishlist();
  const { mutate } = useToggleWishlist();
  const wished = has(movie.id);
  return (
    <button
      className={`btn ${wished ? 'active' : 'primary'}`}
      aria-pressed={wished}
      onClick={() => mutate({ movie, add: !wished })}
    >
      {wished ? '♥ In your wishlist' : '♡ Add to wishlist'}
    </button>
  );
}

export function MovieDetailPage() {
  const { id } = useParams();
  const movieId = Number(id);
  const { data, isPending, isError, error, refetch } = useMovieDetail(movieId);
  const slow = useSlowHint(isPending);
  const navigate = useNavigate();
  const location = useLocation();

  // "default" key = this is the first page of the session (deep link), so there is nothing to go back to.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));

  const back = (
    <button className="btn ghost back" onClick={goBack}>
      ← Back
    </button>
  );

  if (!Number.isInteger(movieId) || movieId <= 0) {
    return (
      <>
        {back}
        <ErrorState error={new Error('bad id')} />
      </>
    );
  }

  if (isPending) {
    return (
      <>
        {back}
        <SlowHint show={slow} />
        <DetailSkeleton />
      </>
    );
  }
  if (isError) {
    return (
      <>
        {back}
        <ErrorState error={error} onRetry={() => refetch()} />
      </>
    );
  }

  const m = data.data;
  const facts = [m.year, m.runtimeMinutes ? runtime(m.runtimeMinutes) : null, m.status].filter(Boolean);

  return (
    <>
      {back}
      {data.stale && <StaleBanner />}
      <div className="detail">
        {m.backdropUrl && <div className="backdrop" style={{ backgroundImage: `url(${m.backdropUrl})` }} aria-hidden="true" />}
        <div className="detail-main">
          <Poster url={m.posterUrl} title={m.title} className="detail-poster" />
          <div className="detail-text">
            <h1>{m.title}</h1>
            {m.tagline && <p className="tagline">{m.tagline}</p>}
            <p className="facts">
              {m.rating !== null && (
                <span className="rating">
                  ★ {m.rating.toFixed(1)} <small>({m.voteCount.toLocaleString()} votes)</small>
                </span>
              )}
              {facts.map((f) => (
                <span key={String(f)}>{f}</span>
              ))}
            </p>
            {m.genres.length > 0 && (
              <div className="chips static">
                {m.genres.map((g) => (
                  <Link key={g.id} className="chip" to={`/?genre=${g.id}`}>
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
            <h2>Overview</h2>
            <p className="overview">{m.overview || 'No overview is available for this movie yet.'}</p>
            <div className="actions">
              <WishlistButton movie={m} />
              {m.trailerKey && (
                <a className="btn" href={`https://www.youtube.com/watch?v=${encodeURIComponent(m.trailerKey)}`} target="_blank" rel="noreferrer noopener">
                  ▶ Watch trailer
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {m.cast.length > 0 && (
        <section>
          <h2>Cast</h2>
          <ul className="cast">
            {m.cast.map((c) => (
              <li key={c.id}>
                <div className="avatar">{c.profileUrl ? <img src={c.profileUrl} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">{c.name[0]}</span>}</div>
                <strong title={c.name}>{c.name}</strong>
                {c.character && <small title={c.character}>{c.character}</small>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.similar.length > 0 && (
        <section>
          <h2>More like this</h2>
          <MovieGrid movies={m.similar} />
        </section>
      )}
    </>
  );
}
