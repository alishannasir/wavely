import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { primaryFrontendUrl } from '../common/cors';
import Stripe from 'stripe';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

  constructor(private readonly prisma: PrismaService) {}

  private priceFor(plan: 'MONTHLY' | 'ANNUAL'): string {
    return (
      (plan === 'MONTHLY' ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_ANNUAL) ?? ''
    );
  }

  private planForPrice(priceId?: string): SubscriptionPlan {
    return priceId === process.env.STRIPE_PRICE_ANNUAL ? 'ANNUAL' : 'MONTHLY';
  }

  async createCheckout(userId: string, plan: 'MONTHLY' | 'ANNUAL') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const frontend = primaryFrontendUrl();
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: this.priceFor(plan), quantity: 1 }],
      client_reference_id: userId,
      customer_email: user.email ?? undefined,
      success_url: `${frontend}/home?billing=success`,
      cancel_url: `${frontend}/upgrade?billing=cancelled`,
      metadata: { userId, plan },
    });
    return { url: session.url };
  }

  async createPortal(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, stripeCustomerId: { not: null } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (!sub?.stripeCustomerId) throw new NotFoundException('No billing account yet');
    const frontend = primaryFrontendUrl();
    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${frontend}/home`,
    });
    return { url: session.url };
  }

  /** Webhooks are the source of truth for the subscriptions table. */
  async handleWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        const subscriptionId = session.subscription as string | null;
        if (!userId || !subscriptionId) break;
        const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
        await this.upsertSubscription(userId, sub);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const existing = await this.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: sub.id },
        });
        if (existing) await this.upsertSubscription(existing.userId, sub);
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
    return { received: true };
  }

  private async upsertSubscription(userId: string, sub: Stripe.Subscription) {
    const status =
      sub.status === 'active' || sub.status === 'trialing'
        ? 'ACTIVE'
        : sub.status === 'past_due'
          ? 'PAST_DUE'
          : 'CANCELED';
    const plan = this.planForPrice(sub.items.data[0]?.price?.id);
    await this.prisma.subscription.upsert({
      where: { stripeSubscriptionId: sub.id },
      create: {
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan,
        status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
      update: { status, plan, currentPeriodEnd: new Date(sub.current_period_end * 1000) },
    });
  }
}
