import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';

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
