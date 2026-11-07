import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { StripeService } from '../payments/stripe.service';
import { MailService } from '../mail/mail.service';
import { securityNoticeMail } from '../mail/templates';
import { sanitizeUser } from './session-token.service';

/** Everything a person is entitled to take with them, and the right to be forgotten. */
@Injectable()
export class DataRightsService {
  private readonly log = new Logger(DataRightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly stripe: StripeService,
    private readonly mail: MailService,
  ) {}

  /** A copy of the person's own data as JSON. Evidence screenshots and other people's identities are left out. */
  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const [friends, messages, sessions, subscriptions, blocks, reportsFiled, reportsReceived, appeals, usage] = await Promise.all([
      this.prisma.friend.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: { userA: { select: { id: true, displayName: true } }, userB: { select: { id: true, displayName: true } } },
      }),
      this.prisma.message.findMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { displayName: true } }, receiver: { select: { displayName: true } } },
      }),
      this.prisma.callSession.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] }, orderBy: { startedAt: 'asc' }, select: { id: true, startedAt: true, endedAt: true } }),
      this.prisma.subscription.findMany({ where: { userId }, select: { plan: true, status: true, currentPeriodEnd: true } }),
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { createdAt: true, blocked: { select: { displayName: true } } } }),
      this.prisma.report.findMany({ where: { reporterId: userId }, select: { reasonCode: true, status: true, createdAt: true } }),
      this.prisma.report.groupBy({ by: ['status'], where: { reportedUserId: userId }, _count: true }),
      this.prisma.appeal.findMany({ where: { userId }, select: { message: true, status: true, createdAt: true, decidedAt: true, decisionNote: true } }),
      this.prisma.dailyUsage.findMany({ where: { userId }, select: { date: true, minutesUsed: true, matchesUsed: true } }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      note: 'This is the data we hold about you. Screenshots and chat logs attached to moderation reports, and the identities of other people, are not included.',
      profile: sanitizeUser(user),
      friends: friends.map((f) => ({ with: (f.userAId === userId ? f.userB : f.userA).displayName, status: f.status, since: f.createdAt })),
      messages: messages.map((m) => ({ direction: m.senderId === userId ? 'sent' : 'received', with: (m.senderId === userId ? m.receiver : m.sender).displayName, content: m.content, at: m.createdAt })),
      calls: sessions,
      subscriptions,
      blockedPeople: blocks.map((b) => ({ name: b.blocked.displayName, since: b.createdAt })),
      reportsYouFiled: reportsFiled,
      reportsAboutYou: reportsReceived.map((r) => ({ status: r.status, count: r._count })),
      appeals,
      dailyUsage: usage,
    };
  }

  /**
   * Deletes the account. Messages, friends, blocks, appeals, usage, subscriptions and email links are
   * erased and any Stripe subscription is cancelled. If the person appears in moderation records (they
   * reported someone or were reported), the row is kept but anonymised and locked, so safety records and
   * legal holds stay intact. Existing device/IP bans are never lifted by deleting an account.
   */
  async deleteAccount(userId: string, input: { password?: string; confirm?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    if (user.passwordHash) {
      if (!input.password || !(await bcrypt.compare(input.password, user.passwordHash))) throw new UnauthorizedException('Your password is not correct');
    } else if (input.confirm !== 'DELETE') {
      throw new BadRequestException('Type DELETE to confirm');
    }

    await this.stripe.cancelSubscriptionsFor(userId); // never throws

    const blocks = await this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const [made, received] = await Promise.all([
      this.prisma.report.count({ where: { reporterId: userId } }),
      this.prisma.report.count({ where: { reportedUserId: userId } }),
    ]);
    const keepRow = made + received > 0;

    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } }),
      this.prisma.friend.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
      this.prisma.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
      this.prisma.appeal.deleteMany({ where: { userId } }),
      this.prisma.emailToken.deleteMany({ where: { userId } }),
      this.prisma.dailyUsage.deleteMany({ where: { userId } }),
      this.prisma.subscription.deleteMany({ where: { userId } }),
      // Calls that nobody reported are erased; reported ones stay (the report points at them).
      this.prisma.callSession.deleteMany({ where: { OR: [{ userAId: userId }, { userBId: userId }], reports: { none: {} } } }),
      keepRow
        ? this.prisma.user.update({
            where: { id: userId },
            data: {
              email: null,
              passwordHash: null,
              displayName: 'Deleted user',
              avatarUrl: null,
              birthdate: null,
              gender: null,
              country: null,
              lastIp: null,
              lastDeviceId: null,
              role: 'USER',
              status: 'BANNED', // locks the row: it can never log in again
              flaggedUntil: null,
              emailVerifiedAt: null,
              deletedAt: new Date(),
              tokenVersion: { increment: 1 },
            },
          })
        : this.prisma.user.delete({ where: { id: userId } }),
    ]);

    await this.cleanupRedis(userId, blocks);
    if (user.email) {
      await this.mail.trySend(securityNoticeMail(user.email, 'your account was deleted', 'Your account and personal data were deleted, as you asked. Moderation records about safety reports may be kept in anonymised form.'));
    }
    this.log.log(`Account ${userId} deleted (${keepRow ? 'anonymised, kept for moderation records' : 'removed'})`);
    return { ok: true, anonymised: keepRow };
  }

  private async cleanupRedis(userId: string, blocks: { blockerId: string; blockedId: string }[]) {
    const m = this.redis.multi();
    for (const b of blocks) {
      const other = b.blockerId === userId ? b.blockedId : b.blockerId;
      m.srem(`mm:block:${other}`, userId);
    }
    m.del(`mm:block:${userId}`, `mm:recent:${userId}`, `mm:entry:${userId}`, `presence:sockets:${userId}`);
    m.zrem('mm:queue', userId);
    m.zrem('presence:online:v2', userId);
    await m.exec();
  }
}
