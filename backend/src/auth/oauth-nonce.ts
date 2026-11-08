import { randomBytes, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { primaryFrontendUrl } from '../common/cors';

/**
 * Ties a Google sign-in to the browser that started it. Without this, an attacker can start a sign-in, stop before
 * the last step, and send the link to a victim, who would then be signed in as the attacker (login CSRF).
 * The nonce travels in a short-lived HttpOnly cookie and inside Google's `state`; both must match on the way back.
 */
export const OAUTH_COOKIE = 'ovc_oauth';
const SEP = '~';

const secure = () => process.env.NODE_ENV === 'production' || primaryFrontendUrl().startsWith('https://');
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: secure(), path: '/api/auth' });

/** Creates a nonce, remembers it in a cookie, and returns the `state` to send to Google. */
export function startOauth(res: Response, guestState: string | undefined): string {
  const nonce = randomBytes(16).toString('hex');
  res.cookie(OAUTH_COOKIE, nonce, { ...cookieOptions(), maxAge: 10 * 60 * 1000 });
  return `${nonce}${SEP}${guestState ?? ''}`;
}

export function clearOauthCookie(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, cookieOptions());
}

export function readOauthCookie(header: string | undefined): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === OAUTH_COOKIE) return decodeURIComponent(part.slice(i + 1).trim()) || null;
  }
  return null;
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks the `state` Google sent back against the cookie. Returns the nonce and the guest-merge part when they match,
 * or null (a different browser, an expired sign-in, or a made-up state).
 */
export function verifyOauthState(state: unknown, cookieHeader: string | undefined): { nonce: string; guestState: string } | null {
  const cookie = readOauthCookie(cookieHeader);
  if (typeof state !== 'string' || !cookie) return null;
  const i = state.indexOf(SEP);
  if (i < 0) return null;
  const nonce = state.slice(0, i);
  return nonce && sameText(nonce, cookie) ? { nonce, guestState: state.slice(i + 1) } : null;
}
