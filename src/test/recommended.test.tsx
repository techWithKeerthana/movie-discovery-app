import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { jsonRes, mockApi, renderApp, summary } from './helpers';

const loaded = () => screen.findByText('Movie 1');
const add = (n: number) => screen.getByRole('button', { name: `Add Movie ${n} to wishlist` });
const saved = (n: number) => screen.getByRole('button', { name: `Remove Movie ${n} from wishlist` });
const rowHeading = () => screen.queryByText('Because you liked...');

describe('Discover: "Because you liked..." recommendations', () => {
  it('is not shown with fewer than 2 wishlisted movies', async () => {
    mockApi();
    await renderApp();
    await loaded();
    expect(rowHeading()).not.toBeOnTheScreen();
    await userEvent.setup().press(add(1));
    await waitFor(() => expect(saved(1)).toBeSelected());
    expect(rowHeading()).not.toBeOnTheScreen(); // still only 1 saved
  });

  it('shows once 2 movies are saved, requesting the shared genre and excluding what is already saved', async () => {
    let seenQuery: URLSearchParams | undefined;
    const api = mockApi((u) => {
      if (u.pathname === '/api/movies/recommended') {
        seenQuery = u.searchParams;
        return jsonRes([summary(50, { title: 'Suggested Movie' })]);
      }
      return undefined;
    });
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(add(1));
    await waitFor(() => expect(saved(1)).toBeSelected());
    await user.press(add(2));
    await waitFor(() => expect(saved(2)).toBeSelected());

    expect(await screen.findByText('Suggested Movie')).toBeOnTheScreen();
    expect(rowHeading()).toBeOnTheScreen();
    expect(seenQuery?.get('genreId')).toBe('18'); // both Movie 1 and Movie 2 default to genre 18 (Drama)
    const excluded = (seenQuery?.get('excludeIds') ?? '').split(',').map(Number).sort((a, b) => a - b);
    expect(excluded).toEqual([1, 2]);
    expect(api.calls.some((c) => c.url.pathname === '/api/movies/recommended')).toBe(true);
  });

  it('stays hidden when the backend has nothing to recommend', async () => {
    mockApi((u) => (u.pathname === '/api/movies/recommended' ? jsonRes([]) : undefined));
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(add(1));
    await waitFor(() => expect(saved(1)).toBeSelected());
    await user.press(add(2));
    await waitFor(() => expect(saved(2)).toBeSelected());
    expect(rowHeading()).not.toBeOnTheScreen();
  });
});
