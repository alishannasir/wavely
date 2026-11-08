import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryName, searchCountries } from './countries';

describe('countries', () => {
  it('covers the whole world, once each, with a name and a flag', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(245);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const code of ['US', 'GB', 'PK', 'IN', 'NZ', 'AE', 'TV', 'ZW']) {
      expect(COUNTRIES.some((c) => c.code === code)).toBe(true);
    }
    expect(COUNTRIES.every((c) => c.name && c.flag)).toBe(true);
    expect(countryName('PK')).toBe('Pakistan');
  });
  it('is sorted by name', () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('searchCountries', () => {
  it('finds by any part of the name, ignoring case and accents', () => {
    expect(searchCountries('pakis')[0].code).toBe('PK');
    expect(searchCountries('UNITED').map((c) => c.code)).toEqual(expect.arrayContaining(['US', 'GB', 'AE']));
    expect(searchCountries('cote').some((c) => c.code === 'CI')).toBe(true); // Côte d'Ivoire
  });
  it('finds by code and by common nicknames', () => {
    expect(searchCountries('de')[0].code).toBe('DE');
    expect(searchCountries('uk')[0].code).toBe('GB');
    expect(searchCountries('usa')[0].code).toBe('US');
  });
  it('shows everything for an empty search and nothing for nonsense', () => {
    expect(searchCountries('').length).toBe(COUNTRIES.length);
    expect(searchCountries('zzzzzz')).toEqual([]);
  });
});
