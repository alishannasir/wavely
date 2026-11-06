import { BansService } from './bans.service';

describe('BansService', () => {
  it('is not blocked without ip/device', async () => {
    const prisma: any = { ban: { findFirst: jest.fn() } };
    await expect(new BansService(prisma).isBlocked(null, null)).resolves.toBe(false);
    expect(prisma.ban.findFirst).not.toHaveBeenCalled();
  });
  it('is blocked when an unexpired ban matches', async () => {
    const prisma: any = { ban: { findFirst: jest.fn().mockResolvedValue({ id: 'b' }) } };
    await expect(new BansService(prisma).isBlocked('1.1.1.1', 'dev')).resolves.toBe(true);
  });
  it('bans last device and ip of a user', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ lastDeviceId: 'd', lastIp: '1.1.1.1' }) },
      ban: { upsert: jest.fn() },
    };
    await new BansService(prisma).banUserFootprint('u', 'mod', 'why');
    expect(prisma.ban.upsert).toHaveBeenCalledTimes(2);
  });
});
