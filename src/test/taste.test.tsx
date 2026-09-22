import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { detailOf, jsonRes, mockApi, renderApp } from './helpers';

const loaded = () => screen.findByText('Movie 1');
const add = (n: number) => screen.getByRole('button', { name: `Add Movie ${n} to wishlist` });
const saved = (n: number) => screen.getByRole('button', { name: `Remove Movie ${n} from wishlist` });

async function openTaste() {
  const user = userEvent.setup();
  await user.press(screen.getByText('Wishlist'));
  await user.press(screen.getByRole('button', { name: 'Your Taste' }));
}

describe('Your Taste profile', () => {
  it('shows zero stats and a note when nothing is saved or viewed yet', async () => {
    mockApi();
    await renderApp();
    await loaded();
    await openTaste();
    expect(screen.getByLabelText('Movies watched: 0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Movies saved: 0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Avg rating: —')).toBeOnTheScreen();
    expect(screen.getByText('Save a few movies to see your favorite genres here.')).toBeOnTheScreen();
  });

  it('counts saved movies, averages their rating, and breaks down favorite genres', async () => {
    mockApi();
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(add(1));
    await waitFor(() => expect(saved(1)).toBeSelected());
    await user.press(add(2));
    await waitFor(() => expect(saved(2)).toBeSelected());

    await openTaste();
    expect(screen.getByLabelText('Movies saved: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Avg rating: ★ 7.5')).toBeOnTheScreen(); // both default to rating 7.5
    expect(screen.getByLabelText('Drama: 2 saved')).toBeOnTheScreen(); // both default to genre 18
  });

  it('counts a movie once its detail has actually loaded', async () => {
    mockApi((u) => (u.pathname === '/api/movies/7' ? jsonRes(detailOf(7)) : undefined));
    const { navRef } = await renderApp();
    await loaded();
    await act(async () => navRef.navigate('MovieDetail', { id: 7 }));
    await screen.findByRole('header', { name: 'Movie 7' });
    await act(async () => navRef.goBack());
    await loaded();
    await openTaste();
    expect(screen.getByLabelText('Movies watched: 1')).toBeOnTheScreen();
  });
});
