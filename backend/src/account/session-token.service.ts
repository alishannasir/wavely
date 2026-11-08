import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';

/**
 * What the browser gets about the signed-in user: only what the screens use. Moderation state (flaggedUntil, status),
 * the last IP and device, token version and the password hash stay on the server. A whitelist, so a column added to
 * the table later does not leak by default.
 */
export function sanitizeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    isGuest: user.isGuest,
    role: user.role,
    authProvider: user.authProvider,
    emailVerifiedAt: user.emailVerifiedAt,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    birthdate: user.birthdate,
    gender: user.gender,
    country: user.country,
    createdAt: user.createdAt,
    trialEndsAt: user.trialEndsAt,
    currentStreak: user.currentStreak,
    creditCents: user.creditCents,
    rulesAcceptedAt: user.rulesAcceptedAt,
  };
}

/** The person's own data for the download-my-data export: everything except secrets. */
export function exportUser(user: User) {
  const { passwordHash: _ph, tokenVersion: _tv, deletedAt: _d, ...rest } = user;
  return rest;
}

/**
 * Issues login tokens. `tv` is the user's tokenVersion: changing the password or email bumps it, which
 * makes every older token (on all devices) stop working. Guests and old tokens have no `tv` (= 0).
 */
@Injectable()
export class SessionTokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(user: User) {
    return {
      access_token: this.jwt.sign({ sub: user.id, email: user.email ?? undefined, tv: user.tokenVersion, jti: randomUUID() }),
      user: sanitizeUser(user),
    };
  }
}
