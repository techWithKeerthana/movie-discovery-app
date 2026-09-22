import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { apiError, deferred, jsonRes, mockApi, pageOf, renderApp, sleep } from './helpers';

const list = () => screen.getByTestId('discover-list');
const dataOf = () => list().props.data as { id: number }[];
const searchBox = () => screen.getByLabelText('Search movies');
const sortButton = (label: string) => screen.getByRole('button', { name: `Sort by: ${label}` });
const loaded = () => screen.findByText('Movie 1');

/** Types into the search box and presses the keyboard's Search key (skips the debounce). */
async function search(text: string) {
  const user = userEvent.setup();
  await user.clear(searchBox());
  await user.type(searchBox(), text);
  await fireEvent(searchBox(), 'submitEditing');
}

describe('Discover: loading, empty and error states', () => {
  it('shows skeletons while loading, then the grid and a formatted total', async () => {
    const gate = deferred<Response>();
    mockApi((u) => (u.pathname === '/api/movies' ? gate.promise : undefined));
    await renderApp();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    gate.resolve(jsonRes(pageOf([1, 2, 3], 1, 1, 12345)));
    await loaded();
    expect(screen.queryByTestId('skeleton')).not.toBeOnTheScreen();
    expect(screen.getByText('12,345 movies')).toBeOnTheScreen();
  });

  it('shows the empty state for a search with no results, and Clear resets the search and filters', async () => {
    mockApi((u) => (u.searchParams.get('query') === 'nonsense' ? jsonRes({ items: [], page: 1, totalPages: 0, totalResults: 0 }) : undefined));
    await renderApp();
    await loaded();
    await search('nonsense');
    expect(await screen.findByText('No movies found')).toBeOnTheScreen();
    expect(screen.getByText(/Nothing matched/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Clear search and filters' })[0]!);
    await loaded();
    expect(searchBox()).toHaveDisplayValue('');
  });

  it('shows a retryable error with "Try again", and retrying recovers', async () => {
    let fail = true;
    mockApi((u) => (u.pathname === '/api/movies' && fail ? apiError('UPSTREAM_UNAVAILABLE', 'The movie service is down', true) : undefined));
    await renderApp();
    expect(await screen.findByText('The movie service is down')).toBeOnTheScreen();
    fail = false;
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    await loaded();
    expect(screen.queryByText('The movie service is down')).not.toBeOnTheScreen();
  });

  it('does not offer "Try again" for a non-retryable error', async () => {
    mockApi((u) => (u.pathname === '/api/movies' ? apiError('BAD_REQUEST', 'Bad input', false, 400) : undefined));
    await renderApp();
    expect(await screen.findByText('Bad input')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it('turns a dropped connection into a friendly, retryable error', async () => {
    mockApi((u) => {
      if (u.pathname === '/api/movies') throw new TypeError('Network request failed');
      return undefined;
    });
    await renderApp();
    expect(await screen.findByText(/Cannot reach the server/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('shows a banner when the backend answered from saved (stale) data', async () => {
    mockApi((u) => (u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2]), 200, { 'X-Cache': 'stale' }) : undefined));
    await renderApp();
    await loaded();
    expect(screen.getByText(/seeing saved results/)).toBeOnTheScreen();
  });
});

describe('Discover: search (debounce, single in-flight request)', () => {
  it('debounces typing: rapid keystrokes commit ONE request for the final text', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    const before = api.lists().length;
    await userEvent.setup().type(searchBox(), 'matr');
    expect(api.lists().length).toBe(before); // still inside the 300 ms window
    await waitFor(() => expect(api.lists().length).toBe(before + 1), { timeout: 2000 });
    await sleep(400); // and nothing else follows
    const searches = api.lists().filter((c) => api.param(c, 'query'));
    expect(searches.map((c) => api.param(c, 'query'))).toEqual(['matr']);
  });

  it('the keyboard Search key searches immediately, skipping the debounce', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    await userEvent.setup().type(searchBox(), 'alien');
    await fireEvent(searchBox(), 'submitEditing');
    await waitFor(() => expect(api.param(api.lists().at(-1), 'query')).toBe('alien'));
  });

  it('starting a new search cancels the previous in-flight request, so only one is outstanding', async () => {
    const signals: AbortSignal[] = [];
    mockApi((u, init) => {
      if (u.searchParams.get('query') === 'first') {
        signals.push(init!.signal as AbortSignal);
        return new Promise<Response>((_res, rej) =>
          init!.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
        );
      }
      return undefined;
    });
    await renderApp();
    await loaded();
    await search('first');
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0]!.aborted).toBe(false); // still waiting on the server
    await search('second');
    await waitFor(() => expect(signals[0]!.aborted).toBe(true)); // superseded => cancelled
    expect(await screen.findByText('Results for “second”')).toBeOnTheScreen();
  });

  it('the clear (x) button empties the box and returns to browsing', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    await search('heat');
    await screen.findByText('Results for “heat”');
    const browseRequests = () => api.lists().filter((c) => !api.param(c, 'query')).length;
    expect(browseRequests()).toBe(1);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText('Discover movies');
    expect(searchBox()).toHaveDisplayValue('');
    expect(dataOf()[0]!.id).toBe(1); // the unfiltered list is back
    expect(browseRequests()).toBe(1); // ...straight from the query cache, no refetch
  });
});

describe('Discover: sort control in search mode, and the misleading total', () => {
  it('sort shows only "Relevance" and is disabled while searching; requests never carry another sort', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(sortButton('Most popular'));
    await user.press(screen.getByRole('button', { name: 'Highest rated' }));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'sort')).toBe('rating.desc'));

    await search('heat');
    await screen.findByText('Results for “heat”');
    expect(sortButton('Relevance')).toBeDisabled();
    expect(api.lists().filter((c) => api.param(c, 'query') === 'heat').every((c) => api.param(c, 'sort') === 'popularity.desc')).toBe(true);
  });

  it('the previously chosen sort comes back when the search is cleared', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(sortButton('Most popular'));
    await user.press(screen.getByRole('button', { name: 'Highest rated' }));
    await search('heat');
    await screen.findByText('Results for “heat”');
    await user.press(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText('Discover movies');
    expect(sortButton('Highest rated')).toBeEnabled();
    // The rating-sorted browse list was already loaded before the search, so it returns from cache with no new request.
    expect(api.lists().filter((c) => !api.param(c, 'query') && api.param(c, 'sort') === 'rating.desc')).toHaveLength(1);
    expect(dataOf()[0]!.id).toBe(1);
  });

  it('shows the total for a plain search but hides it once genre filters refine each page', async () => {
    mockApi((u) => (u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2, 3], 1, 4, 987)) : undefined));
    await renderApp();
    await loaded();
    await search('heat');
    await screen.findByText('Results for “heat”');
    expect(screen.getByText('987 movies')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Drama' }));
    await waitFor(() => expect(screen.queryByText('987 movies')).not.toBeOnTheScreen());
    expect(screen.getByText(/total is not shown/)).toBeOnTheScreen();
  });

  it('plain browsing keeps the total even with a genre filter (discover is exact)', async () => {
    mockApi((u) => (u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2, 3], 1, 4, 987)) : undefined));
    await renderApp();
    await loaded();
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Drama' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Drama' })).toBeSelected());
    expect(screen.getByText('987 movies')).toBeOnTheScreen();
  });
});

