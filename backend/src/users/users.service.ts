import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { sanitizeUser } from '../account/session-token.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitize(user: User) {
    return sanitizeUser(user);
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async acceptRules(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { rulesAcceptedAt: new Date() },
    });
    return this.sanitize(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new NotFoundException('User not found');
    // After an identity check, date of birth and gender come from the document and cannot be edited here.
    if (current.idVerifiedAt) {
      const sameDay = (a?: Date | null, b?: string) => !!a && !!b && a.toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
      const changesBirthdate = dto.birthdate !== undefined && !sameDay(current.birthdate, dto.birthdate);
      const changesGender = dto.gender !== undefined && dto.gender !== current.gender;
      if (changesBirthdate || changesGender) {
        throw new BadRequestException('Your date of birth and gender come from your verified ID and cannot be changed.');
      }
    }
    let birthdate: Date | undefined;
    if (dto.birthdate) {
      birthdate = new Date(dto.birthdate);
      AuthService.assertAdult(birthdate); // server-side 18+ gate, also for OAuth signups
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        gender: current.idVerifiedAt ? undefined : dto.gender,
        avatarUrl: dto.avatarUrl,
        birthdate: current.idVerifiedAt ? undefined : birthdate,
      },
    });
    return this.sanitize(user);
  }
}
