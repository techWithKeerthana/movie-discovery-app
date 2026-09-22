import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { ApiError } from '../api/client';
import { useSlowHint } from '../components/States';
import { computeLayout, GAP, H_PADDING } from '../hooks/useColumns';
import { getDeviceId, resetDeviceIdCache } from '../lib/deviceId';
import { jsonRes } from './helpers';

describe('computeLayout (responsive grid)', () => {
  it.each([
    [320, 2],
    [360, 2],
    [390, 2],
    [430, 2],
    [600, 3],
    [768, 4],
    [1024, 6],
    [1600, 6],
  ])('%ipx wide -> %i columns', (width, columns) => {
    expect(computeLayout(width).columns).toBe(columns);
  });

  it.each([280, 320, 360, 393, 412, 600, 768, 834, 1024, 1366])('at %ipx cards fill the row with no overflow and at most %i px slack', (width) => {
    const { columns, cardWidth } = computeLayout(width);
    const inner = width - 2 * H_PADDING;
    const used = columns * cardWidth + GAP * (columns - 1);
    expect(used).toBeLessThanOrEqual(inner); // never overflows the screen
    expect(inner - used).toBeLessThan(columns); // rounding slack is under 1px per card
    expect(cardWidth).toBeGreaterThan(100); // posters stay tappable/legible even on tiny screens
  });
});

describe('device id', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetDeviceIdCache();
  });

  it('creates a v4-shaped id once, stores it, and returns the same one after a restart', async () => {
    const first = await getDeviceId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await AsyncStorage.getItem('trackzio.deviceId')).toBe(first);
    resetDeviceIdCache();
    expect(await getDeviceId()).toBe(first);
  });

  it('concurrent first calls share one id (no race creating two identities)', async () => {
    const [a, b, c] = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()]);
    expect(new Set([a, b, c]).size).toBe(1);
  });

  it('still works with a per-session id when storage is unavailable', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'));
    const id = await getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getDeviceId()).toBe(id); // memoised for the session
  });
});

describe('api client', () => {
  const load = (env?: string) => {
    let mod!: typeof import('../api/client');
    jest.isolateModules(() => {
      if (env === undefined) delete process.env.EXPO_PUBLIC_API_URL;
      else process.env.EXPO_PUBLIC_API_URL = env;
      mod = require('../api/client');
    });
    return mod;
  };
  const stubFetch = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
    const fn = jest.fn(async (u: RequestInfo | URL, i?: RequestInit) => impl(String(u), i));
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  it('takes the backend address from EXPO_PUBLIC_API_URL and ignores a trailing slash', async () => {
    const { api, API_URL } = load('https://api.example.com/');
    expect(API_URL).toBe('https://api.example.com');
    const fn = stubFetch(() => jsonRes({ ok: 1 }));
    await api('/genres');
    expect(fn.mock.calls[0]![0]).toBe('https://api.example.com/api/genres');
  });

  it('falls back to localhost:4000 when the variable is not set', () => {
    expect(load().API_URL).toBe('http://localhost:4000');
  });

  it('sends the device id header, JSON bodies and the request signal; reads the stale flag', async () => {
    const { api } = load('http://x');
    const fn = stubFetch(() => jsonRes({ v: 1 }, 200, { 'X-Cache': 'stale' }));
    const ctl = new AbortController();
    const r = await api<{ v: number }>('/wishlist/1', { method: 'PUT', body: { id: 1 }, signal: ctl.signal });
    const init = fn.mock.calls[0]![1] as RequestInit;
    expect(r).toEqual({ data: { v: 1 }, stale: true });
    expect(init.method).toBe('PUT');
    expect(init.signal).toBe(ctl.signal);
    expect((init.headers as Record<string, string>)['X-Device-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"id":1}');
  });

  it('maps the backend error contract onto ApiError', async () => {
    const { api } = load('http://x');
    stubFetch(() => jsonRes({ error: { code: 'UPSTREAM_TIMEOUT', message: 'slow', retryable: true } }, 504));
    await expect(api('/movies')).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT', message: 'slow', retryable: true });
  });

  it('survives a non-JSON error page (a proxy or captive portal): retryable for 5xx, not for 4xx', async () => {
    const { api } = load('http://x');
    stubFetch(() => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(api('/movies')).rejects.toMatchObject({ retryable: true });
    stubFetch(() => new Response('nope', { status: 400 }));
    await expect(api('/movies')).rejects.toMatchObject({ retryable: false });
  });

  it('turns a network failure into a friendly retryable ApiError, but lets an abort through untouched', async () => {
    const { api, ApiError: Err } = load('http://x');
    stubFetch(() => {
      throw new TypeError('Network request failed');
    });
    const e = await api('/movies').catch((x) => x);
    expect(e).toBeInstanceOf(Err);
    expect(e).toMatchObject({ code: 'NETWORK', retryable: true });
    stubFetch(() => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(api('/movies')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns undefined data for a 204 (wishlist removal)', async () => {
    const { api } = load('http://x');
    stubFetch(() => jsonRes(null, 204));
    await expect(api('/wishlist/1', { method: 'DELETE' })).resolves.toEqual({ data: undefined, stale: false });
  });

  it('ApiError carries the fields the UI branches on', () => {
    const e = new ApiError('NOT_FOUND', 'x', false);
    expect(e).toMatchObject({ code: 'NOT_FOUND', retryable: false });
  });
});

describe('useSlowHint', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('turns on only after the wait has been continuously active for 8s (not on a normal load), and resets when it stops', async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useSlowHint(active), { initialProps: { active: true } });
    expect(result.current).toBe(false);
    await act(async () => jest.advanceTimersByTime(7900));
    expect(result.current).toBe(false);
    await act(async () => jest.advanceTimersByTime(200));
    expect(result.current).toBe(true);
    await rerender({ active: false });
    expect(result.current).toBe(false);
  });
});
