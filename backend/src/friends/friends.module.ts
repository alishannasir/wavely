import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { PresenceService } from './presence.service';
import { StatsController } from './stats.controller';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  controllers: [FriendsController, MessagesController, StatsController],
  providers: [FriendsService, PresenceService, MessagesService],
  exports: [FriendsService, PresenceService, MessagesService],
})
export class FriendsModule {}
