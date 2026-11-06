import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;
// IPs are shared (NAT, mobile carriers), so IP bans expire quickly. Device IDs are per-browser.
const IP_BAN_MS = 7 * DAY;
const DEVICE_BAN_MS = 90 * DAY;

@Injectable()
export class BansService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlocked(ip: string | null, deviceId: string | null): Promise<boolean> {
    const or: { type: 'IP' | 'DEVICE'; value: string }[] = [];
    if (ip) or.push({ type: 'IP', value: ip });
    if (deviceId) or.push({ type: 'DEVICE', value: deviceId });
    if (!or.length) return false;
    const hit = await this.prisma.ban.findFirst({
      where: { OR: or, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] },
      select: { id: true },
    });
    return !!hit;
  }

  /** Bans the last-seen device and IP of a user (called when a moderator bans the account). */
  async banUserFootprint(userId: string, moderatorId: string, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastDeviceId: true, lastIp: true },
    });
    if (!user) return;
    const now = Date.now();
    const rows: { type: 'IP' | 'DEVICE'; value: string; expiresAt: Date }[] = [];
    if (user.lastDeviceId) rows.push({ type: 'DEVICE', value: user.lastDeviceId, expiresAt: new Date(now + DEVICE_BAN_MS) });
    if (user.lastIp) rows.push({ type: 'IP', value: user.lastIp, expiresAt: new Date(now + IP_BAN_MS) });
    for (const r of rows) {
      await this.prisma.ban.upsert({
        where: { type_value: { type: r.type, value: r.value } },
        create: { ...r, reason, createdById: moderatorId },
        update: { expiresAt: r.expiresAt, reason, createdById: moderatorId },
      });
    }
  }

  /** Lifts device/IP bans tied to a user (used when a moderator restores the account). */
  async liftUserFootprint(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastDeviceId: true, lastIp: true },
    });
    if (!user) return;
    const or: { type: 'IP' | 'DEVICE'; value: string }[] = [];
    if (user.lastDeviceId) or.push({ type: 'DEVICE', value: user.lastDeviceId });
    if (user.lastIp) or.push({ type: 'IP', value: user.lastIp });
    if (or.length) await this.prisma.ban.deleteMany({ where: { OR: or } });
  }
}
