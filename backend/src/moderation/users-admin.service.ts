import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { kickUser } from '../common/user-kick';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { BansService } from './bans.service';

const SAFE_USER = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  role: true,
  isGuest: true,
  country: true,
  gender: true,
  createdAt: true,
  flaggedUntil: true,
  lastIp: true,
  lastDeviceId: true,
} as const;

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bans: BansService,
    private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Finds users by id, email, display name, or an IP / device id they were last seen with. */
  search(q: string) {
    const term = q.trim();
    if (!term) return [];
    return this.prisma.user.findMany({
      where: {
        OR: [
          { id: term },
          { email: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
          { lastIp: term },
          { lastDeviceId: term },
        ],
      },
      select: SAFE_USER,
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  }

  async detail(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER });
    if (!user) throw new NotFoundException('User not found');
    const footprint = [user.lastIp, user.lastDeviceId].filter((v): v is string => !!v);
    const [reportsReceived, reportsMade, recentReports, bans, audit] = await Promise.all([
      this.prisma.report.groupBy({ by: ['status'], where: { reportedUserId: userId }, _count: true }),
      this.prisma.report.count({ where: { reporterId: userId } }),
      this.prisma.report.findMany({
        where: { reportedUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, reasonCode: true, status: true, source: true, createdAt: true, legalHold: true, resolution: true },
      }),
      footprint.length
        ? this.prisma.ban.findMany({ where: { value: { in: footprint } } })
        : Promise.resolve([]),
      this.audit.list({ targetUserId: userId, take: 20 }),
    ]);
    return {
      user,
      reportsReceived: reportsReceived.map((r) => ({ status: r.status, count: r._count })),
      reportsMade,
      recentReports,
      bans,
      audit: audit.items,
    };
  }

  async setStatus(actor: { userId: string; role: string }, userId: string, action: 'SUSPEND' | 'BAN' | 'RESTORE', note?: string) {
    if (actor.userId === userId) throw new BadRequestException('You cannot change your own status');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, role: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN' && actor.role !== 'ADMIN') throw new ForbiddenException('Only an administrator can act on an administrator');

    const to = action === 'SUSPEND' ? 'SUSPENDED' : action === 'BAN' ? 'BANNED' : 'ACTIVE';
    if (action === 'BAN') await this.bans.banUserFootprint(userId, actor.userId, note ?? 'manual ban');
    if (action === 'RESTORE') await this.bans.liftUserFootprint(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { status: to, flaggedUntil: null } });
    if (to !== 'ACTIVE') await kickUser(this.redis, userId); // drop their live chat, call and queue entry now
    await this.audit.log(actor.userId, 'USER_STATUS', { targetUserId: userId, meta: { from: user.status, to, note: note ?? null } });
    return { ok: true, status: to };
  }

  async setRole(adminId: string, userId: string, role: 'USER' | 'MODERATOR' | 'ADMIN') {
    if (adminId === userId) throw new BadRequestException('You cannot change your own role (it would risk locking everyone out)');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isGuest: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isGuest && role !== 'USER') throw new BadRequestException('Guests cannot be moderators');
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
    await this.audit.log(adminId, 'ROLE_CHANGED', { targetUserId: userId, meta: { from: user.role, to: role } });
    return { ok: true, role };
  }
}
