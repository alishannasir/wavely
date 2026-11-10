import { RoomGateService, isVerifiedAdult } from './room-gate.service';

const adultDob = new Date('1990-01-01');
const verified = { id: 'x', idVerifiedAt: new Date(), verifiedBirthdate: adultDob };

function setup(opts: { kind?: string; users?: any[]; docs?: any[]; existing?: any } = {}) {
  const store = new Map<string, string>();
  let gate: any = opts.existing ?? null;
  const prisma: any = {
    callSession: { findUnique: jest.fn().mockResolvedValue({ kind: opts.kind ?? 'FRIEND', userAId: 'a', userBId: 'b', endedAt: null }) },
    roomGate: {
      findUnique: jest.fn(async () => gate),
      create: jest.fn(async ({ data }: any) => {
        if (gate) throw Object.assign(new Error('dup'), { code: 'P2002' });
        gate = { id: 'g1', pausedAt: new Date(), ...data };
        return gate;
      }),
      findMany: jest.fn(async () => (gate && gate.state === 'PAUSED_VERIFY' ? [gate] : [])),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!gate || gate.id !== where.id || gate.state !== where.state) return { count: 0 };
        gate = { ...gate, ...data };
        return { count: 1 };
      }),
    },
    user: { findMany: jest.fn(async () => opts.users ?? []) },
    identityVerification: {
      findMany: jest.fn(async () => opts.docs ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const redis: any = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  };
  const audit: any = { log: jest.fn() };
  const svc = new RoomGateService(prisma, redis, audit);
  const events: any[] = [];
  svc.onEvent((e) => void events.push(e));
  return { svc, prisma, events, audit, getGate: () => gate };
}

beforeEach(() => {
  process.env.ADULT_GATE_ENABLED = 'true';
  process.env.ADULT_ALLOWED_COUNTRIES = 'US,DE';
});
afterEach(() => {
  delete process.env.ADULT_GATE_ENABLED;
  delete process.env.ADULT_ALLOWED_COUNTRIES;
});

describe('isVerifiedAdult', () => {
  it('needs an approved check and a document birth date 18+ today', () => {
    expect(isVerifiedAdult(verified)).toBe(true);
    expect(isVerifiedAdult({ idVerifiedAt: null, verifiedBirthdate: adultDob })).toBe(false);
    expect(isVerifiedAdult({ idVerifiedAt: new Date(), verifiedBirthdate: null })).toBe(false);
    expect(isVerifiedAdult({ idVerifiedAt: new Date(), verifiedBirthdate: new Date('2012-01-01') })).toBe(false);
  });
});

describe('RoomGateService.trigger', () => {
  it('does nothing when the feature is off', async () => {
    delete process.env.ADULT_GATE_ENABLED;
    const { svc, prisma } = setup();
    expect(await svc.trigger('s1', 'VIDEO', 0.9, ['US', 'US'])).toBe('NONE');
    expect(prisma.roomGate.create).not.toHaveBeenCalled();
  });
  it('does nothing for random calls', async () => {
    const { svc, prisma } = setup({ kind: 'RANDOM' });
    expect(await svc.trigger('s1', 'VIDEO', 0.9, ['US', 'US'])).toBe('NONE');
    expect(prisma.roomGate.create).not.toHaveBeenCalled();
  });
  it('pauses the room when someone is not verified, and tells both', async () => {
    const { svc, events, getGate } = setup({ users: [{ ...verified, id: 'a' }, { id: 'b', idVerifiedAt: null, verifiedBirthdate: null }] });
    expect(await svc.trigger('s1', 'VIDEO', 0.9, ['US', 'US'])).toBe('CHANGED');
    expect(getGate().state).toBe('PAUSED_VERIFY');
    expect(events[0]).toMatchObject({ type: 'PAUSED', verified: { a: true, b: false } });
    expect(await svc.isHeld('s1')).toBe(true);
  });
  it('blocks straight away when a known country is not allowed', async () => {
    const { svc, events, getGate } = setup({ users: [{ ...verified, id: 'a' }, { id: 'b', idVerifiedAt: null, verifiedBirthdate: null }] });
    await svc.trigger('s1', 'VIDEO', 0.9, ['PK', 'US']);
    expect(getGate().state).toBe('BLOCKED');
    expect(events[0].type).toBe('BLOCKED');
  });
  it('resumes at once when both are verified and two kinds of evidence agree', async () => {
    const { svc, getGate } = setup({
      users: [{ ...verified, id: 'a' }, { ...verified, id: 'b' }],
      docs: [{ userId: 'a', documentCountry: 'US' }, { userId: 'b', documentCountry: 'DE' }],
    });
    await svc.trigger('s1', 'VIDEO', 0.9, ['US', 'DE']);
    expect(getGate().state).toBe('RESUMED');
    expect(await svc.isHeld('s1')).toBe(false);
  });
  it('both verified but only an IP to go on: blocked, an IP alone is not enough', async () => {
    const { svc, getGate } = setup({ users: [{ ...verified, id: 'a' }, { ...verified, id: 'b' }], docs: [] });
    await svc.trigger('s1', 'VIDEO', 0.9, ['US', 'US']);
    expect(getGate().state).toBe('BLOCKED');
  });
  it('a second detection in a blocked room ends the call; in a paused one it changes nothing', async () => {
    expect(await setup({ existing: { id: 'g', state: 'BLOCKED' } }).svc.trigger('s1', 'VIDEO', 0.9, ['US', 'US'])).toBe('END');
    expect(await setup({ existing: { id: 'g', state: 'PAUSED_VERIFY' } }).svc.trigger('s1', 'VIDEO', 0.9, ['US', 'US'])).toBe('NONE');
  });
});

