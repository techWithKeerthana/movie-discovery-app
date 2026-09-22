import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetDeviceIdCache } from '../lib/deviceId';
import { mockApi, renderApp } from './helpers';

const loaded = () => screen.findByText('Movie 1');
const card = (n: number) => screen.getByRole('button', { name: new RegExp(`^Movie ${n}, `) });

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDeviceIdCache();
});

describe('Recently viewed', () => {
  it('is hidden until a movie has actually been opened', async () => {
    mockApi();
    await renderApp();
    await loaded();
    expect(screen.queryByText('Recently viewed')).not.toBeOnTheScreen();
  });

  it('records a movie once its detail loads, shows it back on Discover, and tapping it reopens the same movie', async () => {
    mockApi();
    const { navRef } = await renderApp();
    await loaded();
    const user = userEvent.setup();

    await user.press(card(3));
    await screen.findByRole('header', { name: 'Movie 3' });
    await act(async () => navRef.goBack());
    await waitFor(() => expect(navRef.getCurrentRoute()?.name).toBe('Discover'));

    expect(await screen.findByText('Recently viewed')).toBeOnTheScreen();
    const recent = screen.getByRole('button', { name: 'Movie 3, recently viewed' });
    expect(recent).toBeOnTheScreen();

    await user.press(recent);
    expect(await screen.findByRole('header', { name: 'Movie 3' })).toBeOnTheScreen();
  });

  it('survives an app restart (AsyncStorage) and caps at 8, most recent first', async () => {
    mockApi();
    const first = await renderApp();
    await loaded();
    const user = userEvent.setup();
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      await user.press(card(id));
      await screen.findByRole('header', { name: `Movie ${id}` });
      await act(async () => first.navRef.goBack());
      await waitFor(() => expect(first.navRef.getCurrentRoute()?.name).toBe('Discover'));
    }
    await first.unmount();
    resetDeviceIdCache();

    await renderApp();
    await loaded();
    await screen.findByText('Recently viewed');
    // 9 opened, capped at 8, most-recently-opened (9) first — id 1 fell off.
    expect(screen.getByRole('button', { name: 'Movie 9, recently viewed' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Movie 1, recently viewed' })).not.toBeOnTheScreen();
  });
});
