import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Creates the first administrator: users whose email is listed in ADMIN_EMAILS (comma separated)
 * are made ADMIN when the API starts. Register that account first, then restart the API.
 * Further moderators are managed in the admin interface.
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly log = new Logger(AdminBootstrapService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const emails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!emails.length) return;
    try {
      const res = await this.prisma.user.updateMany({
        where: { email: { in: emails, mode: 'insensitive' }, role: { not: 'ADMIN' }, isGuest: false },
        data: { role: 'ADMIN' },
      });
      if (res.count) this.log.log(`Promoted ${res.count} user(s) from ADMIN_EMAILS to ADMIN`);
    } catch (err) {
      this.log.warn(`ADMIN_EMAILS bootstrap failed: ${(err as Error).message}`);
    }
  }
}
