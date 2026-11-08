import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { UsersAdminService } from './users-admin.service';
import { AuditService } from './audit.service';
import { AdminGuard, ModeratorGuard } from './roles.guard';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { AuditQuery, EscalateDto, ReportListQuery, SetRoleDto, UserSearchQuery, UserStatusDto } from './dto/admin.dto';

type Authed = { user: { userId: string; role: string } };

/** Moderator API. Everything here needs the MODERATOR or ADMIN role; a few actions need ADMIN. */
@Controller('admin')
@UseGuards(AuthGuard('jwt'), ModeratorGuard)
export class AdminController {
  constructor(
    private readonly reports: ReportsService,
    private readonly users: UsersAdminService,
    private readonly audit: AuditService,
  ) {}

  // ---- reports ----
  @Get('reports')
  list(@Query() q: ReportListQuery) {
    return this.reports.listForReview(q);
  }

  @Get('reports/counts')
  counts() {
    return this.reports.counts();
  }

  @Get('reports/:id')
  detail(@Param('id') id: string) {
    return this.reports.detail(id);
  }

  @Post('reports/:id/resolve')
  resolve(@Param('id') id: string, @Req() req: Authed, @Body() dto: ResolveReportDto) {
    return this.reports.resolve(id, req.user.userId, dto.action, req.user.role);
  }

  @Post('reports/:id/escalate')
  escalate(@Param('id') id: string, @Req() req: Authed, @Body() dto: EscalateDto) {
    return this.reports.escalate(id, req.user.userId, dto.note);
  }

  @UseGuards(AdminGuard)
  @Post('reports/:id/release-hold')
  releaseHold(@Param('id') id: string, @Req() req: Authed) {
    return this.reports.releaseHold(id, req.user.userId);
  }

  // ---- users ----
  @Get('users')
  searchUsers(@Query() q: UserSearchQuery) {
    return this.users.search(q.q);
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @Post('users/:id/status')
  setStatus(@Param('id') id: string, @Req() req: Authed, @Body() dto: UserStatusDto) {
    return this.users.setStatus(req.user, id, dto.action, dto.note);
  }

  @UseGuards(AdminGuard)
  @Post('users/:id/role')
  setRole(@Param('id') id: string, @Req() req: Authed, @Body() dto: SetRoleDto) {
    return this.users.setRole(req.user.userId, id, dto.role);
  }

  // ---- audit ----
  @Get('audit')
  auditLog(@Query() q: AuditQuery) {
    return this.audit.list(q);
  }
}
