import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isVerificationRequired } from '../account/verification';

/** Use after AuthGuard('jwt'): friends, messages and payments need a verified email (when delivery is configured). */
@Injectable()
export class RequireVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isVerificationRequired()) return true;
    const user = context.switchToHttp().getRequest().user;
    if (user?.isGuest || user?.emailVerifiedAt) return true; // guests are stopped by NotGuestGuard instead
    throw new ForbiddenException({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please confirm your email address first (check your inbox, or resend the link in your account settings).',
    });
  }
}
