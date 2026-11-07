import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { DataRightsService } from '../account/data-rights.service';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface AuthedRequest {
  user: { userId: string; email: string };
}

class DeleteAccountDto {
  @IsOptional() @IsString() @MaxLength(200) password?: string;
  @IsOptional() @IsString() @MaxLength(20) confirm?: string;
}

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly dataRights: DataRightsService,
  ) {}

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.users.findMe(req.user.userId);
  }

  @Post('me/accept-rules')
  acceptRules(@Req() req: AuthedRequest) {
    return this.users.acceptRules(req.user.userId);
  }

  /** Download everything we hold about you, as a JSON file. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('me/export')
  async export(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const data = await this.dataRights.exportData(req.user.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    return data;
  }

  /** Delete the account. Needs the password (or typing DELETE for accounts without one). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('me/delete')
  delete(@Req() req: AuthedRequest, @Body() dto: DeleteAccountDto) {
    return this.dataRights.deleteAccount(req.user.userId, dto);
  }

  @Patch('me')
  update(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(req.user.userId, dto);
  }
}
