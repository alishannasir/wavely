import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const log = new Logger('HTTP');
const QUIET = new Set(['/api/health', '/api/stats/online']);

/**
 * One line per request: method, path, status, duration. Deliberately NOT logged: query strings
 * (they can hold one-time login codes), headers, bodies, tokens and IP addresses.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    if (QUIET.has(path)) return;
    log.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}
