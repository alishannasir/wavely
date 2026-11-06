/**
 * Browser origins allowed to call the API and the websocket.
 *  - FRONTEND_URL: one origin, or several separated by commas (the first is used for redirects).
 *  - Outside production, any http(s)://localhost[:port] / 127.0.0.1[:port] is also allowed, so the dev
 *    server can run on whichever port is free. Set NODE_ENV=production to turn that off.
 */
export function allowedOrigins(): string[] {
  return (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The frontend address used when the backend redirects the browser (OAuth, Stripe). */
export function primaryFrontendUrl(): string {
  return allowedOrigins()[0] ?? 'http://localhost:5173';
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin or non-browser clients (CORS does not apply)
  if (allowedOrigins().includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** Signature expected by `cors` / Socket.IO: reflects the request origin when it is allowed. */
export function corsOrigin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void): void {
  cb(null, isOriginAllowed(origin));
}
