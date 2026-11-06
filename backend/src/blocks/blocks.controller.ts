import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString } from 'class-validator';
import { BlocksService } from './blocks.service';

class BlockDto {
  @IsString()
  userId!: string;
}

@Controller('blocks')
@UseGuards(AuthGuard('jwt'))
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.blocks.list(req.user.userId);
  }

  @Post()
  block(@Req() req: { user: { userId: string } }, @Body() dto: BlockDto) {
    return this.blocks.block(req.user.userId, dto.userId);
  }

  @Delete(':userId')
  unblock(@Req() req: { user: { userId: string } }, @Param('userId') userId: string) {
    return this.blocks.unblock(req.user.userId, userId);
  }
}
