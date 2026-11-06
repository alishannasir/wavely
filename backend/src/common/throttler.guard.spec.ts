import { AppThrottlerGuard } from './throttler.guard';

describe('AppThrottlerGuard', () => {
  const guard = Object.create(AppThrottlerGuard.prototype) as any;
  afterEach(() => delete process.env.TRUST_PROXY);

  it('tracks by the socket address, ignoring spoofable proxy headers by default', async () => {
    expect(await guard.getTracker({ headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '::ffff:9.9.9.9' } })).toBe('9.9.9.9');
  });
  it('uses the proxy header when TRUST_PROXY=true', async () => {
    process.env.TRUST_PROXY = 'true';
    expect(await guard.getTracker({ headers: { 'cf-connecting-ip': '5.5.5.5' }, socket: { remoteAddress: '10.0.0.1' } })).toBe('5.5.5.5');
  });
  it('does not rate limit websocket contexts', async () => {
    expect(await guard.canActivate({ getType: () => 'ws' })).toBe(true);
  });
});
