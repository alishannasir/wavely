import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchingModule } from './matching/matching.module';
import { FriendsModule } from './friends/friends.module';
import { PaymentsModule } from './payments/payments.module';
import { ModerationModule } from './moderation/moderation.module';
import { BlocksModule } from './blocks/blocks.module';
import { AppealsModule } from './appeals/appeals.module';
import { MailModule } from './mail/mail.module';
import { IdentityModule } from './identity/identity.module';
import { GeoMiddleware } from './common/geo/geo.middleware';
import { GeoGuard } from './common/geo/geo.guard';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler.guard';
import { CsrfOriginGuard } from './common/csrf-origin.guard';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    // Per-IP limit for HTTP (in memory, so per API instance). Auth routes have stricter limits.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: parseInt(process.env.THROTTLE_LIMIT || '120', 10) }],
      errorMessage: 'Too many requests. Please wait a minute and try again.',
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    MatchingModule,
    FriendsModule,
    PaymentsModule,
    ModerationModule,
    BlocksModule,
    AppealsModule,
    MailModule,
    IdentityModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: GeoGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GeoMiddleware).forRoutes('*');
  }
}
