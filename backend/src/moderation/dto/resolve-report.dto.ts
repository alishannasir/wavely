import { IsIn } from 'class-validator';

export class ResolveReportDto {
  @IsIn(['DISMISS', 'SUSPEND', 'BAN', 'RESTORE'])
  action!: 'DISMISS' | 'SUSPEND' | 'BAN' | 'RESTORE';
}
