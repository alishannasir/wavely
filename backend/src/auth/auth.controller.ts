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
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GeoGuard } from '../common/geo/geo.guard';

@Controller('auth')
@UseGuards(GeoGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: { country?: string | null }) {
    return this.auth.register(dto, req.country ?? null);
  }

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
    const { access_token } = await this.auth.oauthLogin(req.user, req.country ?? null);
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontend}/auth/callback?token=${access_token}`);
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
