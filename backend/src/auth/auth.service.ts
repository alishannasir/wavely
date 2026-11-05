import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import * as bcrypt from 'bcryptjs';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const TRIAL_DAYS = 3;

export interface OAuthProfile {
  provider: 'GOOGLE' | 'APPLE';
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Stores the login result under a single-use code (60s) so no JWT ever travels in a URL. */
  async createLoginCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('hex');
    await this.redis.set(`auth:code:${code}`, userId, 'EX', 60);
    return code;
  }

  async exchangeLoginCode(code: string) {
    // GETDEL makes the code single-use even under concurrent requests.
    const userId = await this.redis.getdel(`auth:code:${code}`);
    if (!userId) throw new UnauthorizedException('Invalid or expired code');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Account is suspended or banned');
    return this.tokenFor(user);
  }

  static ageOf(birthdate: Date): number {
    const now = new Date();
    let age = now.getFullYear() - birthdate.getFullYear();
    const m = now.getMonth() - birthdate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) age--;
    return age;
  }

  static assertAdult(birthdate: Date): void {
    if (AuthService.ageOf(birthdate) < 18) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'UNDERAGE',
        message: 'You must be 18 or older to use this service.',
      });
    }
  }

  private trialEnd(): Date {
    return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }

  private sanitize(user: User) {
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  private tokenFor(user: User) {
    return {
      access_token: this.jwt.sign({ sub: user.id, email: user.email }),
      user: this.sanitize(user),
    };
  }

  async register(dto: RegisterDto, country: string | null) {
    const birthdate = new Date(dto.birthdate);
    AuthService.assertAdult(birthdate);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        authProvider: 'EMAIL',
        displayName: dto.displayName,
        birthdate,
        gender: dto.gender,
        country,
        trialEndsAt: this.trialEnd(),
      },
    });
    return this.tokenFor(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is suspended or banned');
    return this.tokenFor(user);
  }

  async oauthLogin(profile: OAuthProfile, country: string | null) {
    if (!profile.email) throw new UnauthorizedException('No email returned by provider');
    let user = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (!user) {
      // Birthdate is unknown for OAuth signups; onboarding collects it and
      // UsersService enforces the 18+ gate before the profile is complete.
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          authProvider: profile.provider,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          country,
          trialEndsAt: this.trialEnd(),
        },
      });
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is suspended or banned');
    return this.tokenFor(user);
  }
}
