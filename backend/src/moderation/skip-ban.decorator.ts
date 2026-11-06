import { SetMetadata } from '@nestjs/common';

export const SKIP_BAN_CHECK = 'skipBanCheck';
/** For the few routes a banned user must still reach (appeals). Everything else stays blocked. */
export const SkipBanCheck = () => SetMetadata(SKIP_BAN_CHECK, true);
