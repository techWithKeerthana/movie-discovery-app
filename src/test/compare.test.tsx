import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { detailOf, jsonRes, mockApi, renderApp } from './helpers';

async function openDetail(navRef: Awaited<ReturnType<typeof renderApp>>['navRef'], id: number) {
  await act(async () => navRef.navigate('MovieDetail', { id }));
  await screen.findByRole('header', { name: `Movie ${id}` });
}

describe('Movie comparison', () => {
  it('picking one movie shows a persistent banner naming it, with a cancel option', async () => {
    mockApi((u) => (u.pathname === '/api/movies/7' ? jsonRes(detailOf(7)) : undefined));
    const { navRef } = await renderApp();
    await screen.findByText('Movie 1');
    await openDetail(navRef, 7);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Compare Movie 7' }));
    expect(await screen.findByTestId('compare-banner')).toBeOnTheScreen();
    expect(screen.getByText(/Comparing: Movie 7 — tap another movie to compare/)).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Cancel comparison' }));
    expect(screen.queryByTestId('compare-banner')).not.toBeOnTheScreen();
  });

  it('tapping the same movie again cancels the pick instead of comparing it with itself', async () => {
    mockApi((u) => (u.pathname === '/api/movies/7' ? jsonRes(detailOf(7)) : undefined));
    const { navRef } = await renderApp();
    await screen.findByText('Movie 1');
    await openDetail(navRef, 7);

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Compare Movie 7' }));
    expect(await screen.findByTestId('compare-banner')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel comparing Movie 7' }));
    expect(screen.queryByTestId('compare-banner')).not.toBeOnTheScreen();
  });

  it('picking a second, different movie opens the comparison screen with both movies side by side', async () => {
    mockApi((u) => {
      if (u.pathname === '/api/movies/7') return jsonRes(detailOf(7, { rating: 8, year: 1999, runtimeMinutes: 120, genres: [{ id: 1, name: 'Action' }] }));
      if (u.pathname === '/api/movies/9') return jsonRes(detailOf(9, { rating: 6, year: 2010, runtimeMinutes: 95, genres: [{ id: 2, name: 'Comedy' }] }));
      return undefined;
    });
    const { navRef } = await renderApp();
    await screen.findByText('Movie 1');
    await openDetail(navRef, 7);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Compare Movie 7' }));
    expect(await screen.findByTestId('compare-banner')).toBeOnTheScreen();

    await act(async () => navRef.goBack());
    await screen.findByText('Movie 1');
    await openDetail(navRef, 9);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Compare Movie 9' }));

    expect(await screen.findByLabelText('Rating: ★ 8.0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rating: ★ 6.0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Release year: 1999')).toBeOnTheScreen();
    expect(screen.getByLabelText('Release year: 2010')).toBeOnTheScreen();
    expect(screen.getByLabelText('Runtime: 2h 0m')).toBeOnTheScreen();
    expect(screen.getByLabelText('Runtime: 1h 35m')).toBeOnTheScreen();
    expect(screen.getByLabelText('Genres: Action')).toBeOnTheScreen();
    expect(screen.getByLabelText('Genres: Comedy')).toBeOnTheScreen();
    expect(screen.queryByTestId('compare-banner')).not.toBeOnTheScreen(); // the pair is complete
  });
});
