import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isCountryAllowed } from './geo.config';
import { SKIP_GEO } from './skip-geo.decorator';

/** Applied globally (APP_GUARD): every HTTP route is region-gated unless marked @SkipGeo(). */
@Injectable()
export class GeoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_GEO, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    if (isCountryAllowed(req.country ?? null)) return true;
    throw new ForbiddenException({
      statusCode: 403,
      code: 'REGION_BLOCKED',
      message: 'This service is not available in your region.',
    });
  }
}
