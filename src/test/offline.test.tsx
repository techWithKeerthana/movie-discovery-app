import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetDeviceIdCache } from '../lib/deviceId';
import { apiError, mockApi, renderApp } from './helpers';

const loaded = () => screen.findByText('Movie 1');
const add = (n: number) => screen.getByRole('button', { name: `Add Movie ${n} to wishlist` });
const goOnline = () => (NetInfo.useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });
const goOffline = () => (NetInfo.useNetInfo as jest.Mock).mockReturnValue({ isConnected: false, isInternetReachable: false });

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDeviceIdCache();
  goOnline();
});

describe('Offline banner', () => {
  it('appears the moment connectivity drops and disappears again once it returns', async () => {
    mockApi();
    const { settle } = await renderApp();
    await loaded();
    expect(screen.queryByTestId('offline-banner')).not.toBeOnTheScreen();

    goOffline();
    await waitFor(() => {
      settle();
      expect(screen.getByText("You're offline — showing cached results")).toBeOnTheScreen();
    });

    goOnline();
    await waitFor(
      () => {
        settle();
        expect(screen.queryByTestId('offline-banner')).not.toBeOnTheScreen();
      },
      { timeout: 2000 },
    );
  });
});

describe('Wishlist offline', () => {
  it('a movie added while online is still readable from the wishlist tab after going offline (cached, not an error)', async () => {
    mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(add(1));
    await user.press(screen.getByText('Wishlist'));
    expect(await screen.findByText('1 saved')).toBeOnTheScreen();

    mockApi((u, i) => (u.pathname === '/api/wishlist' && (i?.method ?? 'GET') === 'GET' ? Promise.reject(new TypeError('Network request failed')) : undefined));
    // Pull-to-refresh forces a REAL new fetch attempt (bottom tabs never unmount, so simply switching tabs would
    // just show React Query's existing in-memory data and prove nothing). This is what proves the fallback is
    // the AsyncStorage-backed cache written on the earlier successful fetch, not just leftover in-memory state.
    fireEvent(screen.getByTestId('wishlist-list'), 'refresh');
    await waitFor(() => expect(screen.getByText('1 saved')).toBeOnTheScreen());
  });

  it('adding while offline updates the UI instantly, shows "Will sync when online", and does not roll back', async () => {
    mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' ? Promise.reject(new TypeError('Network request failed')) : undefined));
    goOffline();
    await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));

    expect(screen.getByRole('button', { name: 'Remove Movie 1 from wishlist' })).toBeSelected();
    expect(await screen.findByText('Will sync when online.')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Movie 1 from wishlist' })).toBeSelected());
  });

  it('a queued offline add is sent to the server as soon as connectivity returns', async () => {
    let online = false;
    const api = mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' && !online ? Promise.reject(new TypeError('Network request failed')) : undefined));
    goOffline();
    const { settle } = await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    await screen.findByText('Will sync when online.');
    expect(api.wishlists.size).toBe(0); // nothing reached the server yet

    online = true;
    goOnline();
    await waitFor(() => {
      settle();
      expect([...api.wishlists.values()].flat()).toHaveLength(1);
    });
  });

  it('a real (non-network) failure while online still rolls back and shows the normal error, not the offline note', async () => {
    mockApi((u, i) => (u.pathname === '/api/wishlist/1' && i?.method === 'PUT' ? apiError('INTERNAL', 'db down', false, 500) : undefined));
    await renderApp();
    await loaded();
    await userEvent.setup().press(add(1));
    expect(await screen.findByText('Could not add to your wishlist. Please try again.')).toBeOnTheScreen();
    expect(screen.queryByText('Will sync when online.')).not.toBeOnTheScreen();
    await waitFor(() => expect(add(1)).not.toBeSelected());
  });
});
