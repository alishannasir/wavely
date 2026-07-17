import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reporterId: string, dto: CreateReportDto) {
    if (reporterId === dto.reportedUserId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        reportedUserId: dto.reportedUserId,
        sessionId: dto.sessionId,
        reasonCode: dto.reasonCode,
      },
    });

    // Auto-suspend pending human review once open reports hit the threshold.
    const threshold = parseInt(process.env.REPORT_AUTO_SUSPEND_THRESHOLD ?? '5', 10);
    const openCount = await this.prisma.report.count({
      where: { reportedUserId: dto.reportedUserId, status: 'OPEN' },
    });
    if (openCount >= threshold) {
      await this.prisma.user.updateMany({
        where: { id: dto.reportedUserId, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      });
    }

    return { id: report.id, status: report.status };
  }
}
