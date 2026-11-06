import { SetMetadata } from '@nestjs/common';

export const SKIP_GEO = 'skipGeo';
/** For machine endpoints (e.g. Stripe webhooks) that must not be region-gated. */
export const SkipGeo = () => SetMetadata(SKIP_GEO, true);
