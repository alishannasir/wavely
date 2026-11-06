import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { SkipGeo } from '../common/geo/skip-geo.decorator';
import { StripeService } from './stripe.service';

@SkipGeo()
@SkipThrottle() // Stripe retries and bursts; authenticity is checked with the signature
@Controller('billing')
export class WebhookController {
  constructor(private readonly stripe: StripeService) {}

  // No JWT guard: authenticity is verified via the Stripe signature on the raw body.
  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.stripe.handleWebhook(req.rawBody as Buffer, signature);
  }
}
