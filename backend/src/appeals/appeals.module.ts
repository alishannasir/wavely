import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { AppealsController } from './appeals.controller';
import { AdminAppealsController } from './admin-appeals.controller';
import { AppealsService } from './appeals.service';

@Module({
  imports: [ModerationModule],
  controllers: [AppealsController, AdminAppealsController],
  providers: [AppealsService],
  exports: [AppealsService],
})
export class AppealsModule {}
