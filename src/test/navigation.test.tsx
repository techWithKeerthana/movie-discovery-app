import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { jsonRes, mockApi, pageOf, renderApp } from './helpers';

const list = () => screen.getByTestId('discover-list');
const dataOf = () => list().props.data as { id: number }[];
const searchBox = () => screen.getByLabelText('Search movies');
const card = (n: number) => screen.getByRole('button', { name: new RegExp(`^Movie ${n}, `) });
const loaded = () => screen.findByText('Movie 1');

describe('Navigation keeps context', () => {
  it('Back from a movie returns to the SAME mounted Discover screen: filters, search text and loaded pages intact, no refetch', async () => {
    const api = mockApi();
    const { navRef } = await renderApp();
    await loaded();
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Drama' }));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'genre')).toBe('18'));
    await user.type(searchBox(), 'alien');
    await fireEvent(searchBox(), 'submitEditing');
    await waitFor(() => expect(api.param(api.lists().at(-1), 'query')).toBe('alien'));
    await screen.findByText('Movie 1');
    await fireEvent(list(), 'endReached'); // load a second page so there is scroll state worth keeping
    await waitFor(() => expect(dataOf()).toHaveLength(40));
    const listCalls = api.lists().length;

    await user.press(card(3));
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('MovieDetail'));
    await screen.findByRole('header', { name: 'Movie 3' });

    await act(async () => navRef.goBack());
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('Discover'));

    // A remount would have reset every one of these to its initial value.
    expect(searchBox()).toHaveDisplayValue('alien');
    expect(screen.getByRole('button', { name: 'Drama' })).toBeSelected();
    expect(dataOf()).toHaveLength(40);
    expect(api.lists().length).toBe(listCalls);
  });

  it('switching to the Wishlist tab and back also keeps Discover state (tabs stay mounted)', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(await screen.findByRole('button', { name: 'Drama' }));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'genre')).toBe('18'));
    const calls = api.lists().length;

    await user.press(screen.getByText('Wishlist'));
    expect(await screen.findByRole('header', { name: 'Your wishlist' })).toBeOnTheScreen();
    await user.press(screen.getByText('Discover'));

    expect(screen.getByRole('button', { name: 'Drama' })).toBeSelected();
    expect(api.lists().length).toBe(calls);
  });

  it('opening a movie from the Wishlist tab and going Back returns to the Wishlist tab', async () => {
    mockApi((u) => (u.pathname === '/api/wishlist' ? jsonRes({ items: pageOf([7, 8]).items }) : undefined));
    const { navRef } = await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(screen.getByText('Wishlist'));
    await user.press(await screen.findByRole('button', { name: /^Movie 7, / }));
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('MovieDetail'));
    await act(async () => navRef.goBack());
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('Wishlist'));
    expect(screen.getByRole('header', { name: 'Your wishlist' })).toBeOnTheScreen();
  });

  it('"More like this" pushes another detail screen on the stack, and Back walks back one movie at a time', async () => {
    mockApi((u) => {
      if (u.pathname === '/api/movies/5') {
        return jsonRes({ ...pageOf([5]).items[0], tagline: '', runtimeMinutes: null, releaseDate: null, genres: [], status: null, trailerKey: null, cast: [], similar: pageOf([9]).items });
      }
      return undefined;
    });
    const { navRef } = await renderApp();
    await loaded();
    await act(async () => navRef.navigate('MovieDetail', { id: 5, title: 'Movie 5' }));
    await screen.findByRole('header', { name: 'Movie 5' });
    await userEvent.setup().press(await screen.findByRole('button', { name: /^Movie 9, / }));
    await screen.findByRole('header', { name: 'Movie 9' });
    await act(async () => navRef.goBack());
    expect(await screen.findByRole('header', { name: 'Movie 5' })).toBeOnTheScreen();
    await act(async () => navRef.goBack());
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('Discover'));
  });

  it('tapping a genre on the detail screen jumps to Discover filtered by that genre', async () => {
    const api = mockApi((u) =>
      u.pathname === '/api/movies/5'
        ? jsonRes({ ...pageOf([5]).items[0], tagline: '', runtimeMinutes: null, releaseDate: null, genres: [{ id: 28, name: 'Action' }], status: null, trailerKey: null, cast: [], similar: [] })
        : undefined,
    );
    const { navRef } = await renderApp();
    await loaded();
    await act(async () => navRef.navigate('MovieDetail', { id: 5, title: 'Movie 5' }));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Browse Action movies' }));
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('Discover'));
    await waitFor(() => expect(api.param(api.lists().at(-1), 'genre')).toBe('28'));
    expect(screen.getByRole('button', { name: 'Action' })).toBeSelected();
  });
});
