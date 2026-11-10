import { UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { MOCK_SIGNATURE_HEADER, MockIdentityProvider } from './mock.provider';

function hook(body: object, sign = true) {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, headers: { [MOCK_SIGNATURE_HEADER]: sign ? MockIdentityProvider.sign(raw) : 'bad' } };
}

function setup(check: any = { id: 'v1', userId: 'u1', provider: 'mock', providerRef: 'mock_1', status: 'PENDING' }) {
  const seen = new Set<string>();
  const prisma: any = {
    identityWebhookEvent: {
      create: jest.fn(async ({ data }: any) => {
        const k = `${data.provider}:${data.eventId}`;
        if (seen.has(k)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        seen.add(k);
      }),
    },
    identityVerification: { findUnique: jest.fn(async () => check), update: jest.fn(), create: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn() },
  };
  const audit: any = { log: jest.fn() };
  const gate: any = { onIdentityResult: jest.fn() };
  return { svc: new IdentityService(prisma, audit, gate, [new MockIdentityProvider()]), prisma, audit, gate };
}

const approved = { eventId: 'e1', providerRef: 'mock_1', status: 'APPROVED', sex: 'FEMALE', birthdate: '1995-05-05', documentCountry: 'de' };

describe('identity webhook', () => {
  it('rejects a bad signature and writes nothing', async () => {
    const { svc, prisma } = setup();
    const { raw, headers } = hook(approved, false);
    await expect(svc.handleWebhook('mock', raw, headers)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('approval writes the verified fields from the document and tells the room gate', async () => {
    const { svc, prisma, gate, audit } = setup();
    const { raw, headers } = hook(approved);
    await svc.handleWebhook('mock', raw, headers);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ verifiedSex: 'FEMALE', gender: 'FEMALE' });
    expect(data.idVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.identityVerification.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', documentCountry: 'DE' });
    expect(gate.onIdentityResult).toHaveBeenCalledWith('u1');
    expect(audit.log).toHaveBeenCalledWith('SYSTEM', 'ID_RESULT', expect.anything());
  });
  it('a repeated delivery is ignored', async () => {
    const { svc, prisma } = setup();
    const { raw, headers } = hook(approved);
    await svc.handleWebhook('mock', raw, headers);
    const second = await svc.handleWebhook('mock', raw, headers);
    expect(second).toMatchObject({ duplicate: true });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });
  it('an approval for someone under 18 becomes a decline', async () => {
    const { svc, prisma } = setup();
    const year = new Date().getUTCFullYear() - 16;
    const { raw, headers } = hook({ ...approved, birthdate: `${year}-01-01` });
    await svc.handleWebhook('mock', raw, headers);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.identityVerification.update.mock.calls[0][0].data).toMatchObject({ status: 'DECLINED', reasonCode: 'UNDERAGE' });
  });
  it('an approval without a birth date is a decline', async () => {
    const { svc, prisma } = setup();
    const { raw, headers } = hook({ ...approved, birthdate: undefined });
    await svc.handleWebhook('mock', raw, headers);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.identityVerification.update.mock.calls[0][0].data.reasonCode).toBe('NO_BIRTHDATE');
  });
  it('a late event cannot change a finished check', async () => {
    const { svc, prisma } = setup({ id: 'v1', userId: 'u1', provider: 'mock', providerRef: 'mock_1', status: 'DECLINED' });
    const { raw, headers } = hook(approved);
    await svc.handleWebhook('mock', raw, headers);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.identityVerification.update).not.toHaveBeenCalled();
  });
  it('an unknown reference is ignored', async () => {
    const { svc, prisma } = setup(null);
    const { raw, headers } = hook(approved);
    expect(await svc.handleWebhook('mock', raw, headers)).toMatchObject({ ignored: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('the mock provider does not exist in production', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { svc } = setup();
      const { raw, headers } = hook(approved);
      return expect(svc.handleWebhook('mock', raw, headers)).rejects.toBeDefined();
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});
