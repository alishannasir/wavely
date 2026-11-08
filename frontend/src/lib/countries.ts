import { flagEmoji } from './flag';

/** Every ISO 3166-1 country and territory code (249). Names come from the browser's own language data. */
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

let names: Intl.DisplayNames | null = null;
try {
  names = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  /* very old browser: fall back to the code itself */
}

export function countryName(code: string): string {
  try {
    return names?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = COUNTRY_CODES.map((code) => ({ code, name: countryName(code), flag: flagEmoji(code) })).sort((a, b) =>
  a.name.localeCompare(b.name, 'en'),
);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// What people type that is not the official name.
const ALIASES: Record<string, string> = { uk: 'GB', usa: 'US', uae: 'AE', 'south korea': 'KR', 'north korea': 'KP', russia: 'RU', 'ivory coast': 'CI', holland: 'NL' };

/** Countries matching what was typed: by name (any part, accents ignored), by code, or by a common nickname. */
export function searchCountries(query: string): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES;
  const alias = ALIASES[q];
  return COUNTRIES.filter((c) => c.code.toLowerCase() === q || c.code === alias || fold(c.name).includes(q)).sort((a, b) => {
    // Names that start with the text first.
    const rank = (c: Country) => (c.code === alias || c.code.toLowerCase() === q ? 0 : fold(c.name).startsWith(q) ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'en');
  });
}
