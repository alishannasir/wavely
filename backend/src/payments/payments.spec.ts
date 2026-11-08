import { ConflictException } from '@nestjs/common';
import { EntitlementsService, PERIOD_GRACE_MS } from './entitlements.service';
import { StripeService } from './stripe.service';

const DAY = 86_400_000;
const user: any = { id: 'u', email: 'a@b.co', trialEndsAt: new Date(Date.now() - DAY) };

describe('premium needs a paid period that has not run out', () => {
  function entitlements(sub: any = null) {
    const prisma: any = {
      subscription: { findFirst: jest.fn().mockResolvedValue(sub) },
      planLimit: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    return { svc: new EntitlementsService(prisma), prisma };
  }
  it('asks only for ACTIVE subscriptions whose period ended no longer than the grace window ago', async () => {
    const { svc, prisma } = entitlements({ plan: 'MONTHLY' });
    await svc.entitlementFor(user);
    const where = prisma.subscription.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('ACTIVE');
    const cutoff: Date = where.currentPeriodEnd.gt;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(PERIOD_GRACE_MS - 1000);
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(PERIOD_GRACE_MS + 1000);
  });
  it('a live subscription is premium; none (or an expired one, filtered out by that query) is free', async () => {
    expect((await entitlements({ plan: 'MONTHLY' }).svc.entitlementFor(user)).plan).toBe('MONTHLY');
    expect((await entitlements(null).svc.entitlementFor(user)).plan).toBe('FREE');
  });
});

describe('checkout', () => {
  function stripe(opts: { live?: any; known?: any } = {}) {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      subscription: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
          where.status === 'ACTIVE' ? opts.live ?? null : opts.known ?? null),
      },
    };
    const svc = new StripeService(prisma);
    const create = jest.fn().mockResolvedValue({ url: 'https://stripe/session' });
    (svc as any).stripe = { checkout: { sessions: { create } } };
    return { svc, create };
  }
  it('refuses a second checkout while a subscription is live (no double billing)', async () => {
    const { svc, create } = stripe({ live: { id: 's1' } });
    await expect(svc.createCheckout('u', 'MONTHLY')).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
  it('reuses the Stripe customer the user already has, instead of a customer_email', async () => {
    const { svc, create } = stripe({ known: { stripeCustomerId: 'cus_1' } });
    await svc.createCheckout('u', 'MONTHLY');
    const args = create.mock.calls[0][0];
    expect(args.customer).toBe('cus_1');
    expect(args.customer_email).toBeUndefined();
  });
  it('a first-time buyer is identified by email', async () => {
    const { svc, create } = stripe();
    await svc.createCheckout('u', 'ANNUAL');
    const args = create.mock.calls[0][0];
    expect(args.customer).toBeUndefined();
    expect(args.customer_email).toBe('a@b.co');
  });
});
