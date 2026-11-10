import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { IdentityEvent, IdentityProvider } from './identity.provider';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/** Development and test provider: no documents, no real checks. Never selectable in production. */
export class MockIdentityProvider implements IdentityProvider {
  readonly name = 'mock';

  private static secret(): string {
    return process.env.IDENTITY_MOCK_SECRET ?? 'dev-mock-secret';
  }

  static sign(raw: string | Buffer): string {
    return createHmac('sha256', MockIdentityProvider.secret()).update(raw).digest('hex');
  }

  async createSession(_userId: string) {
    const providerRef = `mock_${randomUUID()}`;
    const base = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
    return { providerRef, url: `${base}/verify-identity/mock?ref=${providerRef}` };
  }

  parseWebhook(raw: Buffer, headers: Record<string, unknown>): IdentityEvent {
    const got = String(headers[MOCK_SIGNATURE_HEADER] ?? '');
    const want = MockIdentityProvider.sign(raw);
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature');
    const body = JSON.parse(raw.toString('utf8')) as {
      eventId: string;
      providerRef: string;
      status: IdentityEvent['status'];
      reasonCode?: string;
      sex?: IdentityEvent['sex'];
      birthdate?: string;
      documentCountry?: string;
    };
    return {
      eventId: body.eventId,
      providerRef: body.providerRef,
      status: body.status,
      reasonCode: body.reasonCode,
      sex: body.sex,
      birthdate: body.birthdate ? new Date(body.birthdate) : undefined,
      documentCountry: body.documentCountry?.toUpperCase(),
    };
  }
}
