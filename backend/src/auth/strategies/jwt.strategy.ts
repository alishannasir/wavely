import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { requireJwtSecret } from '../../config/jwt.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: requireJwtSecret(config.get<string>('JWT_SECRET')),
    });
  }

  async validate(payload: { sub: string; email: string; tv?: number }) {
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
