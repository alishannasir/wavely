import { originSecretMiddleware, originSecretOk } from './origin-secret';

function run(path: string, headers: Record<string, string>) {
  let status = 0;
  let passed = false;
  const res: any = { status: (s: number) => ((status = s), res), json: () => res };
  originSecretMiddleware({ path, headers } as any, res, () => (passed = true));
  return { status, passed };
}

describe('origin secret', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('is off when ORIGIN_SECRET is not set (local development, tests)', () => {
    delete process.env.ORIGIN_SECRET;
    expect(originSecretOk({})).toBe(true);
    expect(run('/api/users/me', {}).passed).toBe(true);
  });

  it('serves only requests that carry the exact secret', () => {
    process.env.ORIGIN_SECRET = 's3cret-value';
    expect(originSecretOk({ 'x-origin-secret': 's3cret-value' })).toBe(true);
    expect(originSecretOk({})).toBe(false);
    expect(originSecretOk({ 'x-origin-secret': 'wrong' })).toBe(false);
    expect(originSecretOk({ 'x-origin-secret': 's3cret-valu' })).toBe(false); // a prefix is not enough
    expect(originSecretOk({ 'x-origin-secret': ['s3cret-value', 'x'] as any })).toBe(false);
  });

  it('answers 403 without revealing why, and lets the platform health check through', () => {
    process.env.ORIGIN_SECRET = 's3cret-value';
    expect(run('/api/auth/login', {})).toEqual({ status: 403, passed: false });
    expect(run('/api/auth/login', { 'x-origin-secret': 's3cret-value' })).toEqual({ status: 0, passed: true });
    expect(run('/api/health', {}).passed).toBe(true);
  });
});
