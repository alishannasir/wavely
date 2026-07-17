import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Resolves the caller's country. Uses Cloudflare's CF-IPCountry header.
 * To swap in MaxMind, replace the lookup here only; the rest of the app
 * reads req.country and stays unchanged.
 */
@Injectable()
export class GeoMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers['cf-ipcountry'];
    (req as Request & { country: string | null }).country =
      typeof header === 'string' && header !== 'XX' ? header.toUpperCase() : null;
    next();
  }
}
