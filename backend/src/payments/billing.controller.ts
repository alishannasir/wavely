import { Body, Controller, Get, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn } from 'class-validator';
import { StripeService } from './stripe.service';
import { EntitlementsService } from './entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

class CheckoutDto {
  @IsIn(['MONTHLY', 'ANNUAL'])
  plan!: 'MONTHLY' | 'ANNUAL';
}

interface AuthedRequest {
  user: { userId: string; email: string };
}

@Controller('billing')
@UseGuards(AuthGuard('jwt'))
export class BillingController {
  constructor(
    private readonly stripe: StripeService,
    private readonly entitlements: EntitlementsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('checkout')
  checkout(@Req() req: AuthedRequest, @Body() dto: CheckoutDto) {
    return this.stripe.createCheckout(req.user.userId, dto.plan);
  }

  @Post('portal')
  portal(@Req() req: AuthedRequest) {
    return this.stripe.createPortal(req.user.userId);
  }

  @Get('status')
  async status(@Req() req: AuthedRequest) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new NotFoundException('User not found');
    const entitlement = await this.entitlements.entitlementFor(user);
    const usage = await this.entitlements.usageToday(user.id);
    return { ...entitlement, usage, trialEndsAt: user.trialEndsAt };
  }
}