describe('Discover: filters', () => {
  it('genre, year and rating each narrow the request; the genre chip toggles off again', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Drama' }));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'genre')).toBe('18'));
    expect(screen.getByRole('button', { name: 'Drama' })).toBeSelected();

    await user.press(screen.getByRole('button', { name: /^Min rating:/ }));
    await user.press(screen.getByRole('button', { name: '7+ ★' }));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'minRating')).toBe('7'));

    await user.press(screen.getByRole('button', { name: /^Year:/ }));
    const thisYear = String(new Date().getFullYear()); // the picker list is virtualised: only the first rows exist
    await user.press(screen.getByRole('button', { name: thisYear }));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'year')).toBe(thisYear));

    await user.press(screen.getByRole('button', { name: 'Drama' })); // toggle off
    await waitFor(() => expect(api.param(api.lists().at(-1), 'genre')).toBeNull());
  });
});

describe('Discover: infinite scroll', () => {
  it('loads the next page at the end of the list, appends, and de-duplicates overlapping ids', async () => {
    const api = mockApi((u) => {
      if (u.pathname !== '/api/movies') return undefined;
      const page = Number(u.searchParams.get('page') ?? 1);
      return jsonRes(page === 2 ? pageOf([20, 21, 22], 2, 2) : pageOf(Array.from({ length: 20 }, (_, n) => n + 1), 1, 2));
    });
    await renderApp();
    await loaded();
    expect(dataOf()).toHaveLength(20);
    await fireEvent(list(), 'endReached');
    await waitFor(() => expect(dataOf()).toHaveLength(22)); // 20 + 3 - 1 duplicate
    expect(api.lists().map((c) => api.param(c, 'page'))).toEqual(['1', '2']);
    expect(await screen.findByText(/reached the end/)).toBeOnTheScreen();
  });

  it('shows a pending skeleton row while the next page loads', async () => {
    const gate = deferred<Response>();
    mockApi((u) => (u.pathname === '/api/movies' && u.searchParams.get('page') === '2' ? gate.promise : undefined));
    await renderApp();
    await loaded();
    await fireEvent(list(), 'endReached');
    await waitFor(() => expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0));
    gate.resolve(jsonRes(pageOf([41], 2, 3)));
    await waitFor(() => expect(dataOf()).toHaveLength(21));
    expect(screen.queryByTestId('skeleton')).not.toBeOnTheScreen();
  });

  it('a failing next page shows an inline retry and does NOT auto-loop', async () => {
    let fail = true;
    const api = mockApi((u) =>
      u.pathname === '/api/movies' && u.searchParams.get('page') === '2' && fail ? apiError('UPSTREAM_TIMEOUT', 'Too slow', true, 504) : undefined,
    );
    await renderApp();
    await loaded();
    await fireEvent(list(), 'endReached');
    expect(await screen.findByText('Could not load more movies.')).toBeOnTheScreen();
    const attempts = () => api.lists().filter((c) => api.param(c, 'page') === '2').length;
    const n = attempts();
    await fireEvent(list(), 'endReached'); // the list keeps asking; the screen must not
    await sleep(50);
    expect(attempts()).toBe(n);
    fail = false;
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(dataOf()).toHaveLength(40));
  });

  it('stops at the end and explains the TMDB 500-page ceiling', async () => {
    const api = mockApi((u) => (u.pathname === '/api/movies' ? jsonRes(pageOf([1, 2], 500, 500)) : undefined));
    await renderApp();
    await loaded();
    await fireEvent(list(), 'endReached');
    expect(await screen.findByText(/as far as the movie database lets us go/)).toBeOnTheScreen();
    expect(api.lists()).toHaveLength(1);
  });

  it('does not chain through empty pages: offers a button instead of auto-loading', async () => {
    const api = mockApi((u) => (u.pathname === '/api/movies' ? jsonRes({ items: [], page: 1, totalPages: 50, totalResults: 1000 }) : undefined));
    await renderApp();
    expect(await screen.findByText(/No matches on this page/)).toBeOnTheScreen();
    await fireEvent(list(), 'endReached');
    expect(api.lists()).toHaveLength(1); // no auto-fetch
    await userEvent.setup().press(screen.getByRole('button', { name: 'Check the next page' }));
    await waitFor(() => expect(api.lists()).toHaveLength(2));
  });
});
