import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetDeviceIdCache } from '../lib/deviceId';
import { apiError, deferred, deviceOf, jsonRes, mockApi, pageOf, renderApp } from './helpers';

const loaded = () => screen.findByText('Movie 1');
const add = (n: number) => screen.getByRole('button', { name: `Add Movie ${n} to wishlist` });
const remove = (n: number) => screen.getByRole('button', { name: `Remove Movie ${n} from wishlist` });

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDeviceIdCache();
});

describe('Wishlist heart (optimistic UI)', () => {
  it('fills instantly, before the server answers, and the tab badge counts it', async () => {
    const gate = deferred<Response>();
    mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' ? gate.promise : undefined));
    await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    expect(remove(1)).toBeSelected(); // flipped while the request is still pending
    expect(screen.getByText('1', { exact: true })).toBeOnTheScreen(); // tab badge
    gate.resolve(jsonRes({ ok: true }, 201));
    await waitFor(() => expect(remove(1)).toBeSelected());
  });

  it('sends a validated snapshot and the anonymous device id, which is stored on the device', async () => {
    const api = mockApi();
    await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    await waitFor(() => expect(api.calls.some((c) => c.url.pathname === '/api/wishlist/1' && c.init?.method === 'PUT')).toBe(true));
    const put = api.calls.find((c) => c.url.pathname === '/api/wishlist/1' && c.init?.method === 'PUT')!;
    expect(JSON.parse(String(put.init!.body))).toMatchObject({ id: 1, title: 'Movie 1', posterUrl: expect.stringContaining('image.tmdb.org') });
    const id = deviceOf(put.init)!;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await AsyncStorage.getItem('trackzio.deviceId')).toBe(id);
  });

  it('rolls the heart back and tells the user when the request fails', async () => {
    mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' ? apiError('INTERNAL', 'db down', false, 500) : undefined));
    await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    expect(await screen.findByText('Could not add to your wishlist. Please try again.')).toBeOnTheScreen();
    await waitFor(() => expect(add(1)).not.toBeSelected());
  });

  it('a failed removal keeps the movie in the wishlist and shows a message', async () => {
    const api = mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'DELETE' ? apiError('INTERNAL', 'db down', false, 500) : undefined));
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(add(1));
    await waitFor(() => expect(api.wishlists.size).toBe(1));
    await user.press(remove(1));
    expect(await screen.findByText('Could not remove from your wishlist. Please try again.')).toBeOnTheScreen();
    await waitFor(() => expect(remove(1)).toBeSelected());
  });
});

describe('Wishlist persistence', () => {
  it('survives closing and reopening the app: same device id from storage, wishlist read back from the server', async () => {
    const api = mockApi();
    const first = await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    await waitFor(() => expect([...api.wishlists.values()].flat()).toHaveLength(1));
    const idBefore = await AsyncStorage.getItem('trackzio.deviceId');

    await first.unmount(); // close the app...
    resetDeviceIdCache(); // ...and start a new process: nothing in memory survives, only AsyncStorage and the server

    await renderApp();
    await loaded();
    expect(await screen.findByRole('button', { name: 'Remove Movie 1 from wishlist' })).toBeSelected();
    expect(await AsyncStorage.getItem('trackzio.deviceId')).toBe(idBefore); // same identity => same wishlist
    await userEvent.setup().press(screen.getByText('Wishlist'));
    expect(await screen.findByText('1 saved')).toBeOnTheScreen();
  });

  it('a different device (fresh storage) sees an empty wishlist', async () => {
    const api = mockApi();
    const first = await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    await waitFor(() => expect([...api.wishlists.values()].flat()).toHaveLength(1));
    await first.unmount();

    await AsyncStorage.clear(); // e.g. a different phone
    resetDeviceIdCache();
    await renderApp();
    await loaded();
    expect(add(1)).toBeOnTheScreen();
  });
});

describe('Wishlist screen states', () => {
  it('empty state has a call to action that goes to Discover', async () => {
    mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(screen.getByText('Wishlist'));
    expect(await screen.findByText('Your wishlist is empty')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Discover movies' }));
    expect(await screen.findByRole('header', { name: 'Discover movies' })).toBeOnTheScreen();
  });

  it('lists saved movies, and removing the last one returns to the empty state', async () => {
    let items = pageOf([5, 6]).items; // a server-side list that really deletes
    mockApi((u, i) => {
      if (u.pathname === '/api/wishlist' && (i?.method ?? 'GET') === 'GET') return jsonRes({ items });
      const del = u.pathname.match(/^\/api\/wishlist\/(\d+)$/);
      if (del && i?.method === 'DELETE') {
        items = items.filter((m) => m.id !== Number(del[1]));
        return jsonRes(null, 204);
      }
      return undefined;
    });
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(screen.getByText('Wishlist'));
    expect(await screen.findByText('2 saved')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('button', { name: 'Remove Movie 5 from wishlist' })[0]!);
    await user.press(screen.getAllByRole('button', { name: 'Remove Movie 6 from wishlist' })[0]!);
    expect(await screen.findByText('Your wishlist is empty')).toBeOnTheScreen();
  });

  it('a loading failure shows an error and "Try again" recovers', async () => {
    let fail = true;
    mockApi((u, i) => (u.pathname === '/api/wishlist' && (i?.method ?? 'GET') === 'GET' && fail ? apiError('INTERNAL', 'oops', true, 500) : undefined));
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(screen.getByText('Wishlist'));
    expect(await screen.findByText('oops')).toBeOnTheScreen();
    fail = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your wishlist is empty')).toBeOnTheScreen();
  });
});
