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

const codes = (list: string) => list.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

/** ALLOWED_COUNTRIES=ALL lets everyone in except the countries in BLOCKED_COUNTRIES. */
export function allowsAllCountries(): boolean {
  return (process.env.ALLOWED_COUNTRIES ?? '').trim().toUpperCase() === 'ALL';
}

/**
 * Only used with ALLOWED_COUNTRIES=ALL. Defaults to the UK (see the note above). Set BLOCKED_COUNTRIES=NONE to
 * block nobody, or a comma-separated list such as GB,KP to choose your own.
 */
export function getBlockedCountries(): string[] {
  const env = (process.env.BLOCKED_COUNTRIES ?? '').trim();
  if (!env) return ['GB'];
  return env.toUpperCase() === 'NONE' ? [] : codes(env);
}

export function getAllowedCountries(): string[] {
  const env = process.env.ALLOWED_COUNTRIES;
  if (env && env.trim().length > 0 && !allowsAllCountries()) return codes(env);
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
  if (allowsAllCountries()) return !getBlockedCountries().includes(country);
  return getAllowedCountries().includes(country);
}
