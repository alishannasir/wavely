import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { ModeratorGuard } from './roles.guard';
import { ResolveReportDto } from './dto/resolve-report.dto';

@Controller('admin/reports')
@UseGuards(AuthGuard('jwt'), ModeratorGuard)
export class AdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@Query('status') status?: 'OPEN' | 'REVIEWING' | 'RESOLVED') {
    return this.reports.listForReview(status ?? 'OPEN');
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Req() req: { user: { userId: string } }, @Body() dto: ResolveReportDto) {
    return this.reports.resolve(id, req.user.userId, dto.action);
  }
}
