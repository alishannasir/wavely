import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MatchingGateway } from './matching.gateway';
import { MatchingService } from './matching.service';
import { LivekitService } from './livekit.service';
import { PaymentsModule } from '../payments/payments.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    }),
    PaymentsModule,
    FriendsModule,
  ],
  providers: [MatchingGateway, MatchingService, LivekitService],
})
export class MatchingModule {}
