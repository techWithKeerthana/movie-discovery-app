import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * jsdom ships its own AbortSignal, which Node's built-in Request (used internally by React Router's data
 * router for every navigation) rejects. Without this shim navigations silently fail in tests only.
 */
const NodeRequest = globalThis.Request;
class SafeRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    // Navigation cancellation is irrelevant in unit tests, so the signal is simply dropped.
    if (init && 'signal' in init) {
      const { signal: _ignored, ...rest } = init;
      super(input, rest);
    } else super(input, init);
  }
}
Object.defineProperty(globalThis, 'Request', { value: SafeRequest, configurable: true, writable: true });

/** Test doubles for browser APIs jsdom does not implement. */
export const io = {
  callbacks: [] as IntersectionObserverCallback[],
  /** Simulate the sentinel scrolling into view for every live observer. */
  trigger() {
    for (const cb of this.callbacks) cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  },
};

beforeEach(() => {
  io.callbacks = [];
  class FakeIO {
    constructor(private cb: IntersectionObserverCallback) {
      io.callbacks.push(cb);
    }
    observe() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    disconnect() {
      io.callbacks = io.callbacks.filter((c) => c !== this.cb); // only live observers fire in trigger()
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO);
  window.scrollTo = vi.fn() as never;
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
