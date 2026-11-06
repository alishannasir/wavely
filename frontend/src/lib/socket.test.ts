import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: { token: string | null; disconnected: boolean }[] = [];
vi.mock('socket.io-client', () => ({
  io: (_url: string, opts: { auth: { token: string | null } }) => {
    const s = { token: opts.auth.token, disconnected: false };
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

describe('socket identity', () => {
  beforeEach(() => {
    useAuth.getState().logout();
    created.length = 0;
  });

  it('reuses the socket while the token is unchanged', () => {
    useAuth.getState().setToken('token-a');
    expect(getSocket()).toBe(getSocket());
    expect(created).toHaveLength(1);
  });

  it('drops the old socket and uses the new token after login as someone else', () => {
    useAuth.getState().setToken('token-a');
    const a = getSocket();
    useAuth.getState().setToken('token-b'); // e.g. log out, then log in as B without a reload
    const b = getSocket();
    expect(b).not.toBe(a);
    expect(created[0].disconnected).toBe(true);
    expect(created[1].token).toBe('token-b');
  });

  it('drops the socket on logout', () => {
    useAuth.getState().setToken('token-a');
    getSocket();
    useAuth.getState().logout();
    expect(created[0].disconnected).toBe(true);
    getSocket();
    expect(created[1].token).toBeNull();
  });
});
