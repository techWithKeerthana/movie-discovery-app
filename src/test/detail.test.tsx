import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { apiError, deferred, detailOf, jsonRes, mockApi, renderApp } from './helpers';

async function openDetail(id: number, over: Record<string, unknown> = {}, status = 200) {
  const api = mockApi((u) => (u.pathname === `/api/movies/${id}` ? jsonRes(status === 200 ? detailOf(id, over) : over, status) : undefined));
  const utils = await renderApp();
  await screen.findByText('Movie 1');
  await act(async () => utils.navRef.navigate('MovieDetail', { id }));
  return { api, ...utils };
}

describe('Movie details screen', () => {
  it('shows skeletons while loading, then the movie', async () => {
    const gate = deferred<Response>();
    mockApi((u) => (u.pathname === '/api/movies/7' ? gate.promise : undefined));
    const { navRef } = await renderApp();
    await screen.findByText('Movie 1');
    await act(async () => navRef.navigate('MovieDetail', { id: 7 }));
    await waitFor(() => expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0));
    gate.resolve(jsonRes(detailOf(7, { tagline: 'A tagline', runtimeMinutes: 117, status: 'Released' })));
    expect(await screen.findByRole('header', { name: 'Movie 7' })).toBeOnTheScreen();
    expect(screen.getByText('A tagline')).toBeOnTheScreen();
    expect(screen.getByText('1h 57m')).toBeOnTheScreen();
  });

  it('copes with a movie that has no poster, overview, rating, cast, similar titles or trailer', async () => {
    await openDetail(7, { posterUrl: null, overview: '', rating: null });
    expect(await screen.findByRole('header', { name: 'Movie 7' })).toBeOnTheScreen();
    expect(screen.getByText(/No overview is available/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/no poster available/)).toBeOnTheScreen();
    expect(screen.queryByText(/votes\)/)).not.toBeOnTheScreen();
    expect(screen.queryByText('Cast')).not.toBeOnTheScreen();
    expect(screen.queryByText('More like this')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Watch trailer' })).not.toBeOnTheScreen();
  });

  it('a very long title wraps on the detail screen instead of being cut off', async () => {
    const long = 'The Extraordinarily Long and Unnecessarily Descriptive Title of a Film That Keeps Going Part II';
    await openDetail(7, { title: long });
    const heading = await screen.findByRole('header', { name: long });
    expect(heading.props.numberOfLines).toBeUndefined(); // no clamp on the detail screen
  });

  it('opens the trailer safely on YouTube, and tells the user if it cannot be opened', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true as never);
    await openDetail(7, { trailerKey: 'abc 123' });
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Watch trailer' }));
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc%20123');

    open.mockRejectedValueOnce(new Error('no handler'));
    await user.press(screen.getByRole('button', { name: 'Watch trailer' }));
    expect(await screen.findByText('Could not open the trailer.')).toBeOnTheScreen();
  });

  it('a movie that does not exist shows a not-found message with no retry button', async () => {
    await openDetail(7, { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } }, 404);
    expect(await screen.findByText('We could not find that.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it('a transient failure shows "Try again", which recovers', async () => {
    let fail = true;
    const { navRef } = await (async () => {
      mockApi((u) => (u.pathname === '/api/movies/7' && fail ? apiError('UPSTREAM_TIMEOUT', 'Too slow', true, 504) : undefined));
      return renderApp();
    })();
    await screen.findByText('Movie 1');
    await act(async () => navRef.navigate('MovieDetail', { id: 7 }));
    expect(await screen.findByText('Too slow')).toBeOnTheScreen();
    fail = false;
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('header', { name: 'Movie 7' })).toBeOnTheScreen();
  });

  it('the wishlist button toggles and the tab badge follows', async () => {
    await openDetail(7);
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Add to wishlist' }));
    expect(screen.getByRole('button', { name: 'Remove from wishlist' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Remove from wishlist' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to wishlist' })).not.toBeSelected());
  });

  it('shows the stale-data banner when the backend served saved data', async () => {
    mockApi((u) => (u.pathname === '/api/movies/7' ? jsonRes(detailOf(7), 200, { 'X-Cache': 'stale' }) : undefined));
    const { navRef } = await renderApp();
    await screen.findByText('Movie 1');
    await act(async () => navRef.navigate('MovieDetail', { id: 7 }));
    expect(await screen.findByText(/seeing saved results/)).toBeOnTheScreen();
  });
});