describe('RoomGateService transitions', () => {
  const paused = () => ({ id: 'g1', sessionId: 's1', userAId: 'a', userBId: 'b', state: 'PAUSED_VERIFY', pausedAt: new Date() });

  it('a single approval keeps waiting and reports who is still missing', async () => {
    const { svc, events, getGate } = setup({ existing: paused(), users: [{ ...verified, id: 'a' }, { id: 'b', idVerifiedAt: null, verifiedBirthdate: null }] });
    await svc.onIdentityResult('a');
    expect(getGate().state).toBe('PAUSED_VERIFY');
    expect(events[0]).toMatchObject({ type: 'STATUS', verified: { a: true, b: false } });
  });
  it('both approved with two kinds of evidence: the room resumes', async () => {
    const { svc, getGate } = setup({
      existing: paused(),
      users: [{ ...verified, id: 'a' }, { ...verified, id: 'b' }],
      docs: [{ userId: 'a', documentCountry: 'US' }, { userId: 'b', documentCountry: 'US' }],
    });
    // The IP evidence was stored when the room paused; simulate it.
    (svc as any).redis.set('gate:ip:s1', JSON.stringify(['US', 'US']));
    await svc.onIdentityResult('a');
    expect(getGate().state).toBe('RESUMED');
  });
  it('a declined check blocks the room', async () => {
    const { svc, prisma, getGate } = setup({ existing: paused(), users: [] });
    prisma.identityVerification.findFirst.mockResolvedValue({ id: 'v', status: 'DECLINED' });
    await svc.onIdentityResult('b');
    expect(getGate().state).toBe('BLOCKED');
    expect(getGate().reason).toBe('ID_DECLINED');
  });
  it('the person saying no blocks it; a stranger cannot', async () => {
    const { svc, getGate } = setup({ existing: paused() });
    await svc.decline('s1', 'someone-else');
    expect(getGate().state).toBe('PAUSED_VERIFY');
    await svc.decline('s1', 'a');
    expect(getGate().state).toBe('BLOCKED');
  });
  it('an unfinished room is blocked after the timeout, once', async () => {
    const old = { ...paused(), pausedAt: new Date(Date.now() - 20 * 60_000) };
    const { svc, getGate } = setup({ existing: old, users: [] });
    expect(await svc.timeoutTick()).toBe(1);
    expect(getGate().reason).toBe('TIMEOUT');
    expect(await svc.timeoutTick()).toBe(0);
  });
  it('a decided room cannot be moved again (two instances racing)', async () => {
    const { svc, getGate } = setup({ existing: { ...paused(), state: 'RESUMED' } });
    await svc.decline('s1', 'a');
    expect(getGate().state).toBe('RESUMED');
  });
});
