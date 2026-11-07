import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Starts Google sign-in and passes our own `state` (the guest-merge token) through to Google and back. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const state = context.switchToHttp().getRequest().query?.state;
    return typeof state === 'string' && state ? { state } : {};
  }
}
