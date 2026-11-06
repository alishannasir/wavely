import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { CreateReportDto } from './dto/create-report.dto';

const REPORTS_PER_HOUR = 10;
const MIN_REPORTER_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const SEVERE_REASONS = ['NUDITY', 'MINOR_CONCERN'];
const WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if (reporterId === dto.reportedUserId) {
      throw new BadRequestException('You cannot report yourself');
    }

    // Reporter must have actually been in this session with the reported user.
    const session = await this.prisma.callSession.findUnique({ where: { id: dto.sessionId } });
    const participants = session ? [session.userAId, session.userBId] : [];
    if (!session || !participants.includes(reporterId) || !participants.includes(dto.reportedUserId)) {
      throw new BadRequestException('Invalid session for this report');
    }

    const key = `report:rl:${reporterId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > REPORTS_PER_HOUR) {
      throw new HttpException('Too many reports, try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    const duplicate = await this.prisma.report.findUnique({
      where: {
        reporterId_reportedUserId_sessionId: {
          reporterId,
          reportedUserId: dto.reportedUserId,
          sessionId: dto.sessionId,
        },
      },
    });
    if (duplicate) return { id: duplicate.id, status: duplicate.status };

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        reportedUserId: dto.reportedUserId,
        sessionId: dto.sessionId,
        reasonCode: dto.reasonCode,
      },
    });

    await this.maybeAutoSuspend(dto.reportedUserId);
    return { id: report.id, status: report.status };
  }

  /**
   * Weighted rule: only DISTINCT reporters whose accounts are old enough count, and only
   * severe reasons can trigger a temporary suspension. Everything else waits for a moderator.
   */
  private async maybeAutoSuspend(reportedUserId: string) {
    const threshold = parseInt(process.env.REPORT_AUTO_SUSPEND_THRESHOLD ?? '5', 10);
    const reports = await this.prisma.report.findMany({
      where: {
        reportedUserId,
        status: 'OPEN',
        reasonCode: { in: SEVERE_REASONS as any },
        createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
        reporter: { createdAt: { lte: new Date(Date.now() - MIN_REPORTER_ACCOUNT_AGE_MS) } },
      },
      select: { reporterId: true },
    });
    const distinct = new Set(reports.map((r) => r.reporterId)).size;
    if (distinct >= threshold) {
      await this.prisma.user.updateMany({
        where: { id: reportedUserId, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });
    }
  }

  // ---- Moderator review queue ----

  listForReview(status: 'OPEN' | 'REVIEWING' | 'RESOLVED' = 'OPEN', take = 50) {
    return this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: Math.min(take, 100),
      include: {
        reported: { select: { id: true, displayName: true, status: true, country: true } },
        reporter: { select: { id: true, displayName: true, createdAt: true } },
      },
    });
  }

  async resolve(
    reportId: string,
    moderatorId: string,
    action: 'DISMISS' | 'SUSPEND' | 'BAN' | 'RESTORE',
  ) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.reportedUserId === moderatorId) {
      throw new ForbiddenException('Cannot moderate reports about yourself');
    }

    const userStatus =
      action === 'SUSPEND' ? 'SUSPENDED' : action === 'BAN' ? 'BANNED' : action === 'RESTORE' ? 'ACTIVE' : null;

    await this.prisma.$transaction([
      this.prisma.report.updateMany({
        where: { reportedUserId: report.reportedUserId, status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', reviewedById: moderatorId, reviewedAt: new Date(), resolution: action },
      }),
      ...(userStatus
        ? [this.prisma.user.update({ where: { id: report.reportedUserId }, data: { status: userStatus } })]
        : []),
    ]);
    return { ok: true, action };
  }
}
