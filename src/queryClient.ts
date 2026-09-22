import { QueryClient } from '@tanstack/react-query';

const MIN = 60_000;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Matches the backend's list cache TTL; screens stay mounted, so this mostly prevents needless refetches on refocus.
        staleTime: 10 * MIN,
        gcTime: 60 * MIN,
        refetchOnWindowFocus: false,
        // Only transient failures are worth another try; the backend has already retried upstream.
        retry: (count, err) => (err as { retryable?: boolean })?.retryable === true && count < 1,
      },
    },
  });

export const queryClient = createQueryClient();
