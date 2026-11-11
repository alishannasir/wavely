/**
 * Where the adult step-up feature may run. The feature is off unless ADULT_GATE_ENABLED=true AND
 * ADULT_ALLOWED_COUNTRIES lists at least one country. Never on by default.
 */
export function adultAllowedCountries(): string[] {
  return (process.env.ADULT_ALLOWED_COUNTRIES ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export function adultGateEnabled(): boolean {
  return process.env.ADULT_GATE_ENABLED === 'true' && adultAllowedCountries().length > 0;
}

/** One list of country codes per kind of evidence (ip, document, phone, billing), one entry per person. */
export type GeoSignals = Record<string, Array<string | null | undefined>>;

export type GeoDecision = { ok: true } | { ok: false; reason: 'NOT_ENOUGH_SIGNALS' | 'COUNTRY_NOT_ALLOWED' };

/**
 * Every known country must be in the allowed list. With `final: true` (the check that lets a room continue)
 * at least two different KINDS of evidence must be known as well, because an IP address alone is trivially
 * faked with a VPN. Before the person has verified, only a known disallowed country can stop the room.
 */
export function decideAdultGeo(
  signals: GeoSignals,
  opts: { final: boolean; allowed?: string[] } = { final: true },
): GeoDecision {
  const allowed = (opts.allowed ?? adultAllowedCountries()).map((c) => c.toUpperCase());
  let kinds = 0;
  for (const values of Object.values(signals)) {
    const known = values.filter((v): v is string => !!v).map((v) => v.toUpperCase());
    if (known.length === 0) continue;
    kinds += 1;
    if (known.some((c) => !allowed.includes(c))) return { ok: false, reason: 'COUNTRY_NOT_ALLOWED' };
  }
  if (opts.final && kinds < 2) return { ok: false, reason: 'NOT_ENOUGH_SIGNALS' };
  return { ok: true };
}
