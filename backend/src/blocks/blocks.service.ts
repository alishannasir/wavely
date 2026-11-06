import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

const key = (userId: string) => `mm:block:${userId}`;

/**
 * Block list. In effect symmetric: if either person blocked the other, they are never matched, cannot
 * add each other as friends and cannot message each other. The database is the source of truth;
 * Redis sets (`mm:block:<userId>`) mirror it for the matching script and are rebuilt at startup.
 */
@Injectable()
export class BlocksService implements OnModuleInit {
  private readonly log = new Logger(BlocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    try {
      const rows = await this.prisma.block.findMany({ select: { blockerId: true, blockedId: true }, take: 200_000 });
      const m = this.redis.multi();
      for (const r of rows) {
        m.sadd(key(r.blockerId), r.blockedId);
        m.sadd(key(r.blockedId), r.blockerId);
      }
      if (rows.length) await m.exec();
      this.log.log(`Block list loaded (${rows.length})`);
    } catch (err) {
      this.log.warn(`Could not rebuild the block mirror: ${(err as Error).message}`);
    }
  }

  async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.block.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { id: true },
    });
    return !!hit;
  }

  async block(blockerId: string, targetId: string) {
    if (blockerId === targetId) throw new BadRequestException('You cannot block yourself');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId: targetId } },
        create: { blockerId, blockedId: targetId },
        update: {},
      }),
      // Blocking ends any friendship or pending request between the two.
      this.prisma.friend.deleteMany({
        where: { OR: [{ userAId: blockerId, userBId: targetId }, { userAId: targetId, userBId: blockerId }] },
      }),
    ]);
    await this.redis.multi().sadd(key(blockerId), targetId).sadd(key(targetId), blockerId).exec();
    return { ok: true };
  }

  async unblock(blockerId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId: targetId } });
    // Keep the mirror if the other person has blocked us too.
    const reverse = await this.prisma.block.findFirst({ where: { blockerId: targetId, blockedId: blockerId }, select: { id: true } });
    if (!reverse) await this.redis.multi().srem(key(blockerId), targetId).srem(key(targetId), blockerId).exec();
    return { ok: true };
  }

  async list(blockerId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, blocked: { select: { id: true, displayName: true, country: true } } },
    });
    return rows.map((r) => ({ userId: r.blocked.id, displayName: r.blocked.displayName, country: r.blocked.country, blockedAt: r.createdAt }));
  }
}
