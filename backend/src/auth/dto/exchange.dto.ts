import { IsString, Length } from 'class-validator';

export class ExchangeDto {
  @IsString()
  @Length(20, 128)
  code!: string;
}
