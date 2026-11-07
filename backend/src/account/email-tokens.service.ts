import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { EmailTokenType } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

const HOUR = 60 * 60 * 1000;
export const TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * HOUR,
  RESET_PASSWORD: 1 * HOUR,
  CHANGE_EMAIL: 1 * HOUR,
};
const envInt = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const MAILS_PER_ADDRESS_PER_HOUR = () => envInt('MAIL_LIMIT_PER_ADDRESS', 3);
const MAILS_PER_IP_PER_HOUR = () => envInt('MAIL_LIMIT_PER_IP', 10);

export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** One-time email links. The secret is shown once (in the email); only its hash is stored. */
@Injectable()
export class EmailTokensService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Creates a new link and invalidates older unused links of the same type for that user. */
  async issue(userId: string, type: EmailTokenType, newEmail?: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
      this.prisma.emailToken.create({
        data: { userId, type, tokenHash: hashToken(raw), newEmail, expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]) },
      }),
    ]);
    return raw;
  }

  /**
   * Uses a link exactly once. Returns the token row, or null if it is unknown, expired or already used.
   * The single UPDATE makes concurrent clicks safe: only one of them wins.
   */
  async consume(type: EmailTokenType, raw: string) {
    const tokenHash = hashToken(raw);
    const claimed = await this.prisma.emailToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    return this.prisma.emailToken.findUnique({ where: { tokenHash } });
  }

  /** Limits how many emails one address / one IP can trigger per hour (stops mail bombing). */
  async checkSendLimit(address: string, ip: string | null): Promise<void> {
    const bump = async (key: string, limit: number) => {
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, 3600);
      if (n > limit) throw new HttpException('Too many emails requested. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    };
    await bump(`mail:addr:${address.toLowerCase()}`, MAILS_PER_ADDRESS_PER_HOUR());
    if (ip) await bump(`mail:ip:${ip}`, MAILS_PER_IP_PER_HOUR());
  }
}
