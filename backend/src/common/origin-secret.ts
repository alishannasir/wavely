import { createHash, timingSafeEqual } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import type { NextFunction, Request, Response } from 'express';

export const ORIGIN_SECRET_HEADER = 'x-origin-secret';

/** Paths the hosting platform's own health check calls (it cannot send our header). */
const EXEMPT_PATHS = new Set(['/api/health']);

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * When ORIGIN_SECRET is set, only requests that carry it are served. Cloudflare adds the header to every
 * request it forwards, so the API can no longer be reached around Cloudflare. That matters because the country
 * (CF-IPCountry) and client IP (CF-Connecting-IP) headers are only trustworthy when everything goes through it.
 * Unset (local development, tests) means no check.
 */
export function originSecretOk(headers: IncomingHttpHeaders): boolean {
  const expected = process.env.ORIGIN_SECRET;
  if (!expected) return true;
  const given = headers[ORIGIN_SECRET_HEADER];
  if (typeof given !== 'string') return false;
  return timingSafeEqual(digest(given), digest(expected)); // fixed-length digests: constant time
}

export function originSecretMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (EXEMPT_PATHS.has(req.path) || originSecretOk(req.headers)) return next();
  res.status(403).json({ statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' });
}
