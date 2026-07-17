import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FriendsService } from './friends.service';

const MAX_LENGTH = 2000;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  async history(userId: string, friendUserId: string, take = 50) {
    if (!(await this.friends.areFriends(userId, friendUserId))) {
      throw new ForbiddenException('You can only message friends');
    }
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendUserId },
          { senderId: friendUserId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return messages.reverse();
  }

  async create(senderId: string, receiverId: string, content: string) {
    const trimmed = content?.trim();
    if (!trimmed) throw new BadRequestException('Message is empty');
    if (trimmed.length > MAX_LENGTH) throw new BadRequestException('Message is too long');
    if (!(await this.friends.areFriends(senderId, receiverId))) {
      throw new ForbiddenException('You can only message friends');
    }
    return this.prisma.message.create({
      data: { senderId, receiverId, content: trimmed },
    });
  }
}
