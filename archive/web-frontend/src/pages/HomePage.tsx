import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useGenres, useMovieList } from '../hooks/queries';
import { useFilters } from '../hooks/useFilters';
import { FilterBar, SearchBox } from '../components/FilterBar';
import { InfiniteSentinel, MovieGrid } from '../components/MovieGrid';
import { EmptyState, ErrorState, SkeletonGrid, SlowHint, StaleBanner, useSlowHint } from '../components/States';
import { HOME_SEARCH_KEY } from '../lib/homeState';

const TMDB_PAGE_CAP = 500;

export function HomePage() {
  const { filters, update, reset, active } = useFilters();
  const searching = Boolean(filters.q);
  // While searching, sort is always relevance whatever the URL says (the URL's sort is kept for when the search is cleared).
  const { query, items, totalResults, stale } = useMovieList(searching ? { ...filters, sort: 'popularity.desc' } : filters);
  const genres = useGenres();
  const { search } = useLocation();

  // Remember the current filters so the header "Discover" link can return to them from other pages.
  useEffect(() => {
    try {
      sessionStorage.setItem(HOME_SEARCH_KEY, search);
    } catch {
      /* storage unavailable: header link just goes to the unfiltered home */
    }
  }, [search]);

  const { data, isPending, isError, error, isPlaceholderData, isFetching, isFetchingNextPage, isFetchNextPageError, hasNextPage, fetchNextPage, refetch } = query;
  const slow = useSlowHint(isPending || (isFetching && isPlaceholderData));

  const lastPage = data?.pages.at(-1);
  // A search+filter page can legitimately come back empty. Do not auto-chain through hundreds of
  // empty pages: only auto-load while pages are yielding results, otherwise offer a button.
  const lastPageHadItems = (lastPage?.data.items.length ?? 0) > 0;
  const heading = filters.q ? `Results for “${filters.q}”` : filters.genre || filters.year || filters.minRating ? 'Filtered movies' : 'Discover movies';
  // Genre/rating are applied to each page of search results, so the backend's total (all matches) would overstate the count.
  const searchFilterCaveat = Boolean(filters.q && (filters.genre || filters.minRating));

  let body;
  if (isPending) {
    body = <SkeletonGrid />;
  } else if (isError && !data) {
    body = <ErrorState error={error} onRetry={() => refetch()} />;
  } else if (items.length === 0 && !hasNextPage) {
    body = (
      <EmptyState
        title="No movies found"
        action={
          active ? (
            <button className="btn primary" onClick={reset}>
              Clear search and filters
            </button>
          ) : undefined
        }
      >
        {filters.q ? `Nothing matched “${filters.q}”. Check the spelling or try a different title.` : 'Try loosening your filters.'}
      </EmptyState>
    );
  } else {
    body = (
      <>
        <MovieGrid movies={items} dim={isPlaceholderData} />
        {isFetchingNextPage && <SkeletonGrid count={6} />}
        {isFetchNextPageError && (
          <div className="inline-error" role="alert">
            Could not load more movies.{' '}
            <button className="btn" onClick={() => fetchNextPage()}>
              Retry
            </button>
          </div>
        )}
        {hasNextPage && !isFetchingNextPage && !isFetchNextPageError && !lastPageHadItems && (
          <div className="load-more">
            <p>No matches on this page of results.</p>
            <button className="btn" onClick={() => fetchNextPage()}>
              Check the next page
            </button>
          </div>
        )}
        {!hasNextPage && items.length > 0 && (
          <p className="end-note">
            {lastPage && lastPage.data.page >= TMDB_PAGE_CAP
              ? 'That is as far as the movie database lets us go for this view. Narrow your filters to see more.'
              : "You've reached the end."}
          </p>
        )}
        <InfiniteSentinel
          onVisible={() => fetchNextPage()}
          disabled={!hasNextPage || isFetchingNextPage || isFetchNextPageError || isPlaceholderData || !lastPageHadItems}
        />
      </>
    );
  }

  return (
    <>
      <div className="toolbar">
        <SearchBox value={filters.q} onChange={(q) => update({ q })} />
        <FilterBar filters={filters} searching={searching} genres={genres.data} update={update} onReset={reset} canReset={active} />
      </div>

      {stale && <StaleBanner />}
      {isError && data && !isFetchNextPageError && (
        <div className="inline-error" role="alert">
          Could not refresh results.{' '}
          <button className="btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="results-head">
        <h1>{heading}</h1>
        {!isPending && items.length > 0 && !searchFilterCaveat && <span className="count">{totalResults.toLocaleString()} movies</span>}
      </div>
      {searchFilterCaveat && (
        <p className="note">Genre and rating filters are applied to each page of search results as it loads, so the total is not shown.</p>
      )}
      <SlowHint show={slow} />
      {body}
    </>
  );
}
