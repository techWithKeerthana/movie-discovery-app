import type { ApiErrorBody, ErrorCode } from '@trackzio/shared';
import { getDeviceId } from '../lib/deviceId';

/**
 * Backend address, read at bundle time. Expo only inlines STATIC dot-notation access to EXPO_PUBLIC_* variables, so this
 * must stay exactly `process.env.EXPO_PUBLIC_API_URL` (no destructuring, no bracket access, no helper taking the name).
 */
const raw = process.env.EXPO_PUBLIC_API_URL;
export const API_URL = (raw ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly retryable: boolean,
    /** TEMP DEBUG: HTTP status (absent when no response arrived), the URL called, and the raw failure text. */
    readonly debug?: { status?: number; url: string; raw?: string },
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
  const deviceId = await getDeviceId();
  const url = `${API_URL}/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        'X-Device-Id': deviceId,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e; // superseded request: TanStack Query treats it as cancelled
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection.', true, { url, raw: (e as Error).message });
  }

  if (!res.ok) {
    let err: ApiErrorBody['error'] | undefined;
    try {
      err = ((await res.json()) as ApiErrorBody).error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(err?.code ?? 'INTERNAL', err?.message ?? `Request failed (${res.status})`, err?.retryable ?? res.status >= 500, {
      status: res.status,
      url,
    });
  }

  const stale = res.headers.get('X-Cache') === 'stale';
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  return { data, stale };
}
