import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller';

const make = (db: () => Promise<unknown>, cache: () => Promise<unknown>) =>
  new HealthController({ $queryRaw: db } as any, { ping: cache } as any);

describe('HealthController', () => {
  it('is ok when Postgres and Redis answer', async () => {
    await expect(make(async () => 1, async () => 'PONG').check()).resolves.toEqual({ status: 'ok', db: 'up', redis: 'up' });
  });
  it('returns 503 with details when one dependency is down', async () => {
    const err = await make(async () => { throw new Error('db down'); }, async () => 'PONG').check().catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(err.getResponse()).toMatchObject({ status: 'degraded', db: 'down', redis: 'up' });
  });
  it('does not hang when a dependency never answers', async () => {
    jest.useFakeTimers();
    const p = make(async () => 1, () => new Promise(() => undefined)).check().catch((e) => e);
    await jest.advanceTimersByTimeAsync(2100);
    const err = await p;
    jest.useRealTimers();
    expect(err.getResponse()).toMatchObject({ redis: 'down' });
  });
});
