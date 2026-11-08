import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { BlocksService } from '../blocks/blocks.service';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly blocks: BlocksService,
  ) {}

  async areFriends(userA: string, userB: string): Promise<boolean> {
    const row = await this.prisma.friend.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userAId: userA, userBId: userB },
          { userAId: userB, userBId: userA },
        ],
      },
    });
    return Boolean(row);
  }

  async sendRequest(fromId: string, toId: string) {
    if (fromId === toId) throw new BadRequestException('You cannot add yourself');

    const target = await this.prisma.user.findUnique({ where: { id: toId } });
    if (!target || target.status !== 'ACTIVE') throw new NotFoundException('User not found');
    // Do not reveal who blocked whom.
    if (await this.blocks.isBlockedEitherWay(fromId, toId)) throw new ForbiddenException('You cannot add this person');

    // Friend requests are only allowed between people who have actually matched.
    const sharedSession = await this.prisma.callSession.findFirst({
      where: {
        OR: [
          { userAId: fromId, userBId: toId },
          { userAId: toId, userBId: fromId },
        ],
      },
    });
    if (!sharedSession) {
      throw new ForbiddenException('You can only add people you have chatted with');
    }

    // A asks B while B asks A would otherwise create two pending rows. One lock per pair (released when the transaction
    // ends) makes the second request see the first and accept it instead.
    const [low, high] = fromId < toId ? [fromId, toId] : [toId, fromId];
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`friend:${low}:${high}`}))`;
      const existing = await tx.friend.findFirst({
        where: {
          OR: [
            { userAId: fromId, userBId: toId },
            { userAId: toId, userBId: fromId },
          ],
        },
      });
      if (existing?.status === 'ACCEPTED') throw new ConflictException('Already friends');
      if (existing) {
        // The other side already asked: accept instead of duplicating.
        if (existing.userAId === toId) {
          return tx.friend.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
        }
        throw new ConflictException('Request already sent');
      }
      return tx.friend.create({ data: { userAId: fromId, userBId: toId, status: 'PENDING' } });
    });
  }

  async accept(requestId: string, userId: string) {
    const request = await this.prisma.friend.findUnique({ where: { id: requestId } });
    if (!request || request.userBId !== userId || request.status !== 'PENDING') {
      throw new NotFoundException('Request not found');
    }
    return this.prisma.friend.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
  }

  async decline(requestId: string, userId: string) {
    const request = await this.prisma.friend.findUnique({ where: { id: requestId } });
    if (!request || (request.userAId !== userId && request.userBId !== userId)) {
      throw new NotFoundException('Request not found');
    }
    await this.prisma.friend.delete({ where: { id: requestId } });
    return { ok: true };
  }

  async remove(userId: string, friendUserId: string) {
    const row = await this.prisma.friend.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { userAId: userId, userBId: friendUserId },
          { userAId: friendUserId, userBId: userId },
        ],
      },
    });
    if (!row) throw new NotFoundException('Friend not found');
    await this.prisma.friend.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async list(userId: string) {
    const rows = await this.prisma.friend.findMany({
      where: { status: 'ACCEPTED', OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
    });
    const friends = rows.map((row) => {
      const friend = row.userAId === userId ? row.userB : row.userA;
      return {
        userId: friend.id,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        country: friend.country,
      };
    });
    const online = await this.presence.onlineMap(friends.map((f) => f.userId));
    return friends.map((f) => ({ ...f, online: online[f.userId] ?? false }));
  }

  async incomingRequests(userId: string) {
    const rows = await this.prisma.friend.findMany({
      where: { userBId: userId, status: 'PENDING' },
      include: { userA: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      from: {
        userId: row.userA.id,
        displayName: row.userA.displayName,
        avatarUrl: row.userA.avatarUrl,
      },
    }));
  }
}
