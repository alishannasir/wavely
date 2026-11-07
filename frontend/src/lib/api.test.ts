import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { useAuth } from '../store/auth';
import { fakeJwt } from '../test-utils';

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body }));
}

describe('api() and 401 responses', () => {
  const assign = vi.fn();
  beforeEach(() => {
    assign.mockClear();
    vi.stubGlobal('window', { location: { assign } });
    useAuth.getState().setToken(fakeJwt());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuth.getState().logout();
  });

  it('a wrong password (401 with its own message) is shown, and does not sign the user out', async () => {
    respond(401, { statusCode: 401, message: 'Your password is not correct' });
    await expect(api('/users/me/delete', { method: 'POST' })).rejects.toThrow('Your password is not correct');
    expect(useAuth.getState().sessionExpiresAt).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('a dead session (plain Unauthorized, or a revoked token) signs the user out and goes home', async () => {
    respond(401, { statusCode: 401, message: 'Unauthorized' });
    await expect(api('/users/me')).rejects.toThrow('Session expired');
    expect(useAuth.getState().sessionExpiresAt).toBeNull();
    expect(assign).toHaveBeenCalledWith('/');

    useAuth.getState().setToken(fakeJwt());
    respond(401, { statusCode: 401, message: 'Your session has ended. Please sign in again.' });
    await expect(api('/users/me')).rejects.toThrow('Session expired');
    expect(useAuth.getState().sessionExpiresAt).toBeNull();
  });

  it('sends the session cookie and never an Authorization header', async () => {
    respond(200, {});
    await api('/users/me');
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('login and appeal screens are never treated as expired sessions', async () => {
    respond(401, { statusCode: 401, message: 'Unauthorized' });
    await expect(api('/auth/login', { method: 'POST' })).rejects.toThrow('Unauthorized');
    expect(useAuth.getState().sessionExpiresAt).not.toBeNull();
  });
});
