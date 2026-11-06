import type { IncomingHttpHeaders } from 'http';

/**
 * Best-effort client IP. Proxy headers are spoofable, so they are only trusted when
 * TRUST_PROXY=true (i.e. the app is only reachable through Cloudflare / a reverse proxy).
 */
export function clientIp(headers: IncomingHttpHeaders, remoteAddress?: string): string | null {
  if (process.env.TRUST_PROXY === 'true') {
    const cf = headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf;
    const xff = headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return remoteAddress?.replace(/^::ffff:/, '') ?? null;
}

const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,64}$/;

export function sanitizeDeviceId(value: unknown): string | null {
  return typeof value === 'string' && DEVICE_ID_RE.test(value) ? value : null;
}
