import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { SkipBanCheck } from '../moderation/skip-ban.decorator';
import { NormalizeEmail } from '../common/normalize';
import { AppealsService } from './appeals.service';

class LookupDto {
  @NormalizeEmail() @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(200) password!: string;
}

class CreateAppealDto extends LookupDto {
  @IsOptional() @IsString() @MaxLength(5000) message?: string;
}

/** Public: a suspended or banned user cannot log in, so they prove who they are with email + password. */
@SkipBanCheck()
@Throttle({ default: { limit: 8, ttl: 60_000 } })
@Controller('appeals')
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Post('lookup')
  lookup(@Body() dto: LookupDto) {
    return this.appeals.lookup(dto.email, dto.password);
  }

  @Post()
  create(@Body() dto: CreateAppealDto) {
    return this.appeals.create(dto.email, dto.password, dto.message ?? '');
  }
}
