import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ModeratorGuard } from '../moderation/roles.guard';
import { AppealsService } from './appeals.service';

const num = () => Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)));

class AppealListQuery {
  @IsOptional() @IsIn(['OPEN', 'APPROVED', 'REJECTED']) status?: 'OPEN' | 'APPROVED' | 'REJECTED';
  @IsOptional() @num() @IsInt() @Min(0) skip?: number;
  @IsOptional() @num() @IsInt() @Min(1) @Max(100) take?: number;
}

class DecideDto {
  @IsIn(['APPROVE', 'REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('admin/appeals')
@UseGuards(AuthGuard('jwt'), ModeratorGuard)
export class AdminAppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Get()
  list(@Query() q: AppealListQuery) {
    return this.appeals.list(q.status, q.skip, q.take);
  }

  @Get('count')
  async count() {
    return { open: await this.appeals.openCount() };
  }

  @Post(':id/decide')
  decide(@Param('id') id: string, @Req() req: { user: { userId: string } }, @Body() dto: DecideDto) {
    return this.appeals.decide(req.user.userId, id, dto.decision, dto.note);
  }
}
