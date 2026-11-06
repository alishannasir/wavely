import { Equals } from 'class-validator';

export class GuestDto {
  /** Self-attestation that the user is 18 or older. */
  @Equals(true)
  adult!: boolean;

  /** The user accepted the rules / safety notice. */
  @Equals(true)
  rules!: boolean;
}
