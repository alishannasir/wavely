import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotGuestGuard } from '../auth/not-guest.guard';
import { MessagesService } from './messages.service';

interface AuthedRequest {
  user: { userId: string; email: string };
}

@Controller('messages')
@UseGuards(AuthGuard('jwt'), NotGuestGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get(':friendUserId')
  history(@Req() req: AuthedRequest, @Param('friendUserId') friendUserId: string) {
    return this.messages.history(req.user.userId, friendUserId);
  }
}
