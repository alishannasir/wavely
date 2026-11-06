import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BansService } from './bans.service';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { CreateReportDto } from './dto/create-report.dto';

const REPORTS_PER_HOUR = 10;
const MIN_REPORTER_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const SEVERE_REASONS = ['NUDITY', 'MINOR_CONCERN'];
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = DAY_MS;
const FLAG_THRESHOLD = 3;
/** Evidence for reports that led to a suspension/ban is kept longer (default 90 days). */
function actionedRetentionDays(): number {
  const n = parseInt(process.env.EVIDENCE_ACTIONED_RETENTION_DAYS ?? '90', 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}
const AUTO_REPORTS_PER_HOUR = 30;
const EVIDENCE_IMAGE_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function retentionDays(): number {
  const n = parseInt(process.env.EVIDENCE_RETENTION_DAYS ?? '30', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly bans: BansService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.purgeTimer = setInterval(() => void this.purgeExpiredEvidence().catch(() => undefined), 60 * 60 * 1000);
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  /** Retention: evidence is deleted EVIDENCE_RETENTION_DAYS (default 30) after the report. */
  async purgeExpiredEvidence() {
    return this.prisma.report.updateMany({
      where: {
        evidenceExpiresAt: { lt: new Date() },
        // Never delete evidence under legal hold, or of a possible-minor report nobody has decided yet.
        legalHold: false,
        NOT: { reasonCode: 'MINOR_CONCERN', status: { not: 'RESOLVED' } },
      },
      data: { evidenceImage: null, chatLog: Prisma.DbNull, evidenceExpiresAt: null },
    });
  }

  /**
   * Automatic report raised by the viewer's on-device NSFW classifier. It goes through the same
   * checks as a manual report (real session, one per reporter/target/session, rate limit), so a
   * modified client cannot do more damage than a malicious reporter could.
   */
  async createAutoNsfw(
    reporterId: string,
    peerUserId: string,
    sessionId: string,
    score: number,
    evidenceImage?: string,
  ) {
    return this.create(
      reporterId,
      {
        reportedUserId: peerUserId,
        sessionId,
        reasonCode: 'NUDITY',
        evidenceImage: EVIDENCE_IMAGE_RE.test(evidenceImage ?? '') && (evidenceImage?.length ?? 0) <= 600_000 ? evidenceImage : undefined,
      },
      { source: 'AUTO_NSFW', nsfwScore: Math.min(1, Math.max(0, score)) },
    );
  }

  async create(
    reporterId: string,
    dto: CreateReportDto,
    meta?: { source: 'AUTO_NSFW'; nsfwScore: number },
  ) {
    if (reporterId === dto.reportedUserId) {
      throw new BadRequestException('You cannot report yourself');
    }

    // Reporter must have actually been in this session with the reported user.
    const session = await this.prisma.callSession.findUnique({ where: { id: dto.sessionId } });
    const participants = session ? [session.userAId, session.userBId] : [];
    if (!session || !participants.includes(reporterId) || !participants.includes(dto.reportedUserId)) {
      throw new BadRequestException('Invalid session for this report');
    }

    const key = `report:rl:${meta ? 'auto:' : ''}${reporterId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > (meta ? AUTO_REPORTS_PER_HOUR : REPORTS_PER_HOUR)) {
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
    // The chat log comes from the server's own record of the call, never from the client.
    const chatLog = await this.chatLogFor(dto.sessionId, reporterId);

    if (duplicate) {
      // A person's own report must not be lost behind an earlier automatic one for the same call:
      // upgrade it (the reporter's reason + evidence win over the classifier's guess).
      if (!meta && duplicate.source === 'AUTO_NSFW') {
        const evidenceImage = dto.evidenceImage ?? duplicate.evidenceImage;
        await this.prisma.report.update({
          where: { id: duplicate.id },
          data: {
            source: 'USER',
            reasonCode: dto.reasonCode,
            evidenceImage,
            chatLog: chatLog.length ? (chatLog as any) : undefined,
            evidenceExpiresAt:
              evidenceImage || chatLog.length ? new Date(Date.now() + retentionDays() * DAY_MS) : null,
          },
        });
        await this.maybeFlag(dto.reportedUserId);
        await this.maybeAutoSuspend(dto.reportedUserId);
      }
      return { id: duplicate.id, status: duplicate.status };
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        reportedUserId: dto.reportedUserId,
        sessionId: dto.sessionId,
        reasonCode: dto.reasonCode,
        source: meta?.source ?? 'USER',
        nsfwScore: meta?.nsfwScore,
        evidenceImage: dto.evidenceImage,
        chatLog: chatLog.length ? (chatLog as any) : undefined,
        evidenceExpiresAt:
          dto.evidenceImage || chatLog.length ? new Date(Date.now() + retentionDays() * DAY_MS) : null,
      },
    });

    await this.maybeFlag(dto.reportedUserId);
    await this.maybeAutoSuspend(dto.reportedUserId);
    return { id: report.id, status: report.status };
  }

  private async chatLogFor(sessionId: string, reporterId: string) {
    const raw = await this.redis.lrange(`call:chat:${sessionId}`, 0, -1);
    return raw.flatMap((r) => {
      try {
        const l = JSON.parse(r) as { userId: string; text: string; at: number };
        return [{ from: l.userId === reporterId ? 'reporter' : 'reported', text: l.text, at: l.at }];
      } catch {
        return [];
      }
    }).sort((a, b) => a.at - b.at); // messages sent at almost the same moment can be stored out of order
  }

  /**
   * Shadow queue: enough distinct, aged reporters (any reason) in 24h means the user is only
   * matched with other flagged users for the next 24h, pending moderator review.
   */
  private async maybeFlag(reportedUserId: string) {
    const reports = await this.prisma.report.findMany({
      where: {
        reportedUserId,
        status: 'OPEN',
        createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
        reporter: { createdAt: { lte: new Date(Date.now() - MIN_REPORTER_ACCOUNT_AGE_MS) } },
      },
      select: { reporterId: true },
    });
    if (new Set(reports.map((r) => r.reporterId)).size >= FLAG_THRESHOLD) {
      await this.prisma.user.update({
        where: { id: reportedUserId },
        data: { flaggedUntil: new Date(Date.now() + DAY_MS) },
      });
    }
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
        // Only reports filed by people can suspend. The on-device classifier (AUTO_NSFW) can flag a
        // user into the shadow queue, but it makes mistakes and can be spoofed, so a moderator decides.
        source: 'USER',
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

  async listForReview(filter: {
    status?: 'OPEN' | 'REVIEWING' | 'RESOLVED';
    reason?: string;
    source?: string;
    hold?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.ReportWhereInput = {
      status: filter.status ?? 'OPEN',
      ...(filter.reason ? { reasonCode: filter.reason as any } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.hold === 'true' ? { legalHold: true } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        // Serious reasons first, then oldest first
        orderBy: [{ legalHold: 'desc' }, { createdAt: 'asc' }],
        skip: filter.skip ?? 0,
        take: Math.min(filter.take ?? 50, 100),
        select: {
          id: true,
          reasonCode: true,
          status: true,
          createdAt: true,
          sessionId: true,
          source: true,
          nsfwScore: true,
          legalHold: true,
          evidenceExpiresAt: true,
          reported: { select: { id: true, displayName: true, status: true, country: true, flaggedUntil: true } },
          reporter: { select: { id: true, displayName: true, createdAt: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    return { total, items };
  }

  async counts() {
    const [open, reviewing, hold, minor] = await Promise.all([
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.report.count({ where: { status: 'REVIEWING' } }),
      this.prisma.report.count({ where: { legalHold: true } }),
      this.prisma.report.count({ where: { status: { not: 'RESOLVED' }, reasonCode: 'MINOR_CONCERN' } }),
    ]);
    return { open, reviewing, legalHold: hold, openMinorConcern: minor };
  }

  async detail(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reported: { select: { id: true, displayName: true, status: true, country: true, flaggedUntil: true, createdAt: true, isGuest: true } },
        reporter: { select: { id: true, displayName: true, createdAt: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    const [history, auditTrail] = await Promise.all([
      this.prisma.report.groupBy({ by: ['status'], where: { reportedUserId: report.reportedUserId }, _count: true }),
      this.audit.list({ reportId, take: 50 }),
    ]);
    return { ...report, reportedUserReportCounts: history.map((h) => ({ status: h.status, count: h._count })), audit: auditTrail.items };
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

    if (action === 'BAN') {
      await this.bans.banUserFootprint(report.reportedUserId, moderatorId, `report ${reportId}`);
    } else if (action === 'RESTORE') {
      await this.bans.liftUserFootprint(report.reportedUserId);
    }

    const open = await this.prisma.report.findMany({
      where: { reportedUserId: report.reportedUserId, status: { not: 'RESOLVED' } },
      select: { id: true },
    });
    const now = new Date();
    // Evidence behind an actual suspension/ban is kept longer than the default.
    const keepUntil =
      action === 'SUSPEND' || action === 'BAN' ? new Date(now.getTime() + actionedRetentionDays() * DAY_MS) : undefined;

    await this.prisma.$transaction([
      this.prisma.report.updateMany({
        where: { id: { in: open.map((r) => r.id) } },
        data: {
          status: 'RESOLVED',
          reviewedById: moderatorId,
          reviewedAt: now,
          resolution: action,
        },
      }),
      // Longer retention for actioned reports, but never touch evidence under legal hold.
      ...(keepUntil
        ? [
            this.prisma.report.updateMany({
              where: { id: { in: open.map((r) => r.id) }, legalHold: false },
              data: { evidenceExpiresAt: keepUntil },
            }),
          ]
        : []),
      this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: userStatus ? { status: userStatus, flaggedUntil: null } : { flaggedUntil: null },
      }),
    ]);
    await this.audit.log(moderatorId, 'REPORT_RESOLVED', {
      targetUserId: report.reportedUserId,
      reportId,
      meta: { action, reportsResolved: open.length },
    });
    return { ok: true, action };
  }

  /**
   * Escalation: the evidence is put under legal hold (never purged) so it can be preserved and
   * reported to the proper authority (e.g. NCMEC / IWF). Filing the report is a manual step.
   */
  async escalate(reportId: string, moderatorId: string, note?: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        legalHold: true,
        escalatedAt: new Date(),
        escalatedById: moderatorId,
        escalationNote: note ?? null,
        evidenceExpiresAt: null,
        status: report.status === 'OPEN' ? 'REVIEWING' : report.status,
      },
    });
    await this.audit.log(moderatorId, 'REPORT_ESCALATED', { targetUserId: report.reportedUserId, reportId, meta: { note: note ?? null } });
    return { ok: true, legalHold: true };
  }

  /** Administrators only: ends the hold; the normal retention period then applies again. */
  async releaseHold(reportId: string, adminId: string) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (!report.legalHold) return { ok: true, legalHold: false };
    await this.prisma.report.update({
      where: { id: reportId },
      data: { legalHold: false, evidenceExpiresAt: new Date(Date.now() + retentionDays() * DAY_MS) },
    });
    await this.audit.log(adminId, 'HOLD_RELEASED', { targetUserId: report.reportedUserId, reportId });
    return { ok: true, legalHold: false };
  }
}
