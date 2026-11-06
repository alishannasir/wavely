import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Use after AuthGuard('jwt'): guests get random chat only. */
@Injectable()
export class NotGuestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.switchToHttp().getRequest().user?.isGuest) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'GUEST_RESTRICTED',
        message: 'Create a free account to use this feature.',
      });
    }
    return true;
  }
}
