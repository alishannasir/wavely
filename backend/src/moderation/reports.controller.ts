import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

interface AuthedRequest {
  user: { userId: string; email: string };
}

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateReportDto) {
    return this.reports.create(req.user.userId, dto);
  }
}
