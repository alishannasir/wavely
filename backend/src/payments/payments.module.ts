import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { StripeService } from './stripe.service';
import { EntitlementsService } from './entitlements.service';

@Module({
  controllers: [BillingController, WebhookController],
  providers: [StripeService, EntitlementsService],
  exports: [EntitlementsService, StripeService],
})
export class PaymentsModule {}
