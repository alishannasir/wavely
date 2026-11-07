import type { Response } from 'express';
import { primaryFrontendUrl } from '../common/cors';

export const SESSION_COOKIE = 'ovc_session';

/** HTTPS deployments (production, or a FRONTEND_URL that starts with https) get the Secure flag. */
function secure(): boolean {
  return process.env.NODE_ENV === 'production' || primaryFrontendUrl().startsWith('https://');
}

/** Milliseconds until the JWT expires (from its exp claim), or a week as a fallback. */
function lifetimeMs(jwt: string): number {
  try {
    const exp = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).exp;
    if (typeof exp === 'number') return Math.max(0, exp * 1000 - Date.now());
  } catch {
    /* fall through */
  }
  return 7 * 24 * 60 * 60 * 1000;
}

/**
 * The login token lives in an HttpOnly cookie: page scripts (including injected ones) cannot read it.
 * SameSite=Lax stops browsers from sending it on cross-site POSTs, which is the main CSRF protection.
 */
export function setSessionCookie(res: Response, jwt: string): void {
  res.cookie(SESSION_COOKIE, jwt, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: lifetimeMs(jwt) });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/' });
}

/** Reads the session cookie from a raw Cookie header (works for HTTP requests and the websocket handshake). */
export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) {
      const value = part.slice(i + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}
