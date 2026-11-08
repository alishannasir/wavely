import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsAvatar } from '../../common/avatar';

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) // "  " is not a name
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  displayName?: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  /** null removes the photo; leaving it out keeps the current one. */
  @IsOptional()
  @IsAvatar()
  avatarUrl?: string | null;
}
