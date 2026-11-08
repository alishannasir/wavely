import { IsDateString, IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../common/normalize';

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only reads the first 72 bytes
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  displayName!: string;

  @IsDateString()
  birthdate!: string;

  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender!: 'MALE' | 'FEMALE' | 'OTHER';
}
