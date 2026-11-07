import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: { withCredentials: boolean; disconnected: boolean }[] = [];
vi.mock('socket.io-client', () => ({
  io: (_url: string, opts: { withCredentials?: boolean }) => {
    const s = { withCredentials: !!opts.withCredentials, disconnected: false };
    created.push(s as never);
    return {
      on: vi.fn(),
      connected: false,
      disconnect: () => {
        s.disconnected = true;
      },
    };
  },
}));

import { getSocket } from './socket';
import { useAuth } from '../store/auth';
import { fakeJwt } from '../test-utils';

describe('socket identity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}));
    useAuth.getState().logout();
    created.length = 0;
  });

  it('reuses the socket while the login is unchanged', () => {
    useAuth.getState().setToken(fakeJwt(3600));
    expect(getSocket()).toBe(getSocket());
    expect(created).toHaveLength(1);
  });

  it('drops the old socket and connects again after login as someone else', () => {
    useAuth.getState().setToken(fakeJwt(3600));
    const a = getSocket();
    useAuth.getState().setToken(fakeJwt(7200)); // e.g. log out, then log in as B without a reload
    const b = getSocket();
    expect(b).not.toBe(a);
    expect(created[0].disconnected).toBe(true);
    expect(created[1].withCredentials).toBe(true); // the session cookie goes with the handshake
  });

  it('drops the socket on logout', () => {
    useAuth.getState().setToken(fakeJwt(3600));
    getSocket();
    useAuth.getState().logout();
    expect(created[0].disconnected).toBe(true);
    getSocket();
    expect(created).toHaveLength(2);
  });
});
