export type Sex = 'MALE' | 'FEMALE' | 'OTHER';

/** What every provider's webhook is turned into, so the rest of the app does not care which one is used. */
export interface IdentityEvent {
  /** Unique per delivery at the provider, so a retried webhook is recognised. */
  eventId: string;
  providerRef: string;
  status: 'APPROVED' | 'DECLINED' | 'EXPIRED' | 'REVIEW';
  reasonCode?: string;
  /** Present on APPROVED: read from the verified document, never from the user. */
  sex?: Sex;
  birthdate?: Date;
  documentCountry?: string;
}

export interface IdentityProvider {
  readonly name: string;
  /** Starts a check. `url` is where the browser goes to do it. */
  createSession(userId: string): Promise<{ providerRef: string; url: string }>;
  /** Verifies the webhook's signature and converts it. Throws when the signature is wrong. */
  parseWebhook(raw: Buffer, headers: Record<string, unknown>): IdentityEvent;
}

export const IDENTITY_PROVIDERS = 'IDENTITY_PROVIDERS';
