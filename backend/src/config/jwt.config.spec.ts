import { requireJwtSecret } from './jwt.config';

describe('requireJwtSecret', () => {
  it('rejects a missing secret', () => {
    expect(() => requireJwtSecret(undefined)).toThrow(/JWT_SECRET/);
  });
  it('rejects the old default and short secrets', () => {
    expect(() => requireJwtSecret('dev-secret-change-me')).toThrow();
    expect(() => requireJwtSecret('short')).toThrow();
  });
  it('accepts a long secret', () => {
    const s = 'a'.repeat(32);
    expect(requireJwtSecret(s)).toBe(s);
  });
});
