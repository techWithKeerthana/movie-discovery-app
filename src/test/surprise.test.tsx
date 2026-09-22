import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { apiError, deferred, detailOf, jsonRes, mockApi, renderApp, summary } from './helpers';

const loaded = () => screen.findByText('Movie 1');
const surpriseBtn = () => screen.getByRole('button', { name: 'Surprise me with a random movie' });

describe('Discover: Surprise Me', () => {
  it('navigates straight to the returned movie\'s detail screen', async () => {
    mockApi((u) => {
      if (u.pathname === '/api/movies/surprise') return jsonRes(summary(42, { title: 'The Answer' }));
      if (u.pathname === '/api/movies/42') return jsonRes(detailOf(42, { title: 'The Answer' }));
      return undefined;
    });
    await renderApp();
    await loaded();
    await userEvent.setup().press(surpriseBtn());
    expect(await screen.findByText('The Answer')).toBeOnTheScreen(); // native-stack header title
  });

  it('shows a spinner on the button while the request is in flight', async () => {
    const gate = deferred<Response>();
    mockApi((u) => (u.pathname === '/api/movies/surprise' ? gate.promise : undefined));
    await renderApp();
    await loaded();
    const user = userEvent.setup();
    await user.press(surpriseBtn());
    expect(await screen.findByTestId('surprise-spinner')).toBeOnTheScreen();
    gate.resolve(jsonRes(summary(7)));
    await waitFor(() => expect(screen.queryByTestId('surprise-spinner')).not.toBeOnTheScreen());
  });

  it('shows a toast and stays on Discover when the request fails', async () => {
    mockApi((u) => (u.pathname === '/api/movies/surprise' ? apiError('UPSTREAM_UNAVAILABLE', 'down', true) : undefined));
    await renderApp();
    await loaded();
    await userEvent.setup().press(surpriseBtn());
    expect(await screen.findByText("Couldn't find a movie, try again")).toBeOnTheScreen();
    expect(screen.getByText('Discover movies')).toBeOnTheScreen(); // still on Discover, no navigation happened
  });
});
