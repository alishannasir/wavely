import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requireJwtSecret } from '../config/jwt.config';
import { JwtModule } from '@nestjs/jwt';
import { MatchingGateway } from './matching.gateway';
import { MatchingService } from './matching.service';
import { LivekitService } from './livekit.service';
import { PaymentsModule } from '../payments/payments.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireJwtSecret(config.get<string>('JWT_SECRET')),
      }),
    }),
    PaymentsModule,
    FriendsModule,
  ],
  providers: [MatchingGateway, MatchingService, LivekitService],
})
export class MatchingModule {}
