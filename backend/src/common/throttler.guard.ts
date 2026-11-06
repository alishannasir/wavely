import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from './client-info';

/**
 * Rate limiting by client IP. Uses the same IP logic as bans (proxy headers only when TRUST_PROXY=true),
 * and only applies to HTTP: websocket events have their own limits (chat, reports).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req.headers ?? {}, req.socket?.remoteAddress) ?? 'unknown';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }
}
