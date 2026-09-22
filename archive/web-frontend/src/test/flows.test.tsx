import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError, deferred, jsonRes, mockApi, pageOf, renderApp, standardHandler, summary } from './helpers';
import { io } from './setup';

const cards = () => screen.queryAllByRole('article');
const loaded = () => screen.findByRole('heading', { name: 'Movie 1' });
const movieHeading = (n: number) => screen.findByRole('heading', { name: `Movie ${n}` });

describe('Discover: loading, empty and error states', () => {
  it('shows skeletons while loading, then the grid and a formatted result count', async () => {
    const gate = deferred<Response>();
    mockApi((u, i) => (u.pathname === '/api/movies' ? gate.promise : standardHandler(u, i)));
    const { container } = renderApp();
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
    gate.resolve(jsonRes(pageOf([1, 2, 3], 1, 1, 12345)));
    await loaded();
    expect(container.querySelector('.skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('12,345 movies')).toBeInTheDocument();
  });

  it('shows the empty state for a search with no results, and Clear resets the URL', async () => {
    mockApi((u, i) =>
      u.pathname === '/api/movies' ? jsonRes({ items: [], page: 1, totalPages: 0, totalResults: 0 }) : standardHandler(u, i),
    );
    const { router } = renderApp('/?q=nonsense');
    expect(await screen.findByText('No movies found')).toBeInTheDocument();
    expect(screen.getByText(/Nothing matched/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows a retryable error with "Try again", and retrying recovers', async () => {
    let fail = true;
    mockApi((u, i) =>
      u.pathname === '/api/movies' && fail ? apiError('UPSTREAM_UNAVAILABLE', 'The movie service is down', true) : standardHandler(u, i),
    );
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('The movie service is down');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await loaded();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not offer "Try again" for a non-retryable error', async () => {
    mockApi((u, i) => (u.pathname === '/api/movies' ? apiError('BAD_REQUEST', 'Bad input', false, 400) : standardHandler(u, i)));
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad input');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('turns a dropped connection into a friendly, retryable network error', async () => {
    mockApi((u, i) => {
      if (u.pathname === '/api/movies') throw new TypeError('Failed to fetch');
      return standardHandler(u, i);
    });
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Can.t reach the server/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a banner when the backend answered from saved (stale) data', async () => {
    mockApi((u, i) =>
      u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2]), 200, { 'X-Cache': 'stale' }) : standardHandler(u, i),
    );
    renderApp();
    await loaded();
    expect(screen.getByText(/seeing saved results/)).toBeInTheDocument();
  });
});

describe('Discover: search, filters and URL state', () => {
  it('debounces typing: rapid keystrokes produce ONE request for the final text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockApi(standardHandler);
    renderApp();
    await loaded();
    const before = api.list().length;
    const box = screen.getByLabelText('Search movies');
    for (const text of ['m', 'ma', 'mat', 'matr']) fireEvent.change(box, { target: { value: text } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(api.list().length).toBe(before); // still inside the 300ms window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await waitFor(() => expect(api.list().length).toBe(before + 1));
    expect(api.list().at(-1)!.searchParams.get('query')).toBe('matr');
  });

  it('pressing Enter searches immediately, skipping the debounce', async () => {
    const api = mockApi(standardHandler);
    const { router } = renderApp();
    await loaded();
    const box = screen.getByLabelText('Search movies');
    fireEvent.change(box, { target: { value: 'alien' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(router.state.location.search).toContain('q=alien'));
    await waitFor(() => expect(api.list().at(-1)!.searchParams.get('query')).toBe('alien'));
  });

  it('genre chip, year, rating and sort each update the URL and the request', async () => {
    const api = mockApi(standardHandler);
    const { router } = renderApp();
    await loaded();
    await userEvent.click(await screen.findByRole('button', { name: 'Drama' }));
    await waitFor(() => expect(api.list().at(-1)!.searchParams.get('genre')).toBe('18'));
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'rating.desc');
    await userEvent.selectOptions(screen.getByLabelText('Min rating'), '7');
    await userEvent.selectOptions(screen.getByLabelText('Year'), '1999');
    await waitFor(() => {
      const q = api.list().at(-1)!.searchParams;
      expect([q.get('genre'), q.get('sort'), q.get('minRating'), q.get('year')]).toEqual(['18', 'rating.desc', '7', '1999']);
    });
    expect(router.state.location.search).toContain('genre=18');
    expect(screen.getByRole('button', { name: 'Drama' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores garbage in a hand-edited URL instead of sending it to the API', async () => {
    const api = mockApi(standardHandler);
    renderApp('/?genre=abc&sort=DROP&year=-5&minRating=1e9');
    await loaded();
    const q = api.list()[0]!.searchParams;
    expect(q.has('genre')).toBe(false);
    expect(q.has('year')).toBe(false);
    expect(q.get('sort')).toBe('popularity.desc'); // invalid sort falls back to the default
  });

  it('pre-fills filters and search box from the URL (deep link / Back)', async () => {
    mockApi(standardHandler);
    renderApp('/?q=heat&genre=35&sort=release.desc');
    await loaded();
    expect(screen.getByLabelText('Search movies')).toHaveValue('heat');
    expect(screen.getByLabelText('Sort by')).toHaveValue('popularity.desc'); // searching: relevance only (see next describe)
    expect(screen.getByRole('button', { name: 'Comedy' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Results for');
  });

});

describe('Discover: search mode shows only relevance sort and never a misleading total', () => {
  const sortSelect = () => screen.getByLabelText('Sort by') as HTMLSelectElement;
  const optionLabels = () => [...sortSelect().options].map((o) => o.textContent);

  it('offers only "Relevance" (disabled) while searching, and the full list of sorts otherwise', async () => {
    mockApi(standardHandler);
    renderApp('/?q=heat');
    await loaded();
    expect(optionLabels()).toEqual(['Relevance']);
    expect(sortSelect()).toBeDisabled();
  });

  it('never sends a non-relevance sort while searching, even if the URL carries one', async () => {
    const api = mockApi(standardHandler);
    renderApp('/?q=heat&sort=rating.desc');
    await loaded();
    expect(api.list().every((c) => c.searchParams.get('sort') === 'popularity.desc')).toBe(true);
    expect(api.list()[0]!.searchParams.get('query')).toBe('heat');
  });

  it('keeps the chosen sort in the URL and restores it when the search is cleared', async () => {
    const api = mockApi(standardHandler);
    const { router } = renderApp('/?q=heat&sort=rating.desc');
    await loaded();
    expect(router.state.location.search).toContain('sort=rating.desc'); // untouched while searching
    fireEvent.change(screen.getByLabelText('Search movies'), { target: { value: '' } });
    fireEvent.submit(screen.getByLabelText('Search movies').closest('form')!);
    await waitFor(() => expect(sortSelect()).not.toBeDisabled());
    expect(sortSelect().value).toBe('rating.desc');
    expect(optionLabels()).toContain('Highest rated');
    await waitFor(() => expect(api.list().at(-1)!.searchParams.get('sort')).toBe('rating.desc'));
    expect(api.list().at(-1)!.searchParams.has('query')).toBe(false);
  });

  it('shows the total for a plain search (it is exact), but hides it once genre or rating filters refine pages', async () => {
    mockApi((u, i) => (u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2, 3], 1, 4, 987)) : standardHandler(u, i)));
    const plain = renderApp('/?q=heat');
    await loaded();
    expect(screen.getByText('987 movies')).toBeInTheDocument();
    expect(screen.queryByText(/total is not shown/)).not.toBeInTheDocument();
    plain.unmount();

    renderApp('/?q=heat&genre=18');
    await loaded();
    expect(screen.queryByText(/987 movies/)).not.toBeInTheDocument();
    expect(screen.getByText(/applied to each page of search results.*total is not shown/)).toBeInTheDocument();
  });

  it('non-search browsing keeps the total even with a genre filter (discover is exact)', async () => {
    mockApi((u, i) => (u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2, 3], 1, 4, 987)) : standardHandler(u, i)));
    renderApp('/?genre=18&minRating=7');
    await loaded();
    expect(screen.getByText('987 movies')).toBeInTheDocument();
  });
});

describe('Discover: infinite scroll', () => {
  it('loads the next page when the sentinel becomes visible, appends, and de-duplicates overlapping ids', async () => {
    const api = mockApi((u, i) => {
      if (u.pathname === '/api/movies' && u.searchParams.get('page') === '2') {
        return jsonRes(pageOf([20, 21, 22], 2, 2)); // id 20 also appeared on page 1
      }
      return u.pathname === '/api/movies' ? jsonRes(pageOf(Array.from({ length: 20 }, (_, n) => n + 1), 1, 2)) : standardHandler(u, i);
    });
    renderApp();
    await loaded();
    expect(cards()).toHaveLength(20);
    act(() => io.trigger());
    await movieHeading(22);
    expect(cards()).toHaveLength(22); // 20 + 3 new - 1 duplicate
    expect(api.list().map((c) => c.searchParams.get('page'))).toEqual(['1', '2']);
    expect(screen.getByText(/reached the end/)).toBeInTheDocument();
  });

  it('shows a pending skeleton row while the next page loads', async () => {
    const gate = deferred<Response>();
    mockApi((u, i) => (u.pathname === '/api/movies' && u.searchParams.get('page') === '2' ? gate.promise : standardHandler(u, i)));
    const { container } = renderApp();
    await loaded();
    act(() => io.trigger());
    await waitFor(() => expect(container.querySelector('.skeleton')).toBeInTheDocument());
    gate.resolve(jsonRes(pageOf([41], 2, 3)));
    await movieHeading(41);
    expect(container.querySelector('.skeleton')).not.toBeInTheDocument();
  });

  it('a failing next page shows an inline retry and does NOT auto-loop', async () => {
    let fail = true;
    const api = mockApi((u, i) =>
      u.pathname === '/api/movies' && u.searchParams.get('page') === '2' && fail
        ? apiError('UPSTREAM_TIMEOUT', 'Too slow', true, 504)
        : standardHandler(u, i),
    );
    renderApp();
    await loaded();
    act(() => io.trigger());
    expect(await screen.findByText(/Could not load more movies/)).toBeInTheDocument();
    const attempts = api.list().filter((c) => c.searchParams.get('page') === '2').length;
    act(() => io.trigger()); // sentinel must be disabled while in the error state
    await new Promise((r) => setTimeout(r, 50));
    expect(api.list().filter((c) => c.searchParams.get('page') === '2').length).toBe(attempts);
    fail = false;
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));
    await movieHeading(21);
  });

  it('stops asking for pages at the end and explains the TMDB 500-page ceiling', async () => {
    const api = mockApi((u, i) =>
      u.pathname === '/api/movies' ? jsonRes({ ...pageOf([1, 2], 500, 500), page: 500 }) : standardHandler(u, i),
    );
    renderApp('/?page=irrelevant');
    await loaded();
    act(() => io.trigger());
    expect(screen.getByText(/as far as the movie database lets us go/)).toBeInTheDocument();
    expect(api.list()).toHaveLength(1);
  });

  it('does not chain through empty pages: offers a button instead of auto-loading', async () => {
    const api = mockApi((u, i) =>
      u.pathname === '/api/movies' ? jsonRes({ items: [], page: 1, totalPages: 50, totalResults: 1000 }) : standardHandler(u, i),
    );
    renderApp('/?q=x&genre=18');
    expect(await screen.findByText(/No matches on this page/)).toBeInTheDocument();
    act(() => io.trigger());
    expect(api.list()).toHaveLength(1); // no auto-fetch
    await userEvent.click(screen.getByRole('button', { name: 'Check the next page' }));
    await waitFor(() => expect(api.list()).toHaveLength(2));
  });
});

describe('Navigation keeps context', () => {
  it('Back from a movie: same filters, list served from cache (no refetch), scroll position restored', async () => {
    const api = mockApi((u, i) => {
      if (u.pathname.startsWith('/api/movies/')) {
        return jsonRes({ ...summary(2), tagline: '', runtimeMinutes: 100, releaseDate: null, genres: [], status: null, trailerKey: null, cast: [], similar: [] });
      }
      return standardHandler(u, i);
    });
    const { router } = renderApp('/?genre=18&sort=rating.desc');
    await loaded();
    const listCalls = api.list().length;

    Object.defineProperty(window, 'scrollY', { value: 1234, configurable: true, writable: true });
    await userEvent.click(screen.getByRole('link', { name: /Movie 2( |$)/ })); // not 'Movie 20'
    await screen.findByRole('heading', { level: 1, name: 'Movie 2' });
    expect(router.state.location.pathname).toBe('/movie/2');

    await act(async () => {
      await router.navigate(-1);
    });
    await loaded();
    expect(router.state.location.search).toBe('?genre=18&sort=rating.desc');
    expect(cards()).toHaveLength(20);
    expect(api.list().length).toBe(listCalls); // served from the query cache, no network
    expect(window.scrollTo).toHaveBeenCalledWith(0, 1234);
  });

  it('the header Discover tab returns to the last-used filters', async () => {
    mockApi(standardHandler);
    const { router } = renderApp('/?genre=35');
    await loaded();
    await userEvent.click(screen.getByRole('link', { name: /Wishlist/ }));
    await screen.findByRole('heading', { level: 1, name: 'Your wishlist' });
    await userEvent.click(screen.getByRole('link', { name: 'Discover' }));
    await loaded();
    expect(router.state.location.search).toBe('?genre=35');
  });

  it('unknown routes show a not-found page with a way back', async () => {
    mockApi(standardHandler);
    renderApp('/nope');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Discover' })).toHaveAttribute('href', '/');
  });
});

describe('Movie details', () => {
  const detail = (over: Record<string, unknown> = {}) => ({
    ...summary(7, { title: 'Sparse Movie', overview: '', rating: null, posterUrl: null }),
    tagline: '', runtimeMinutes: null, releaseDate: null, genres: [], status: null, trailerKey: null, cast: [], similar: [], ...over,
  });

  it('renders a movie with missing poster, overview, rating and runtime without breaking', async () => {
    mockApi((u, i) => (u.pathname === '/api/movies/7' ? jsonRes(detail()) : standardHandler(u, i)));
    renderApp('/movie/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sparse Movie' })).toBeInTheDocument();
    expect(screen.getByText(/No overview is available/)).toBeInTheDocument();
    expect(screen.getByLabelText(/no poster available/)).toBeInTheDocument();
    expect(screen.queryByText(/votes\)/)).not.toBeInTheDocument();
    expect(screen.queryByText('Watch trailer')).not.toBeInTheDocument();
  });

  it('shows a trailer link only when a trailer exists, opened safely in a new tab', async () => {
    mockApi((u, i) => (u.pathname === '/api/movies/7' ? jsonRes(detail({ trailerKey: 'abc 123' })) : standardHandler(u, i)));
    renderApp('/movie/7');
    const link = await screen.findByRole('link', { name: /Watch trailer/ });
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc%20123');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('a movie that does not exist shows a not-found error with no retry button', async () => {
    mockApi((u, i) => (u.pathname === '/api/movies/7' ? apiError('NOT_FOUND', 'Not found', false, 404) : standardHandler(u, i)));
    renderApp('/movie/7');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not find that');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('rejects a non-numeric id without calling the API', async () => {
    const api = mockApi(standardHandler);
    renderApp('/movie/abc');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.calls.some((c) => c.pathname.startsWith('/api/movies/'))).toBe(false);
  });
});

