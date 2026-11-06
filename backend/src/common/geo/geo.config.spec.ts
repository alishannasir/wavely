import { isCountryAllowed, resolveCountry } from './geo.config';

describe('geo', () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
    delete process.env.GEO_STRICT;
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
});
