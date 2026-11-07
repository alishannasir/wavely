import { describe, expect, it } from 'vitest';
import { isSessionExpired, tokenExpiry, useAuth } from './auth';
import { fakeJwt } from '../test-utils';

describe('auth store', () => {
  it('logout clears the session and user', () => {
    useAuth.getState().setToken(fakeJwt());
    useAuth.getState().logout();
    expect(useAuth.getState().sessionExpiresAt).toBeNull();
    expect(useAuth.getState().user).toBeNull();
  });

  it('keeps only the expiry of a token, never the token', () => {
    useAuth.getState().setToken(fakeJwt(600));
    const state = useAuth.getState() as unknown as Record<string, unknown>;
    expect(state.token).toBeUndefined();
    expect(isSessionExpired(useAuth.getState().sessionExpiresAt)).toBe(false);
  });

  it('knows when a session has run out', () => {
    expect(isSessionExpired(null)).toBe(true);
    expect(isSessionExpired(tokenExpiry(fakeJwt(-10)))).toBe(true);
    expect(tokenExpiry(null)).toBeNull();
  });
});
