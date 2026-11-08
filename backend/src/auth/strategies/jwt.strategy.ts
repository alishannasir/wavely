import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { requireJwtSecret } from '../../config/jwt.config';
import { readSessionCookie } from '../session-cookie';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { REDIS } from '../../redis/redis.module';
import { isSessionRevoked } from '../../common/session-revocation';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => readSessionCookie(req?.headers?.cookie),
      ]),
      secretOrKey: requireJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: { sub: string; email: string; tv?: number; jti?: string; purpose?: string }) {
    // The guest-merge state travels through Google's URL: it must never work as a login. A signed-out token is refused too.
    if (payload.purpose) throw new UnauthorizedException();
    if (await isSessionRevoked(this.redis, payload.jti)) throw new UnauthorizedException('Your session has ended. Please sign in again.');
    // Re-check status so suspended/banned users lose access before their token expires.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true, role: true, isGuest: true, emailVerifiedAt: true, tokenVersion: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is suspended or banned');
    }
    // Password/email changes bump tokenVersion, which signs the account out everywhere else.
    if ((payload.tv ?? 0) !== user.tokenVersion) throw new UnauthorizedException('Your session has ended. Please sign in again.');
    return { userId: payload.sub, email: payload.email, role: user.role, isGuest: user.isGuest, emailVerifiedAt: user.emailVerifiedAt };
  }
}
