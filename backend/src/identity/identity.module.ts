import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { IDENTITY_PROVIDERS } from './identity.provider';
import { MockIdentityProvider } from './mock.provider';
import { RoomGateService } from './room-gate.service';

@Module({
  imports: [ModerationModule],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    RoomGateService,
    // Real providers (Persona, Veriff, Stripe Identity) are added to this list later.
    { provide: IDENTITY_PROVIDERS, useFactory: () => [new MockIdentityProvider()] },
  ],
  exports: [RoomGateService, IdentityService],
})
export class IdentityModule {}