describe('Wishlist (optimistic UI)', () => {
  it('flips the heart immediately, before the server answers, and keeps it after success', async () => {
    const gate = deferred<Response>();
    const api = mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' ? gate.promise : standardHandler(u, i)));
    renderApp();
    await loaded();
    const heart = screen.getByRole('button', { name: 'Add Movie 1 to wishlist' });
    await userEvent.click(heart);
    expect(screen.getByRole('button', { name: 'Remove Movie 1 from wishlist' })).toHaveAttribute('aria-pressed', 'true'); // still pending
    expect(screen.getByText('1', { selector: '.badge' })).toBeInTheDocument();
    gate.resolve(jsonRes({ ok: true }, 201));
    await waitFor(() => expect(api.calls.filter((c) => c.pathname === '/api/wishlist/1')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Remove Movie 1 from wishlist' })).toBeInTheDocument();
  });

  it('sends a validated snapshot and the anonymous device id header', async () => {
    const api = mockApi(standardHandler);
    renderApp();
    await loaded();
    await userEvent.click(screen.getByRole('button', { name: 'Add Movie 1 to wishlist' }));
    await waitFor(() => expect(api.fn.mock.calls.some(([u, i]) => String(u).endsWith('/wishlist/1') && i?.method === 'PUT')).toBe(true));
    const [, init] = api.fn.mock.calls.find(([u, i]) => String(u).endsWith('/wishlist/1') && i?.method === 'PUT')!;
    expect(JSON.parse(String(init!.body))).toMatchObject({ id: 1, title: 'Movie 1' });
    const id = (init!.headers as Record<string, string>)['X-Device-Id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rolls the heart back and tells the user when the request fails', async () => {
    mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' ? apiError('INTERNAL', 'db down', false, 500) : standardHandler(u, i)));
    renderApp();
    await loaded();
    await userEvent.click(screen.getByRole('button', { name: 'Add Movie 1 to wishlist' }));
    expect(await screen.findByText(/Could not add to your wishlist/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Movie 1 to wishlist' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('wishlist page: empty state, then items from the server, and removal empties it again', async () => {
    let items = [summary(5), summary(6)];
    mockApi((u, i) => {
      if (u.pathname === '/api/wishlist' && (i?.method ?? 'GET') === 'GET') return jsonRes({ items });
      if (u.pathname.startsWith('/api/wishlist/') && i?.method === 'DELETE') {
        items = items.filter((m) => `/api/wishlist/${m.id}` !== u.pathname);
        return jsonRes(null, 204);
      }
      return standardHandler(u, i);
    });
    renderApp('/wishlist');
    expect(await movieHeading(5)).toBeInTheDocument();
    expect(screen.getByText('2 saved')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Movie 5 from wishlist' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Movie 6 from wishlist' }));
    expect(await screen.findByText('Your wishlist is empty')).toBeInTheDocument();
  });

  it('wishlist page error is recoverable', async () => {
    let fail = true;
    mockApi((u, i) => (u.pathname === '/api/wishlist' && (i?.method ?? 'GET') === 'GET' && fail ? apiError('INTERNAL', 'oops', true, 500) : standardHandler(u, i)));
    renderApp('/wishlist');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your wishlist is empty')).toBeInTheDocument();
  });
});
