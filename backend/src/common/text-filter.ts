import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

// Contact details and promotion are the main spam/scam vector in random chat.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const BARE_DOMAIN_RE = /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|me|tv|gg|ly|app|xyz|info|co|ru|cn|link|club|live|chat|vip|top|site|online|store)\b(?:\/\S*)?/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\s().-]{0,2}){8,}\d/g;

// Innocent words the matcher wrongly flags (it collapses repeated letters, so "shiitake" looks like "shit").
const NOT_PROFANE = new Set(['shiitake', 'penistone', 'scunthorpe', 'cockburn', 'cockfosters', 'dickinson', 'hancock', 'peacock', 'cocktail', 'cocktails']);
// "f u c k", "f.u.c.k", "f-u-c-k": single letters with separators, at least four of them.
const SPACED_LETTERS_RE = /(?<![a-z0-9])(?:[a-z][\s._*-]+){3,}[a-z](?![a-z0-9])/gi;

function wordAround(text: string, start: number, end: number): string {
  let s = start;
  let e = end;
  while (s > 0 && /[a-z]/i.test(text[s - 1])) s--;
  while (e < text.length - 1 && /[a-z]/i.test(text[e + 1])) e++;
  return text.slice(s, e + 1).toLowerCase();
}

export interface FilterResult {
  /** What the other person gets to see. */
  text: string;
  changed: boolean;
  profanity: boolean;
  links: boolean;
}

/**
 * In-call chat filter.
 *  - Profanity is masked with asterisks (obscenity understands leetspeak, spacing tricks and repeated letters).
 *  - Links, email addresses and phone numbers are replaced unless `allowLinks` (verified accounts only).
 * The original text is kept in the report evidence; only the other person sees the filtered version.
 */
export function filterChatText(input: string, opts: { allowLinks: boolean }): FilterResult {
  let text = input;
  let links = false;
  if (!opts.allowLinks) {
    const swap = (re: RegExp, label: string) => {
      text = text.replace(re, () => {
        links = true;
        return label;
      });
    };
    swap(EMAIL_RE, '[contact removed]'); // before domains, so addresses are not half-matched
    swap(URL_RE, '[link removed]');
    swap(BARE_DOMAIN_RE, '[link removed]');
    swap(PHONE_RE, '[contact removed]');
  }
  let profanity = false;
  // Letters spread out to dodge the matcher: judge the collapsed word, hide the whole span.
  text = text.replace(SPACED_LETTERS_RE, (span) => {
    const collapsed = span.replace(/[^a-z]/gi, '');
    if (!matcher.hasMatch(collapsed)) return span;
    profanity = true;
    return '*'.repeat(collapsed.length);
  });
  const matches = matcher.getAllMatches(text).filter((m) => !NOT_PROFANE.has(wordAround(text, m.startIndex, m.endIndex)));
  if (matches.length > 0) {
    profanity = true;
    text = censor.applyTo(text, matches);
  }
  return { text, changed: text !== input, profanity, links };
}
