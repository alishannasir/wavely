import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { normalizeEmail } from './normalize';
import { isUniqueViolation } from './prisma-errors';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterDto } from '../auth/dto/register.dto';
import { ChangeEmailDto } from '../auth/dto/account.dto';

describe('email normalisation', () => {
  it('the same address is always the same account: trimmed and lower-cased', () => {
    expect(normalizeEmail('  Bob@Example.COM ')).toBe('bob@example.com');
    expect(normalizeEmail(undefined)).toBeUndefined();
  });
  it('is applied to the sign-in, sign-up and change-email bodies', () => {
    expect(plainToInstance(LoginDto, { email: 'Bob@X.com', password: 'x' }).email).toBe('bob@x.com');
    expect(plainToInstance(ChangeEmailDto, { password: 'x', newEmail: ' New@X.com' }).newEmail).toBe('new@x.com');
  });
});

describe('length limits', () => {
  const ok = { email: 'a@b.co', password: 'longenough1', displayName: 'Al', birthdate: '1990-01-01', gender: 'OTHER' };
  const errors = async (over: object) => (await validate(plainToInstance(RegisterDto, { ...ok, ...over }))).map((e) => e.property);
  it('accepts a normal sign-up', async () => expect(await errors({})).toEqual([]));
  it('rejects a huge display name and a password past what bcrypt reads', async () => {
    expect(await errors({ displayName: 'x'.repeat(33) })).toContain('displayName');
    expect(await errors({ password: 'p'.repeat(73) })).toContain('password');
    expect(await errors({ email: `${'a'.repeat(250)}@b.co` })).toContain('email');
  });
});

describe('unique violations', () => {
  it('recognises Prisma P2002 only', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
