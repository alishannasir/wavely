import { Controller, Get } from '@nestjs/common';
import { PresenceService } from './presence.service';

/** Public, unauthenticated: used by the landing page. Region gating still applies. */
@Controller('stats')
export class StatsController {
  constructor(private readonly presence: PresenceService) {}

  @Get('online')
  async online() {
    return { online: await this.presence.onlineCount() };
  }
}
