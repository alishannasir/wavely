import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AdminController } from './admin.controller';

// Phase 6 extends this with a moderation queue dashboard and
// frame-sampling content moderation API integration.
@Module({
  controllers: [ReportsController, AdminController],
  providers: [ReportsService],
})
export class ModerationModule {}
