import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavLink, Link, Outlet, RouterProvider, ScrollRestoration, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ApiError } from './api/client';
import { ToastProvider } from './components/Toast';
import { EmptyState } from './components/States';
import { useWishlist } from './hooks/useWishlist';
import { getHomeSearch } from './lib/homeState';
import { HomePage } from './pages/HomePage';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { WishlistPage } from './pages/WishlistPage';

const MIN = 60_000;
export const createAppQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Long staleTime/gcTime is what makes "go to a movie and come back" instant: the loaded pages of
        // the infinite list are still in memory, so the scroll position can be restored against real content.
        staleTime: 10 * MIN, // matches the backend's discover cache TTL
        gcTime: 60 * MIN,
        refetchOnWindowFocus: false,
        // Only transient failures are worth another try; the backend has already retried upstream.
        retry: (count, err) => err instanceof ApiError && err.retryable && count < 1,
      },
    },
  });
const queryClient = createAppQueryClient();

function Header() {
  const { items } = useWishlist();
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand">
          🎬 Trackzio
        </Link>
        <nav>
          {/* Return to the filters you had, not a blank home page. */}
          <NavLink to={`/${getHomeSearch()}`} end>
            Discover
          </NavLink>
          <NavLink to="/wishlist">
            Wishlist{items.length > 0 && <span className="badge">{items.length}</span>}
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function Root() {
  return (
    <ToastProvider>
      <Header />
      <main className="container">
        <Outlet />
      </main>
      {/*
        Scroll is remembered per key. History entries (detail pages etc.) use their own location key; every
        Discover view is keyed by its filters. So: back from a movie -> same list, same scroll. Changing a
        filter -> new key -> top of the new list. Returning via the header tab -> the scroll you left at.
      */}
      <ScrollRestoration getKey={(loc) => (loc.pathname === '/' ? `home:${loc.search}` : loc.key)} />
    </ToastProvider>
  );
}

/** Exported so tests can mount the exact same route tree in a memory router. */
export const appRoutes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'movie/:id', element: <MovieDetailPage /> },
      { path: 'wishlist', element: <WishlistPage /> },
      {
        path: '*',
        element: (
          <EmptyState title="Page not found" action={<Link className="btn primary" to="/">Back to Discover</Link>}>
            That page does not exist.
          </EmptyState>
        ),
      },
    ],
  },
];
const router = createBrowserRouter(appRoutes);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
