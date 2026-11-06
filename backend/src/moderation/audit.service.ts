import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'REPORT_RESOLVED'
  | 'REPORT_ESCALATED'
  | 'HOLD_RELEASED'
  | 'USER_STATUS'
  | 'ROLE_CHANGED';

/** Append-only record of what moderators and admins did. The app never edits or deletes entries. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(actorId: string, action: AuditAction, data: { targetUserId?: string; reportId?: string; meta?: Prisma.InputJsonValue } = {}) {
    return this.prisma.auditLog.create({
      data: { actorId, action, targetUserId: data.targetUserId, reportId: data.reportId, meta: data.meta },
    });
  }

  async list(filter: { action?: string; targetUserId?: string; reportId?: string; skip?: number; take?: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.targetUserId ? { targetUserId: filter.targetUserId } : {}),
      ...(filter.reportId ? { reportId: filter.reportId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filter.skip ?? 0,
        take: Math.min(filter.take ?? 50, 100),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    // Resolve actor names for display
    const ids = [...new Set(items.map((i) => i.actorId))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true } });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return { total, items: items.map((i) => ({ ...i, actor: byId.get(i.actorId) ?? null })) };
  }
}
