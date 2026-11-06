import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const REASONS = ['NUDITY', 'HARASSMENT', 'MINOR_CONCERN', 'SPAM', 'OTHER'] as const;

export class ChatLogLineDto {
  @IsString()
  @MaxLength(32)
  from!: string;

  @IsString()
  @MaxLength(500)
  text!: string;

  @IsInt()
  at!: number;
}

export class CreateReportDto {
  @IsString()
  reportedUserId!: string;

  @IsString()
  sessionId!: string;

  @IsIn(REASONS)
  reasonCode!: (typeof REASONS)[number];

  // JPEG data URL of the reported user's video frame (~480px wide, quality 0.6).
  @IsOptional()
  @IsString()
  @MaxLength(600_000)
  @Matches(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
  evidenceImage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChatLogLineDto)
  chatLog?: ChatLogLineDto[];
}
