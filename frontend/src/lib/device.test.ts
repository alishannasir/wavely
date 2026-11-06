import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDeviceIdForTests, getDeviceId } from './device';

const idRe = /^[A-Za-z0-9-]{16,64}$/; // the server's DEVICE_ID_RE

describe('getDeviceId', () => {
  beforeEach(() => _resetDeviceIdForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists one id per browser', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const a = getDeviceId();
    expect(getDeviceId()).toBe(a);
    expect(a).toMatch(idRe);
  });

  it('falls back to a random per-session id (never a shared constant) when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const a = getDeviceId();
    expect(a).toMatch(idRe);
    expect(getDeviceId()).toBe(a); // stable within the page load
    _resetDeviceIdForTests(); // a different browser / page load
    expect(getDeviceId()).not.toBe(a);
  });

  it('works without crypto.randomUUID (non-secure contexts)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    expect(getDeviceId()).toMatch(idRe);
  });
});
