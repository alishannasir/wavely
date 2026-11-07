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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: { country?: string | null }) {
    return this.auth.register(dto, req.country ?? null);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('guest')
  guest(@Body() _dto: GuestDto, @Req() req: any) {
    return this.auth.createGuest({
      ip: clientIp(req.headers, req.socket?.remoteAddress),
      deviceId: sanitizeDeviceId(req.headers['x-device-id']),
      country: req.country ?? null,
    });
  }

  @Post('upgrade-guest')
  @UseGuards(AuthGuard('jwt'))
  upgradeGuest(@Req() req: { user: { userId: string } }, @Body() dto: UpgradeGuestDto) {
    return this.auth.upgradeGuest(req.user.userId, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  google() {
    // Redirects to Google via passport.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const { user } = await this.auth.oauthLogin(req.user, req.country ?? null);
    const code = await this.auth.createLoginCode(user.id);
    const frontend = primaryFrontendUrl();
    res.redirect(`${frontend}/auth/callback?code=${code}`);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('exchange')
  exchange(@Body() dto: ExchangeDto) {
    return this.auth.exchangeLoginCode(dto.code);
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
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.account.changePassword(req.user.userId, dto.currentPassword, dto.newPassword);
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
