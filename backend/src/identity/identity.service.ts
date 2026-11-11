import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../moderation/audit.service';
import { IDENTITY_PROVIDERS, IdentityProvider } from './identity.provider';
import { RoomGateService } from './room-gate.service';

const MIN_ADULT_YEARS = 18;
const olderThan = (birthdate: Date, years: number, now = new Date()) => {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
  return birthdate.getTime() <= cutoff.getTime();
};

@Injectable()
export class IdentityService {
  private readonly log = new Logger(IdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gate: RoomGateService,
    @Inject(IDENTITY_PROVIDERS) private readonly providers: IdentityProvider[],
  ) {}

  /** The provider chosen with IDENTITY_PROVIDER. The mock one can never be chosen in production. */
  active(): IdentityProvider {
    const name = (process.env.IDENTITY_PROVIDER ?? 'mock').toLowerCase();
    if (name === 'mock' && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Identity checks are not available yet.');
    }
    const p = this.providers.find((x) => x.name === name);
    if (!p) throw new BadRequestException('Identity checks are not available yet.');
    return p;
  }

  forWebhook(name: string): IdentityProvider {
    const p = this.providers.find((x) => x.name === name);
    if (!p || (p.name === 'mock' && process.env.NODE_ENV === 'production')) throw new NotFoundException();
    return p;
  }

  /** Starts a check for the signed-in person. Guests cannot verify. */
  async createSession(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isGuest) throw new BadRequestException('Create a free account first.');
    if (user.idVerifiedAt) throw new BadRequestException('You are already verified.');
    const provider = this.active();
    const { providerRef, url } = await provider.createSession(userId);
    await this.prisma.identityVerification.create({ data: { userId, provider: provider.name, providerRef } });
    return { url, providerRef };
  }

  async statusFor(userId: string) {
    const [user, latest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { idVerifiedAt: true } }),
      this.prisma.identityVerification.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      verified: !!user?.idVerifiedAt,
      verifiedAt: user?.idVerifiedAt ?? null,
      latest: latest ? { status: latest.status, reasonCode: latest.reasonCode, completedAt: latest.completedAt } : null,
    };
  }

  /**
   * The only place verified age and gender are ever written. Signature checked by the provider adapter,
   * a repeated delivery is ignored, and a finished check is never changed by a later, out-of-order event.
   */
  async handleWebhook(providerName: string, raw: Buffer, headers: Record<string, unknown>) {
    const provider = this.forWebhook(providerName);
    let event;
    try {
      event = provider.parseWebhook(raw, headers);
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }
    try {
      await this.prisma.identityWebhookEvent.create({ data: { provider: provider.name, eventId: event.eventId } });
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') return { ok: true, duplicate: true };
      throw err;
    }

    const check = await this.prisma.identityVerification.findUnique({ where: { providerRef: event.providerRef } });
    if (!check || check.provider !== provider.name) return { ok: true, ignored: true };
    if (check.status !== 'PENDING' && check.status !== 'REVIEW') return { ok: true, ignored: true };

    let status = event.status;
    let reasonCode = event.reasonCode;
    // An approval needs a birth date on the document that proves 18+; anything else is a decline.
    if (status === 'APPROVED' && (!event.birthdate || !olderThan(event.birthdate, MIN_ADULT_YEARS))) {
      status = 'DECLINED';
      reasonCode = event.birthdate ? 'UNDERAGE' : 'NO_BIRTHDATE';
    }

    const done = status === 'APPROVED' || status === 'DECLINED' || status === 'EXPIRED';
    await this.prisma.identityVerification.update({
      where: { id: check.id },
      data: {
        status,
        reasonCode,
        documentCountry: event.documentCountry,
        completedAt: done ? new Date() : null,
      },
    });
    if (status === 'APPROVED') {
      const sex = event.sex === 'MALE' || event.sex === 'FEMALE' ? event.sex : undefined;
      await this.prisma.user.update({
        where: { id: check.userId },
        data: {
          idVerifiedAt: new Date(),
          verifiedBirthdate: event.birthdate,
          verifiedSex: sex,
          // The profile now shows what the document says, and the profile form can no longer change it.
          birthdate: event.birthdate,
          ...(sex ? { gender: sex } : {}),
        },
      });
    }
    await this.audit.log('SYSTEM', 'ID_RESULT', {
      targetUserId: check.userId,
      meta: { provider: provider.name, status, reasonCode: reasonCode ?? null },
    });
    await this.gate.onIdentityResult(check.userId);
    return { ok: true };
  }
}
