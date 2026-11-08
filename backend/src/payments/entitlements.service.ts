import { Injectable } from '@nestjs/common';
import { SubscriptionPlan, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface Entitlement {
  plan: SubscriptionPlan | 'TRIAL';
  adsEnabled: boolean;
  filtersEnabled: boolean;
  dailyMinutes: number | null;
  dailyMatches: number | null;
}

const TRIAL_ENTITLEMENT: Entitlement = {
  plan: 'TRIAL',
  adsEnabled: false,
  filtersEnabled: true,
  dailyMinutes: null,
  dailyMatches: null,
};

/**
 * Premium needs an ACTIVE subscription whose paid period has not run out. Stripe renews it by sending a webhook that
 * moves `currentPeriodEnd` forward; the grace window keeps a slow or retried webhook from locking a paying user out
 * for a few minutes. It also means a missed cancellation webhook can no longer give premium forever.
 */
export const PERIOD_GRACE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async entitlementFor(user: User): Promise<Entitlement> {
    // 3-day trial: full access regardless of subscription.
    if (user.trialEndsAt.getTime() > Date.now()) return TRIAL_ENTITLEMENT;

    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        currentPeriodEnd: { gt: new Date(Date.now() - PERIOD_GRACE_MS) },
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    const plan: SubscriptionPlan = sub?.plan ?? 'FREE';

    const limits = await this.prisma.planLimit.findUnique({ where: { plan } });
    if (limits) {
      return {
        plan,
        adsEnabled: limits.adsEnabled,
        filtersEnabled: limits.filtersEnabled,
        dailyMinutes: limits.dailyMinutes,
        dailyMatches: limits.dailyMatches,
      };
    }

    // Fallback if plan_limits is not seeded; the table remains the source of truth.
    return plan === 'FREE'
      ? { plan, adsEnabled: true, filtersEnabled: false, dailyMinutes: 30, dailyMatches: 20 }
      : { plan, adsEnabled: false, filtersEnabled: true, dailyMinutes: null, dailyMatches: null };
  }

  async usageToday(userId: string) {
    const date = new Date(new Date().toISOString().slice(0, 10)); // midnight UTC
    const usage = await this.prisma.dailyUsage.findUnique({
      where: { userId_date: { userId, date } },
    });
    return { minutesUsed: usage?.minutesUsed ?? 0, matchesUsed: usage?.matchesUsed ?? 0 };
  }

  /** Milliseconds of chat time left today, or null when the plan has no minute cap. */
  async remainingMs(user: User): Promise<number | null> {
    const entitlement = await this.entitlementFor(user);
    if (entitlement.dailyMinutes === null) return null;
    const usage = await this.usageToday(user.id);
    return Math.max(0, (entitlement.dailyMinutes - usage.minutesUsed) * 60_000);
  }

  /** Server-side gate for starting a match. Never trust the client. */
  async canStartMatch(
    user: User,
  ): Promise<{ ok: true; entitlement: Entitlement } | { ok: false; reason: string }> {
    const entitlement = await this.entitlementFor(user);
    if (entitlement.dailyMinutes === null && entitlement.dailyMatches === null) {
      return { ok: true, entitlement };
    }
    const usage = await this.usageToday(user.id);
    if (entitlement.dailyMinutes !== null && usage.minutesUsed >= entitlement.dailyMinutes) {
      return { ok: false, reason: 'You have used your free chat time for today. Upgrade for unlimited chat.' };
    }
    if (entitlement.dailyMatches !== null && usage.matchesUsed >= entitlement.dailyMatches) {
      return { ok: false, reason: 'You have reached your free match limit for today. Upgrade for unlimited matches.' };
    }
    return { ok: true, entitlement };
  }
}
