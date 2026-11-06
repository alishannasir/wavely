import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { resolveCountry } from './geo.config';

/**
 * Resolves the caller's country (Cloudflare CF-IPCountry, only when TRUST_PROXY=true).
 * To swap in MaxMind, replace resolveCountry only; the rest of the app reads req.country.
 */
@Injectable()
export class GeoMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    (req as Request & { country: string | null }).country = resolveCountry(req.headers);
    next();
  }
}
