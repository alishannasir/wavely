import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { SkipGeo } from '../common/geo/skip-geo.decorator';
import { IdentityService } from './identity.service';
import { RoomGateService } from './room-gate.service';
import { MOCK_SIGNATURE_HEADER, MockIdentityProvider } from './mock.provider';

interface AuthedRequest {
  user: { userId: string };
}

class MockCompleteDto {
  @IsString() @MaxLength(80) @Matches(/^mock_[A-Za-z0-9-]+$/) ref!: string;
  @IsIn(['approve', 'decline']) outcome!: 'approve' | 'decline';
  @IsOptional() @IsIn(['MALE', 'FEMALE']) sex?: 'MALE' | 'FEMALE';
  @IsOptional() @IsString() @MaxLength(10) birthdate?: string; // YYYY-MM-DD
  @IsOptional() @IsString() @MaxLength(2) country?: string;
}

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly gate: RoomGateService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('sessions')
  start(@Req() req: AuthedRequest) {
    return this.identity.createSession(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.identity.statusFor(req.user.userId);
  }

  /** The popup asks this after a page reload. */
  @UseGuards(AuthGuard('jwt'))
  @Get('gate/:sessionId')
  gateStatus(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    return this.gate.statusFor(sessionId, req.user.userId);
  }

  // Machine endpoint: no login, authenticity is the provider's signature on the raw body.
  @SkipGeo()
  @SkipThrottle()
  @Post('webhook/:provider')
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, unknown>) {
    return this.identity.handleWebhook(provider, req.rawBody as Buffer, headers);
  }

  /** Development only: plays the part of the provider so the whole flow can be tried without a real one. */
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mock/complete')
  async mockComplete(@Req() req: AuthedRequest, @Body() dto: MockCompleteDto) {
    if (process.env.NODE_ENV === 'production' || (process.env.IDENTITY_PROVIDER ?? 'mock') !== 'mock') throw new ForbiddenException();
    const approve = dto.outcome === 'approve';
    if (approve && !dto.birthdate) throw new BadRequestException('birthdate is required to approve');
    const body = JSON.stringify({
      eventId: randomUUID(),
      providerRef: dto.ref,
      status: approve ? 'APPROVED' : 'DECLINED',
      reasonCode: approve ? undefined : 'MOCK_DECLINED',
      sex: dto.sex,
      birthdate: dto.birthdate,
      documentCountry: dto.country,
    });
    const raw = Buffer.from(body);
    await this.identity.handleWebhook('mock', raw, { [MOCK_SIGNATURE_HEADER]: MockIdentityProvider.sign(raw) });
    return { ok: true };
  }
}
