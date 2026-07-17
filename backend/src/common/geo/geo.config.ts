const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

export const DEFAULT_ALLOWED_COUNTRIES = [
  'US', 'GB', 'CA', 'AU', 'NZ', // Western
  'AE', 'SA', 'QA', 'KW', // Middle East whitelist
  ...EU_COUNTRIES,
];

export function getAllowedCountries(): string[] {
  const env = process.env.ALLOWED_COUNTRIES;
  if (env && env.trim().length > 0) {
    return env.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_COUNTRIES;
}
