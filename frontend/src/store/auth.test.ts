import { describe, expect, it } from 'vitest';
import { useAuth } from './auth';

describe('auth store', () => {
  it('logout clears token and user', () => {
    useAuth.getState().setToken('t');
    useAuth.getState().logout();
    expect(useAuth.getState().token).toBeNull();
    expect(useAuth.getState().user).toBeNull();
  });
});
