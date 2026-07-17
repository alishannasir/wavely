import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString } from 'class-validator';
import { FriendsService } from './friends.service';

class SendRequestDto {
  @IsString()
  userId!: string;
}

interface AuthedRequest {
  user: { userId: string; email: string };
}

@Controller('friends')
@UseGuards(AuthGuard('jwt'))
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.friends.list(req.user.userId);
  }

  @Get('requests')
  requests(@Req() req: AuthedRequest) {
    return this.friends.incomingRequests(req.user.userId);
  }

  @Post('requests')
  send(@Req() req: AuthedRequest, @Body() dto: SendRequestDto) {
    return this.friends.sendRequest(req.user.userId, dto.userId);
  }

  @Post('requests/:id/accept')
  accept(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.friends.accept(id, req.user.userId);
  }

  @Post('requests/:id/decline')
  decline(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.friends.decline(id, req.user.userId);
  }

  @Delete(':userId')
  remove(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.friends.remove(req.user.userId, userId);
  }
}
