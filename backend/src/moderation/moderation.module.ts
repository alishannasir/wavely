import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// Phase 6 extends this with a moderation queue dashboard and
// frame-sampling content moderation API integration.
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ModerationModule {}
