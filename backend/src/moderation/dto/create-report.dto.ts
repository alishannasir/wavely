import { IsIn, IsOptional, IsString } from 'class-validator';

const REASONS = ['NUDITY', 'HARASSMENT', 'MINOR_CONCERN', 'SPAM', 'OTHER'] as const;

export class CreateReportDto {
  @IsString()
  reportedUserId!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsIn(REASONS)
  reasonCode!: (typeof REASONS)[number];
}
