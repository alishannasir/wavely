import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const num = () => Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)));

export class ReportListQuery {
  @IsOptional() @IsIn(['OPEN', 'REVIEWING', 'RESOLVED']) status?: 'OPEN' | 'REVIEWING' | 'RESOLVED';
  @IsOptional() @IsIn(['NUDITY', 'HARASSMENT', 'MINOR_CONCERN', 'SPAM', 'OTHER']) reason?: string;
  @IsOptional() @IsIn(['USER', 'AUTO_NSFW']) source?: string;
  /** "true" = only reports under legal hold. */
  @IsOptional() @IsIn(['true', 'false']) hold?: string;
  @IsOptional() @num() @IsInt() @Min(0) skip?: number;
  @IsOptional() @num() @IsInt() @Min(1) @Max(100) take?: number;
}

export class EscalateDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class UserStatusDto {
  @IsIn(['SUSPEND', 'BAN', 'RESTORE']) action!: 'SUSPEND' | 'BAN' | 'RESTORE';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SetRoleDto {
  @IsIn(['USER', 'MODERATOR', 'ADMIN']) role!: 'USER' | 'MODERATOR' | 'ADMIN';
}

export class UserSearchQuery {
  @IsString() @MaxLength(100) q!: string;
}

export class AuditQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() targetUserId?: string;
  @IsOptional() @IsString() reportId?: string;
  @IsOptional() @num() @IsInt() @Min(0) skip?: number;
  @IsOptional() @num() @IsInt() @Min(1) @Max(100) take?: number;
}
