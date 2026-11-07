import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { changeEmailMail, resetPasswordMail, securityNoticeMail, verifyEmailMail } from '../mail/templates';
import { primaryFrontendUrl } from '../common/cors';
import { EmailTokensService } from './email-tokens.service';
import { SessionTokenService } from './session-token.service';

const link = (path: string, token: string) => `${primaryFrontendUrl()}${path}?token=${token}`;
const INVALID_LINK = 'This link is invalid or has expired. Please request a new one.';

@Injectable()
export class AccountService {
  private readonly log = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: EmailTokensService,
    private readonly mail: MailService,
    private readonly session: SessionTokenService,
  ) {}

  // ---- email verification ----

  /** Sends the verification link right after sign-up. Never throws: signing up must not fail because of mail. */
  async sendVerificationQuietly(user: { id: string; email: string | null; displayName: string | null }) {
    if (!user.email) return;
    try {
      const raw = await this.tokens.issue(user.id, 'VERIFY_EMAIL');
      await this.mail.trySend(verifyEmailMail(user.email, user.displayName, link('/verify-email', raw)));
    } catch (err) {
      this.log.error(`Could not issue a verification link: ${(err as Error).message}`);
    }
  }

  /** "Send it again" button. */
  async resendVerification(userId: string, ip: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.isGuest) throw new BadRequestException('This account has no email address');
    if (user.emailVerifiedAt) throw new BadRequestException('Your email is already verified');
    await this.tokens.checkSendLimit(user.email, ip);
    const raw = await this.tokens.issue(user.id, 'VERIFY_EMAIL');
    await this.mail.send(verifyEmailMail(user.email, user.displayName, link('/verify-email', raw)));
    return { ok: true };
  }

  async verifyEmail(raw: string) {
    const t = await this.tokens.consume('VERIFY_EMAIL', raw);
    if (!t) throw new BadRequestException(INVALID_LINK);
    await this.prisma.user.updateMany({ where: { id: t.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    return { ok: true };
  }

  // ---- forgot / reset / change password ----

  /** Always answers the same way, so nobody can use it to find out which emails have accounts. */
  async forgotPassword(email: string, ip: string | null) {
    await this.tokens.checkSendLimit(email, ip);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.passwordHash && !user.deletedAt) {
      const raw = await this.tokens.issue(user.id, 'RESET_PASSWORD');
      await this.mail.trySend(resetPasswordMail(email, link('/reset-password', raw)));
    }
    return { ok: true };
  }

  async resetPassword(raw: string, newPassword: string) {
    const t = await this.tokens.consume('RESET_PASSWORD', raw);
    if (!t) throw new BadRequestException(INVALID_LINK);
    const user = await this.prisma.user.update({
      where: { id: t.userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        tokenVersion: { increment: 1 }, // signs the account out everywhere
      },
    });
    // They proved they control the mailbox.
    if (!user.emailVerifiedAt) await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    if (user.email) await this.mail.trySend(securityNoticeMail(user.email, 'your password was changed', 'Your password was just reset. You were signed out on all devices.'));
    return { ok: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new BadRequestException('This account signs in with Google and has no password');
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new UnauthorizedException('Your current password is not correct');
    if (current === next) throw new BadRequestException('Choose a password that is different from the current one');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(next, 10), tokenVersion: { increment: 1 } },
    });
    if (updated.email) await this.mail.trySend(securityNoticeMail(updated.email, 'your password was changed', 'Your password was just changed. You were signed out on your other devices.'));
    return this.session.issue(updated); // this device stays signed in with a fresh token
  }

  // ---- change email ----

  async requestEmailChange(userId: string, password: string, newEmail: string, ip: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new BadRequestException('This account signs in with Google; its email cannot be changed here');
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException('Your password is not correct');
    if (newEmail.toLowerCase() === user.email?.toLowerCase()) throw new BadRequestException('That is already your email');
    if (await this.prisma.user.findUnique({ where: { email: newEmail } })) throw new ConflictException('That email is already in use');
    await this.tokens.checkSendLimit(newEmail, ip);
    const raw = await this.tokens.issue(userId, 'CHANGE_EMAIL', newEmail);
    await this.mail.send(changeEmailMail(newEmail, link('/confirm-email', raw)));
    if (user.email) await this.mail.trySend(securityNoticeMail(user.email, 'email change requested', `Someone asked to change the email on your account to ${newEmail}. Nothing changes until that address confirms it.`));
    return { ok: true };
  }

  async confirmEmailChange(raw: string) {
    const t = await this.tokens.consume('CHANGE_EMAIL', raw);
    if (!t?.newEmail) throw new BadRequestException(INVALID_LINK);
    const taken = await this.prisma.user.findUnique({ where: { email: t.newEmail } });
    if (taken && taken.id !== t.userId) throw new ConflictException('That email is already in use');
    const before = await this.prisma.user.findUnique({ where: { id: t.userId }, select: { email: true } });
    await this.prisma.user.update({
      where: { id: t.userId },
      data: { email: t.newEmail, emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    if (before?.email) await this.mail.trySend(securityNoticeMail(before.email, 'your email was changed', `The email on your account is now ${t.newEmail}.`));
    return { ok: true };
  }
}
