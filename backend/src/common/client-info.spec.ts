import { clientIp, sanitizeDeviceId } from './client-info';

describe('clientIp', () => {
  afterEach(() => delete process.env.TRUST_PROXY);
  it('ignores proxy headers unless TRUST_PROXY=true', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '::ffff:9.9.9.9')).toBe('9.9.9.9');
  });
  it('uses cf-connecting-ip / x-forwarded-for when trusted', () => {
    process.env.TRUST_PROXY = 'true';
    expect(clientIp({ 'cf-connecting-ip': '5.5.5.5' }, '9.9.9.9')).toBe('5.5.5.5');
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, '9.9.9.9')).toBe('1.2.3.4');
  });
});

describe('sanitizeDeviceId', () => {
  it('accepts uuids and rejects junk', () => {
    expect(sanitizeDeviceId('3f2b8c1e-5d4a-4b6e-9a1f-0c2d3e4f5a6b')).not.toBeNull();
    expect(sanitizeDeviceId('x')).toBeNull();
    expect(sanitizeDeviceId({})).toBeNull();
    expect(sanitizeDeviceId("a'; drop table--------")).toBeNull();
  });
});
