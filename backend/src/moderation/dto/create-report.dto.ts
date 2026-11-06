import { IsIn, IsString } from 'class-validator';

const REASONS = ['NUDITY', 'HARASSMENT', 'MINOR_CONCERN', 'SPAM', 'OTHER'] as const;

export class CreateReportDto {
  @IsString()
  reportedUserId!: string;

  @IsString()
  sessionId!: string;

  @IsIn(REASONS)
  reasonCode!: (typeof REASONS)[number];
}
