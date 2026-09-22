import { beforeEach, describe, expect, it, vi } from 'vitest';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Fresh module per test: getDeviceId memoises at module level, exactly like a fresh page load.
const load = async () => (await import('../lib/deviceId')).getDeviceId;

beforeEach(() => vi.resetModules());

describe('getDeviceId', () => {
  it('creates a valid v4 UUID once and persists it, so a reload keeps the same wishlist', async () => {
    const first = (await load())();
    expect(first).toMatch(UUID);
    expect(localStorage.getItem('trackzio.deviceId')).toBe(first);
    vi.resetModules(); // simulate closing and reopening the app
    expect((await load())()).toBe(first);
  });

  it('is stable within a page load', async () => {
    const get = await load();
    expect(get()).toBe(get());
  });

  it('still works (per-session id) when storage is blocked, e.g. private mode', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const get = await load();
    expect(get()).toMatch(UUID);
    expect(get()).toBe(get());
  });

  it('falls back to getRandomValues when crypto.randomUUID is unavailable (plain-http LAN access)', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect((await load())()).toMatch(UUID);
  });
});
