import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { getAllowedCountries } from './geo.config';

@Injectable()
export class GeoGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const country: string | null = req.country ?? null;

    if (!country) {
      // Graceful fallback when the header is absent (e.g. local dev without Cloudflare).
      // Set GEO_STRICT=true in production to block requests with unknown origin.
      if (process.env.GEO_STRICT === 'true') {
        throw new ForbiddenException({ statusCode: 403, code: 'REGION_BLOCKED', message: 'This service is not available in your region.' });
      }
      return true;
    }

    if (getAllowedCountries().includes(country)) return true;

    throw new ForbiddenException({ statusCode: 403, code: 'REGION_BLOCKED', message: 'This service is not available in your region.' });
  }
}
