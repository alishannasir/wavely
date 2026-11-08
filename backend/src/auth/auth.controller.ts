import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AccountService } from '../account/account.service';
import { GoogleAuthGuard } from './google-auth.guard';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';
import { clearOauthCookie, readOauthCookie, verifyOauthState } from './oauth-nonce';
import { ChangeEmailDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, TokenDto } from './dto/account.dto';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ExchangeDto } from './dto/exchange.dto';
import { GuestDto } from './dto/guest.dto';
import { primaryFrontendUrl } from '../common/cors';
import { UpgradeGuestDto } from './dto/upgrade-guest.dto';
import { clientIp, sanitizeDeviceId } from '../common/client-info';

/** Puts the login token in the session cookie as well as in the response body. */
function withSession<T extends { access_token: string }>(res: Response, result: T): T {
  setSessionCookie(res, result.access_token);
  return result;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: { country?: string | null }, @Res({ passthrough: true }) res: Response) {
    return withSession(res, await this.auth.register(dto, req.country ?? null));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('guest')
  async guest(@Body() _dto: GuestDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    return withSession(
      res,
      await this.auth.createGuest({
        ip: clientIp(req.headers, req.socket?.remoteAddress),
        deviceId: sanitizeDeviceId(req.headers['x-device-id']),
        country: req.country ?? null,
      }),
    );
  }

  @Post('upgrade-guest')
  @UseGuards(AuthGuard('jwt'))
  async upgradeGuest(@Req() req: { user: { userId: string } }, @Body() dto: UpgradeGuestDto, @Res({ passthrough: true }) res: Response) {
    return withSession(res, await this.auth.upgradeGuest(req.user.userId, dto));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return withSession(res, await this.auth.login(dto));
  }

  /** Signs out: ends this login on the server (the token is refused from now on) and clears the cookie. */
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const bearer = typeof req.headers?.authorization === 'string' ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null;
    await this.auth.revokeToken(readSessionCookie(req.headers?.cookie) ?? bearer);
    clearSessionCookie(res);
    return { ok: true };
  }

  /** A guest asks for a signed token to carry through Google sign-in (so the guest becomes the Google account). */
  @UseGuards(AuthGuard('jwt'))
  @Post('google/state')
  googleState(@Req() req: { user: { userId: string } }) {
    return this.auth.createGuestMergeState(req.user.userId);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  google() {
    // Redirects to Google via passport.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const frontend = primaryFrontendUrl();
    // The sign-in must come back to the browser that started it (see oauth-nonce.ts).
    const checked = verifyOauthState(req.query?.state, req.headers?.cookie);
    if (!checked) {
      clearOauthCookie(res);
      return res.redirect(`${frontend}/login`);
    }
    const guestId = this.auth.readGuestMergeState(checked.guestState);
    const { user } = await this.auth.oauthLogin(req.user, req.country ?? null, guestId);
    const code = await this.auth.createLoginCode(user.id, checked.nonce);
    res.redirect(`${frontend}/auth/callback?code=${code}`);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('exchange')
  async exchange(@Body() dto: ExchangeDto, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.exchangeLoginCode(dto.code, readOauthCookie(req.headers?.cookie));
    clearOauthCookie(res);
    return withSession(res, result);
  }

  // ---- email verification, password reset, account changes ----

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: TokenDto) {
    return this.account.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'))
  @Post('verify-email/resend')
  resendVerification(@Req() req: any) {
    return this.account.resendVerification(req.user.userId, clientIp(req.headers, req.socket?.remoteAddress));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    return this.account.forgotPassword(dto.email, clientIp(req.headers, req.socket?.remoteAddress));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.account.resetPassword(dto.token, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    return withSession(res, await this.account.changePassword(req.user.userId, dto.currentPassword, dto.newPassword));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'))
  @Post('change-email')
  changeEmail(@Req() req: any, @Body() dto: ChangeEmailDto) {
    return this.account.requestEmailChange(req.user.userId, dto.password, dto.newEmail, clientIp(req.headers, req.socket?.remoteAddress));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('confirm-email-change')
  confirmEmailChange(@Body() dto: TokenDto) {
    return this.account.confirmEmailChange(dto.token);
  }

  @Post('apple')
  apple() {
    // TODO Phase 1.1: wire passport-apple once APPLE_* keys exist (Apple dev account required).
    throw new HttpException(
      'Apple Sign-In is not configured yet. Set APPLE_* env vars and enable the apple strategy.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
