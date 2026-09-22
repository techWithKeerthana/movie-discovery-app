import { Link } from 'react-router-dom';
import { useWishlist } from '../hooks/useWishlist';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/States';
import { MovieGrid } from '../components/MovieGrid';

export function WishlistPage() {
  const { query, items } = useWishlist();

  let body;
  if (query.isPending) body = <SkeletonGrid count={6} />;
  else if (query.isError && !query.data) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else if (items.length === 0) {
    body = (
      <EmptyState
        title="Your wishlist is empty"
        action={
          <Link className="btn primary" to="/">
            Discover movies
          </Link>
        }
      >
        Tap the heart on any movie to save it here. Your list is kept even after you close the app.
      </EmptyState>
    );
  } else body = <MovieGrid movies={items} />;

  return (
    <>
      <div className="results-head">
        <h1>Your wishlist</h1>
        {items.length > 0 && <span className="count">{items.length} saved</span>}
      </div>
      {body}
    </>
  );
}
