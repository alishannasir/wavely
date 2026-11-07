import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CsrfOriginGuard } from '../common/csrf-origin.guard';
import { SESSION_COOKIE, clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';

const jwt = new JwtService({ secret: 'k'.repeat(40) });

function fakeRes() {
  const calls: any[] = [];
  return { calls, cookie: (...a: any[]) => calls.push(['set', ...a]), clearCookie: (...a: any[]) => calls.push(['clear', ...a]) } as any;
}

describe('session cookie', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('is HttpOnly, SameSite=Lax, site-wide, and lives exactly as long as the token', () => {
    const res = fakeRes();
    setSessionCookie(res, jwt.sign({ sub: 'u' }, { expiresIn: '2h' }));
    const [kind, name, , options] = res.calls[0];
    expect(kind).toBe('set');
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(options.maxAge).toBeGreaterThan(2 * 3600_000 - 5000);
    expect(options.maxAge).toBeLessThanOrEqual(2 * 3600_000);
  });

  it('is Secure in production or when the site is served over https', () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    let res = fakeRes();
    setSessionCookie(res, jwt.sign({ sub: 'u' }));
    expect(res.calls[0][3].secure).toBe(false);
    process.env.FRONTEND_URL = 'https://app.example.com';
    res = fakeRes();
    setSessionCookie(res, jwt.sign({ sub: 'u' }));
    expect(res.calls[0][3].secure).toBe(true);
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.NODE_ENV = 'production';
    res = fakeRes();
    clearSessionCookie(res);
    expect(res.calls[0].slice(0, 2)).toEqual(['clear', SESSION_COOKIE]);
    expect(res.calls[0][2].secure).toBe(true);
  });

  it('reads the cookie out of a raw header (HTTP and websocket handshakes)', () => {
    expect(readSessionCookie(`a=1; ${SESSION_COOKIE}=abc.def.ghi; b=2`)).toBe('abc.def.ghi');
    expect(readSessionCookie(`other_${SESSION_COOKIE}=nope`)).toBeNull(); // a cookie that only ends with the same name
    expect(readSessionCookie(`${SESSION_COOKIE}=`)).toBeNull();
    expect(readSessionCookie('a=1')).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
  });
});

describe('CsrfOriginGuard', () => {
  const guard = new CsrfOriginGuard();
  const ctx = (req: any) => ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) }) as any;
  const cookie = `${SESSION_COOKIE}=x`;
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('lets reads, header logins, cookie-less requests and non-browser requests through', () => {
    expect(guard.canActivate(ctx({ method: 'GET', headers: { cookie, origin: 'https://evil.example' } }))).toBe(true);
    expect(guard.canActivate(ctx({ method: 'POST', headers: { authorization: 'Bearer t', origin: 'https://evil.example' } }))).toBe(true);
    expect(guard.canActivate(ctx({ method: 'POST', headers: { origin: 'https://evil.example' } }))).toBe(true);
    expect(guard.canActivate(ctx({ method: 'POST', headers: { cookie } }))).toBe(true); // no Origin header at all
  });

  it('rejects a data-changing request that carries the cookie from an untrusted website', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://app.example.com';
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(() => guard.canActivate(ctx({ method, headers: { cookie, origin: 'https://evil.example' } }))).toThrow(ForbiddenException);
    }
    expect(guard.canActivate(ctx({ method: 'POST', headers: { cookie, origin: 'https://app.example.com' } }))).toBe(true);
  });

  it('does not apply to websocket contexts', () => {
    expect(guard.canActivate({ getType: () => 'ws' } as any)).toBe(true);
  });
});
