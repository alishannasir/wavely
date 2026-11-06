import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Use after AuthGuard('jwt'); JwtStrategy puts the DB role on req.user. */
@Injectable()
export class ModeratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const role = context.switchToHttp().getRequest().user?.role;
    if (role !== 'MODERATOR' && role !== 'ADMIN') throw new ForbiddenException('Moderators only');
    return true;
  }
}
