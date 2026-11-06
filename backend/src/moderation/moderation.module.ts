import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminController } from './admin.controller';
import { BansService } from './bans.service';
import { BanGuard } from './ban.guard';
import { AuditService } from './audit.service';
import { UsersAdminService } from './users-admin.service';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  controllers: [ReportsController, AdminController],
  providers: [
    ReportsService,
    BansService,
    AuditService,
    UsersAdminService,
    AdminBootstrapService,
    { provide: APP_GUARD, useClass: BanGuard },
  ],
  exports: [BansService, ReportsService, AuditService],
})
export class ModerationModule {}
