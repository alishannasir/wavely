import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';
import { useAuth, User } from '../store/auth';

const user = (id: string): User => ({ id, email: `${id}@x.co`, currentStreak: 0, trialEndsAt: new Date().toISOString(), creditCents: 0 });

describe('cached data does not outlive the account', () => {
  beforeEach(() => {
    useAuth.getState().logout();
    queryClient.clear();
  });

  it('is forgotten when someone else signs in on the same browser', () => {
    useAuth.getState().setUser(user('a'));
    queryClient.setQueryData(['friends'], [{ userId: 'secret-friend' }]);
    useAuth.getState().setUser(user('b'));
    expect(queryClient.getQueryData(['friends'])).toBeUndefined();
  });

  it('is forgotten on logout', () => {
    useAuth.getState().setUser(user('a'));
    queryClient.setQueryData(['billing-status'], { plan: 'MONTHLY' });
    useAuth.getState().logout();
    expect(queryClient.getQueryData(['billing-status'])).toBeUndefined();
  });

  it('is kept while the same user stays signed in (a profile refresh must not wipe the cache)', () => {
    useAuth.getState().setUser(user('a'));
    queryClient.setQueryData(['friends'], [1]);
    useAuth.getState().setUser({ ...user('a'), displayName: 'New name' });
    expect(queryClient.getQueryData(['friends'])).toEqual([1]);
  });
});
