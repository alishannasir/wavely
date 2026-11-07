import { isMailDeliveryConfigured } from '../mail/mail.service';

/**
 * Is a verified email required for friends, messages and payments?
 * By default only when real email delivery is configured (otherwise nobody could ever verify).
 * Override with REQUIRE_EMAIL_VERIFICATION=true|false.
 */
export function isVerificationRequired(): boolean {
  const v = process.env.REQUIRE_EMAIL_VERIFICATION;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return isMailDeliveryConfigured();
}
