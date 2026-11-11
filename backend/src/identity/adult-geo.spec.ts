import { adultGateEnabled, decideAdultGeo } from './adult-geo';

const allowed = ['US', 'DE'];

describe('decideAdultGeo', () => {
  it('lets a room continue only with two kinds of evidence, all inside the allowed list', () => {
    expect(decideAdultGeo({ ip: ['US', 'DE'], document: ['US', 'DE'] }, { final: true, allowed })).toEqual({ ok: true });
  });
  it('one kind of evidence is never enough to continue (an IP is faked with a VPN)', () => {
    expect(decideAdultGeo({ ip: ['US', 'US'], document: [] }, { final: true, allowed })).toEqual({ ok: false, reason: 'NOT_ENOUGH_SIGNALS' });
    expect(decideAdultGeo({ ip: ['US', 'US'], document: [null, undefined] }, { final: true, allowed })).toEqual({ ok: false, reason: 'NOT_ENOUGH_SIGNALS' });
  });
  it('any known country outside the list blocks, even when the others are fine', () => {
    expect(decideAdultGeo({ ip: ['US', 'US'], document: ['US', 'PK'] }, { final: true, allowed })).toEqual({ ok: false, reason: 'COUNTRY_NOT_ALLOWED' });
    expect(decideAdultGeo({ ip: ['PK', 'US'] }, { final: false, allowed })).toEqual({ ok: false, reason: 'COUNTRY_NOT_ALLOWED' });
  });
  it('before anyone verified, unknown evidence does not stop the room, only a disallowed country does', () => {
    expect(decideAdultGeo({ ip: ['US', null] }, { final: false, allowed })).toEqual({ ok: true });
    expect(decideAdultGeo({ ip: [null, null] }, { final: false, allowed })).toEqual({ ok: true });
  });
  it('is case-insensitive', () => {
    expect(decideAdultGeo({ ip: ['us'], document: ['de'] }, { final: true, allowed })).toEqual({ ok: true });
  });
});

describe('adultGateEnabled', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it('is off by default and needs both the switch and a country list', () => {
    delete process.env.ADULT_GATE_ENABLED;
    delete process.env.ADULT_ALLOWED_COUNTRIES;
    expect(adultGateEnabled()).toBe(false);
    process.env.ADULT_GATE_ENABLED = 'true';
    expect(adultGateEnabled()).toBe(false);
    process.env.ADULT_ALLOWED_COUNTRIES = 'US, DE';
    expect(adultGateEnabled()).toBe(true);
    process.env.ADULT_GATE_ENABLED = 'false';
    expect(adultGateEnabled()).toBe(false);
  });
});
