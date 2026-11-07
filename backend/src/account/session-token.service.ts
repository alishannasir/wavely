import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';

/** The user object that is safe to send to the browser. */
export function sanitizeUser(user: User) {
  const { passwordHash: _ph, tokenVersion: _tv, deletedAt: _d, ...safe } = user;
  return safe;
}

/**
 * Issues login tokens. `tv` is the user's tokenVersion: changing the password or email bumps it, which
 * makes every older token (on all devices) stop working. Guests and old tokens have no `tv` (= 0).
 */
@Injectable()
export class SessionTokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(user: User) {
    return {
      access_token: this.jwt.sign({ sub: user.id, email: user.email ?? undefined, tv: user.tokenVersion }),
      user: sanitizeUser(user),
    };
  }
}
