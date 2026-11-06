import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BansService } from './bans.service';
import { SKIP_BAN_CHECK } from './skip-ban.decorator';
import { clientIp, sanitizeDeviceId } from '../common/client-info';

/** Global guard: rejects HTTP requests from banned IPs / devices. */
@Injectable()
export class BanGuard implements CanActivate {
  constructor(
    private readonly bans: BansService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_BAN_CHECK, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest();
    const ip = clientIp(req.headers, req.socket?.remoteAddress);
    const deviceId = sanitizeDeviceId(req.headers['x-device-id']);
    if (await this.bans.isBlocked(ip, deviceId)) {
      throw new ForbiddenException({ statusCode: 403, code: 'BANNED', message: 'Access denied.' });
    }
    return true;
  }
}
