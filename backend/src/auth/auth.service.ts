import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  OnModuleDestroy,
  OnModuleInit,
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
import { UpgradeGuestDto } from './dto/upgrade-guest.dto';
import { SessionTokenService, sanitizeUser } from '../account/session-token.service';
import { AccountService } from '../account/account.service';

const TRIAL_DAYS = 3;
const GUEST_TOKEN_TTL = '4h';
const GUEST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const GUEST_PURGE_EVERY_MS = 60 * 60 * 1000;
const GUEST_PER_IP_PER_DAY = parseInt(process.env.GUEST_PER_IP_PER_DAY ?? '10', 10);
const GUEST_PER_DEVICE_PER_DAY = parseInt(process.env.GUEST_PER_DEVICE_PER_DAY ?? '3', 10);

export interface OAuthProfile {
  provider: 'GOOGLE' | 'APPLE';
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly session: SessionTokenService,
    private readonly account: AccountService,
  ) {}

  onModuleInit() {
    this.purgeTimer = setInterval(() => void this.purgeStaleGuests().catch(() => undefined), GUEST_PURGE_EVERY_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  /** Adult by birthdate, or (guests only) by self-attestation. Everyone else must finish onboarding. */
  static isAdultUser(u: { birthdate: Date | null; adultAttestedAt?: Date | null; isGuest?: boolean }): boolean {
    if (u.birthdate) return AuthService.ageOf(u.birthdate) >= 18;
    return !!u.isGuest && !!u.adultAttestedAt;
  }

  private async bumpDailyCounter(key: string, limit: number): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const full = `guest:${key}:${day}`;
    const n = await this.redis.incr(full);
    if (n === 1) await this.redis.expire(full, 26 * 60 * 60);
    if (n > limit) {
      throw new HttpException(
        'Too many guest sessions from this device or network today. Please create a free account.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Guest = random video chat only. Short-lived token, capped per IP and per device per day. */
  async createGuest(ctx: { ip: string | null; deviceId: string | null; country: string | null }) {
    if (!ctx.deviceId) throw new BadRequestException('A valid X-Device-Id header is required');
    await this.bumpDailyCounter(`device:${ctx.deviceId}`, GUEST_PER_DEVICE_PER_DAY);
    if (ctx.ip) await this.bumpDailyCounter(`ip:${ctx.ip}`, GUEST_PER_IP_PER_DAY);

    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        authProvider: 'GUEST',
        isGuest: true,
        displayName: `Guest${Math.floor(1000 + Math.random() * 9000)}`,
        country: ctx.country,
        adultAttestedAt: now,
        rulesAcceptedAt: now,
        lastDeviceId: ctx.deviceId,
        lastIp: ctx.ip,
        trialEndsAt: new Date(now.getTime() - 1000), // no trial: guests are on the free plan
      },
    });
    return {
      access_token: this.jwt.sign({ sub: user.id, guest: true }, { expiresIn: GUEST_TOKEN_TTL }),
      user: this.sanitize(user),
    };
  }

  /** Turns the current guest into a full account (keeps the same user row). */
  async upgradeGuest(userId: string, dto: UpgradeGuestDto) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current || !current.isGuest) throw new BadRequestException('Only guest accounts can be upgraded');
    const birthdate = new Date(dto.birthdate);
    AuthService.assertAdult(birthdate);
    if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        authProvider: 'EMAIL',
        isGuest: false,
        displayName: dto.displayName,
        birthdate,
        gender: dto.gender,
        trialEndsAt: this.trialEnd(),
      },
    });
    void this.account.sendVerificationQuietly(user);
    return this.tokenFor(user);
  }

  /** Deletes old guests that have no reports involving them or their sessions (nothing to preserve). */
  async purgeStaleGuests(): Promise<number> {
    if (!(await this.redis.set('lock:purge-guests', '1', 'PX', GUEST_PURGE_EVERY_MS - 1000, 'NX'))) return 0;
    const stale = await this.prisma.user.findMany({
      where: {
        isGuest: true,
        createdAt: { lt: new Date(Date.now() - GUEST_MAX_AGE_MS) },
        reportsMade: { none: {} },
        reportsReceived: { none: {} },
        sessionsAsA: { none: { reports: { some: {} } } },
        sessionsAsB: { none: { reports: { some: {} } } },
      },
      select: { id: true },
      take: 200,
    });
    for (const { id } of stale) {
      await this.prisma.$transaction([
        this.prisma.dailyUsage.deleteMany({ where: { userId: id } }),
        this.prisma.callSession.deleteMany({ where: { OR: [{ userAId: id }, { userBId: id }] } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
    }
    return stale.length;
  }

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
    return sanitizeUser(user);
  }

  private tokenFor(user: User) {
    return this.session.issue(user);
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
    void this.account.sendVerificationQuietly(user);
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

  /**
   * A signed, short-lived proof of "this browser is guest X". It travels through Google's `state`
   * parameter, so that signing in with Google can turn the guest into the Google account.
   */
  async createGuestMergeState(userId: string): Promise<{ state: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isGuest: true } });
    if (!user?.isGuest) throw new BadRequestException('Only guest sessions can be merged');
    return { state: this.jwt.sign({ sub: userId, purpose: 'guest-merge' }, { expiresIn: '15m' }) };
  }

  /** Returns the guest's user id if `state` is a valid merge token, otherwise null (never throws). */
  readGuestMergeState(state: unknown): string | null {
    if (typeof state !== 'string' || !state) return null;
    try {
      const payload = this.jwt.verify<{ sub: string; purpose?: string }>(state);
      return payload.purpose === 'guest-merge' ? payload.sub : null;
    } catch {
      return null;
    }
  }

  /**
   * Sign in (or up) with a provider. If the person was a guest, their guest session becomes the new
   * account (nothing is lost); if that email already has an account, they simply sign in to it and the
   * unused guest row is left for the nightly purge.
   */
  async oauthLogin(profile: OAuthProfile, country: string | null, guestUserId?: string | null) {
    if (!profile.email) throw new UnauthorizedException('No email returned by provider');
    let user = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (!user && guestUserId) {
      const guest = await this.prisma.user.findUnique({ where: { id: guestUserId } });
      if (guest?.isGuest && guest.status === 'ACTIVE') {
        user = await this.prisma.user.update({
          where: { id: guest.id },
          data: {
            email: profile.email,
            authProvider: profile.provider,
            isGuest: false,
            displayName: profile.displayName ?? guest.displayName,
            avatarUrl: profile.avatarUrl,
            emailVerifiedAt: new Date(),
            trialEndsAt: this.trialEnd(),
            tokenVersion: { increment: 1 },
          },
        });
      }
    }
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
          emailVerifiedAt: new Date(), // the provider already verified this address
          trialEndsAt: this.trialEnd(),
        },
      });
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is suspended or banned');
    if (!user.emailVerifiedAt) {
      // Someone registered this address with a password but never confirmed it, and now the real owner has proved
      // control through the provider. Take the account over safely: the registrant's password no longer works,
      // their sessions end, and any link they requested is cancelled.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: null, emailVerifiedAt: new Date(), authProvider: profile.provider, tokenVersion: { increment: 1 } },
      });
      await this.prisma.emailToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    }
    return this.tokenFor(user);
  }
}
