import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { BansService } from './bans.service';
import { clientIp, sanitizeDeviceId } from '../common/client-info';

/** Global guard: rejects HTTP requests from banned IPs / devices. */
@Injectable()
export class BanGuard implements CanActivate {
  constructor(private readonly bans: BansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const ip = clientIp(req.headers, req.socket?.remoteAddress);
    const deviceId = sanitizeDeviceId(req.headers['x-device-id']);
    if (await this.bans.isBlocked(ip, deviceId)) {
      throw new ForbiddenException({ statusCode: 403, code: 'BANNED', message: 'Access denied.' });
    }
    return true;
  }
}
