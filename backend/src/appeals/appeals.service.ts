import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { AuditService } from '../moderation/audit.service';
import { BansService } from '../moderation/bans.service';

const DAY = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_HOUR = 10; // per email, on top of the per-IP request limit
export const MIN_MESSAGE = 20;
export const MAX_MESSAGE = 2000;
const cooldownDays = () => {
  const n = parseInt(process.env.APPEAL_COOLDOWN_DAYS ?? '7', 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
};

@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly audit: AuditService,
    private readonly bans: BansService,
  ) {}

  /**
   * A banned account cannot log in, so appeals check the password directly. The failure message is
   * the same for unknown emails and wrong passwords, and attempts are limited per email.
   */
  private async authenticate(email: string, password: string) {
    const key = `appeal:attempts:${email.toLowerCase()}`;
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, 3600);
    if (n > MAX_ATTEMPTS_PER_HOUR) throw new HttpException('Too many attempts, try again later', HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  /** What the appeal page shows after signing in: the account status and any earlier appeal. */
  async lookup(email: string, password: string) {
    const user = await this.authenticate(email, password);
    const last = await this.prisma.appeal.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const blocked = user.status !== 'ACTIVE';
    const nextAllowed = last ? new Date(last.createdAt.getTime() + cooldownDays() * DAY) : null;
    const canAppeal = blocked && last?.status !== 'OPEN' && (!nextAllowed || nextAllowed <= new Date());
    return {
      status: user.status,
      canAppeal,
      appeal: last ? { status: last.status, createdAt: last.createdAt, decidedAt: last.decidedAt, decisionNote: last.decisionNote } : null,
      nextAppealAt: blocked && last && last.status !== 'OPEN' && !canAppeal ? nextAllowed : null,
    };
  }

  async create(email: string, password: string, message: string) {
    const user = await this.authenticate(email, password);
    if (user.status === 'ACTIVE') throw new BadRequestException('Your account is not suspended or banned');
    const text = message?.trim() ?? '';
    if (text.length < MIN_MESSAGE) throw new BadRequestException(`Please explain in at least ${MIN_MESSAGE} characters`);
    if (text.length > MAX_MESSAGE) throw new BadRequestException(`Please keep it under ${MAX_MESSAGE} characters`);

    const last = await this.prisma.appeal.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    if (last?.status === 'OPEN') throw new ConflictException('You already have an appeal under review');
    if (last && last.createdAt.getTime() + cooldownDays() * DAY > Date.now()) {
      throw new HttpException('You can appeal again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    const appeal = await this.prisma.appeal.create({ data: { userId: user.id, message: text } });
    return { id: appeal.id, status: appeal.status };
  }

  // ---- moderators ----

  async list(status: 'OPEN' | 'APPROVED' | 'REJECTED' = 'OPEN', skip = 0, take = 50) {
    const where = { status };
    const [items, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: Math.min(take, 100),
        include: { user: { select: { id: true, displayName: true, email: true, status: true, createdAt: true } } },
      }),
      this.prisma.appeal.count({ where }),
    ]);
    return { total, items };
  }

  async openCount() {
    return this.prisma.appeal.count({ where: { status: 'OPEN' } });
  }

  async decide(moderatorId: string, appealId: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    const appeal = await this.prisma.appeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException('Appeal not found');
    if (appeal.status !== 'OPEN') throw new ConflictException('This appeal was already decided');
    if (appeal.userId === moderatorId) throw new BadRequestException('You cannot decide your own appeal');

    if (decision === 'APPROVE') {
      await this.bans.liftUserFootprint(appeal.userId);
      await this.prisma.user.update({ where: { id: appeal.userId }, data: { status: 'ACTIVE', flaggedUntil: null } });
    }
    await this.prisma.appeal.update({
      where: { id: appealId },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedById: moderatorId,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    });
    await this.audit.log(moderatorId, 'APPEAL_DECIDED', { targetUserId: appeal.userId, meta: { appealId, decision, note: note ?? null } });
    return { ok: true, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
  }
}
