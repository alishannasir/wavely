import { RegisterDto } from './register.dto';

/** A guest turns into a full account with the same fields as registration. */
export class UpgradeGuestDto extends RegisterDto {}
