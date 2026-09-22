const KEY = 'trackzio.deviceId';
let memo: string | null = null;

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID(); // secure contexts only
  const b = crypto.getRandomValues(new Uint8Array(16)); // works on plain-http LAN too
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Anonymous identity that owns this browser's wishlist on the server. Generated once, kept in
 * localStorage. If storage is blocked (private mode) we fall back to a per-tab id so the app
 * still works, just without surviving a reload.
 */
export function getDeviceId(): string {
  if (memo) return memo;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return (memo = saved);
    memo = uuid();
    localStorage.setItem(KEY, memo);
  } catch {
    memo ??= uuid();
  }
  return memo;
}
