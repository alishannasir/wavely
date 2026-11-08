import { isCountryAllowed, resolveCountry } from './geo.config';

describe('geo', () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
    delete process.env.GEO_STRICT;
    delete process.env.ALLOWED_COUNTRIES;
    delete process.env.BLOCKED_COUNTRIES;
  });
  it('ignores the CF header unless TRUST_PROXY=true', () => {
    expect(resolveCountry({ 'cf-ipcountry': 'US' })).toBeNull();
    process.env.TRUST_PROXY = 'true';
    expect(resolveCountry({ 'cf-ipcountry': 'us' })).toBe('US');
    expect(resolveCountry({ 'cf-ipcountry': 'XX' })).toBeNull();
  });
  it('blocks unknown country only in strict mode', () => {
    expect(isCountryAllowed(null)).toBe(true);
    process.env.GEO_STRICT = 'true';
    expect(isCountryAllowed(null)).toBe(false);
  });
  it('blocks countries outside the allow-list', () => {
    expect(isCountryAllowed('US')).toBe(true);
    expect(isCountryAllowed('ZZ')).toBe(false);
  });

  it('a list in ALLOWED_COUNTRIES replaces the default', () => {
    process.env.ALLOWED_COUNTRIES = 'pk, in';
    expect(isCountryAllowed('PK')).toBe(true);
    expect(isCountryAllowed('IN')).toBe(true);
    expect(isCountryAllowed('US')).toBe(false);
  });
  describe('ALLOWED_COUNTRIES=ALL', () => {
    beforeEach(() => { process.env.ALLOWED_COUNTRIES = 'all'; });
    it('lets every country in, except the UK unless told otherwise', () => {
      for (const c of ['PK', 'IN', 'BR', 'NG', 'JP', 'US', 'DE', 'TV']) expect(isCountryAllowed(c)).toBe(true);
      expect(isCountryAllowed('GB')).toBe(false);
    });
    it('BLOCKED_COUNTRIES picks who is kept out; NONE keeps nobody out', () => {
      process.env.BLOCKED_COUNTRIES = 'kp, ir';
      expect(isCountryAllowed('KP')).toBe(false);
      expect(isCountryAllowed('IR')).toBe(false);
      expect(isCountryAllowed('GB')).toBe(true);
      process.env.BLOCKED_COUNTRIES = 'NONE';
      expect(isCountryAllowed('KP')).toBe(true);
    });
    it('an unknown country still follows GEO_STRICT', () => {
      expect(isCountryAllowed(null)).toBe(true);
      process.env.GEO_STRICT = 'true';
      expect(isCountryAllowed(null)).toBe(false);
    });
  });
});
