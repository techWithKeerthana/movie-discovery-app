import type { ApiErrorBody, ErrorCode } from '@trackzio/shared';
import { getDeviceId } from '../lib/deviceId';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ApiResult<T> {
  data: T;
  /** Backend answered from saved data because the movie service was unavailable. */
  stale: boolean;
}

interface Options {
  method?: 'GET' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** Typed fetch wrapper. Every failure becomes an ApiError with a `retryable` flag the UI can act on. */
export async function api<T>(path: string, { method = 'GET', body, signal }: Options = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      headers: {
        'X-Device-Id': getDeviceId(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e; // superseded request: let TanStack Query treat it as cancelled
    throw new ApiError('NETWORK', "Can't reach the server. Check your connection.", true);
  }

  if (!res.ok) {
    let err: ApiErrorBody['error'] | undefined;
    try {
      err = ((await res.json()) as ApiErrorBody).error;
    } catch {
      /* non-JSON error page (proxy down, etc.) */
    }
    throw new ApiError(err?.code ?? 'INTERNAL', err?.message ?? `Request failed (${res.status})`, err?.retryable ?? res.status >= 500);
  }

  const stale = res.headers.get('X-Cache') === 'stale';
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { data, stale };
}
