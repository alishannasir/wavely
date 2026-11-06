import { computeCallDeadline } from './call-limits';
import { MAX_CALL_SECONDS, tokenTtlSeconds } from './livekit.service';

describe('computeCallDeadline', () => {
  it('is null when nobody is capped', () => {
    expect(computeCallDeadline({ userId: 'a', remainingMs: null }, { userId: 'b', remainingMs: null }, 1000)).toBeNull();
  });
  it('uses the only capped user', () => {
    expect(computeCallDeadline({ userId: 'a', remainingMs: null }, { userId: 'b', remainingMs: 60_000 }, 1000)).toEqual({
      atMs: 61_000,
      limitedUserId: 'b',
    });
  });
  it('uses whoever runs out first', () => {
    expect(computeCallDeadline({ userId: 'a', remainingMs: 120_000 }, { userId: 'b', remainingMs: 30_000 }, 0)).toEqual({
      atMs: 30_000,
      limitedUserId: 'b',
    });
  });
});

describe('tokenTtlSeconds', () => {
  it('is 2h when uncapped', () => expect(tokenTtlSeconds(null)).toBe(MAX_CALL_SECONDS));
  it('follows the remaining time, within 60s..2h', () => {
    expect(tokenTtlSeconds(10 * 60_000)).toBe(600);
    expect(tokenTtlSeconds(5_000)).toBe(60);
    expect(tokenTtlSeconds(10 * 3600_000)).toBe(MAX_CALL_SECONDS);
  });
});
