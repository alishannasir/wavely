import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { startOauth } from './oauth-nonce';

/**
 * Starts Google sign-in. The `state` sent to Google carries a nonce that is also set as a cookie (so the way back can
 * be tied to this browser), followed by the guest-merge token when a guest is signing in.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const http = context.switchToHttp();
    const guestState = http.getRequest().query?.state;
    return { state: startOauth(http.getResponse(), typeof guestState === 'string' ? guestState : undefined) };
  }
}
