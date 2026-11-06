const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

// GB is deliberately NOT allowed by default: the UK Online Safety Act requires robust age assurance
// (not self-declaration). Add 'GB' via ALLOWED_COUNTRIES only once age verification is in place.
export const DEFAULT_ALLOWED_COUNTRIES = [
  'US', 'CA', 'AU', 'NZ', // Western
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

/**
 * Country of the caller from Cloudflare's CF-IPCountry header. The header is trivially spoofable
 * unless the app is only reachable through Cloudflare, so it is ignored unless TRUST_PROXY=true.
 */
export function resolveCountry(headers: Record<string, unknown>): string | null {
  if (process.env.TRUST_PROXY !== 'true') return null;
  const header = headers['cf-ipcountry'];
  return typeof header === 'string' && header !== 'XX' ? header.toUpperCase() : null;
}

/** Same rule for HTTP and sockets. Unknown country is blocked only when GEO_STRICT=true. */
export function isCountryAllowed(country: string | null): boolean {
  if (!country) return process.env.GEO_STRICT !== 'true';
  return getAllowedCountries().includes(country);
}
