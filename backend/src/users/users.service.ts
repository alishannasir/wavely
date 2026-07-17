import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitize(user: User) {
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    let birthdate: Date | undefined;
    if (dto.birthdate) {
      birthdate = new Date(dto.birthdate);
      AuthService.assertAdult(birthdate); // server-side 18+ gate, also for OAuth signups
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        gender: dto.gender,
        avatarUrl: dto.avatarUrl,
        birthdate,
      },
    });
    return this.sanitize(user);
  }
}
