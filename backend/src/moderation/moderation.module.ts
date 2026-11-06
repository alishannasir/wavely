import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminController } from './admin.controller';
import { BansService } from './bans.service';
import { BanGuard } from './ban.guard';

@Module({
  controllers: [ReportsController, AdminController],
  providers: [ReportsService, BansService, { provide: APP_GUARD, useClass: BanGuard }],
  exports: [BansService, ReportsService],
})
export class ModerationModule {}
