import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isOriginAllowed } from './cors';
import { SESSION_COOKIE } from '../auth/session-cookie';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defence in depth against cross-site request forgery for cookie logins: a request that changes data and
 * is authenticated only by the session cookie must come from an allowed website origin. (SameSite=Lax
 * already keeps browsers from sending the cookie cross-site; this also covers browsers that do not.)
 * Requests with an Authorization header are not affected: a header cannot be forged cross-site.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(req.method)) return true;
    if (req.headers.authorization) return true;
    if (!String(req.headers.cookie ?? '').includes(`${SESSION_COOKIE}=`)) return true; // no cookie login: nothing to forge
    const origin = req.headers.origin;
    if (origin === undefined) return true; // not a browser cross-site request
    if (isOriginAllowed(origin)) return true;
    throw new ForbiddenException({ statusCode: 403, code: 'BAD_ORIGIN', message: 'This request came from an untrusted website.' });
  }
}
