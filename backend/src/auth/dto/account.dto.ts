import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class TokenDto {
  @IsString() @MinLength(20) @MaxLength(200) token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(200) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(200) newPassword!: string;
}

export class ChangeEmailDto {
  @IsString() @MaxLength(200) password!: string;
  @IsEmail() newEmail!: string;
}
