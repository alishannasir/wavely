import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requireJwtSecret } from '../config/jwt.config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AccountService } from '../account/account.service';
import { DataRightsService } from '../account/data-rights.service';
import { PaymentsModule } from '../payments/payments.module';
import { EmailTokensService } from '../account/email-tokens.service';
import { SessionTokenService } from '../account/session-token.service';

@Module({
  imports: [
    PassportModule,
    PaymentsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireJwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, AccountService, DataRightsService, EmailTokensService, SessionTokenService],
  exports: [AuthService, AccountService, DataRightsService, SessionTokenService],
})
export class AuthModule {}
