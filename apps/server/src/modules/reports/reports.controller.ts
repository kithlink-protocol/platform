import { Controller, Get, Inject, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import {
  ReportsService,
  resolveReportRange,
} from './reports.service';

function sendCsv(res: Response, name: string, csv: string): void {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${stamp}.csv"`);
  res.send(csv);
}

@UseGuards(SessionGuard, StaffRoleGuard)
@Controller('admin/v1/shelters/:shelterId/reports')
export class AdminReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  @Get('outcomes.csv')
  @RequireStaffRole('viewer')
  async outcomes(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const range = resolveReportRange(query);
    sendCsv(res, 'outcomes', await this.reports.outcomesCsv(principal.user.id, shelterId, range));
  }

  @Get('length-of-stay.csv')
  @RequireStaffRole('viewer')
  async lengthOfStay(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const range = resolveReportRange(query);
    sendCsv(
      res,
      'length-of-stay',
      await this.reports.lengthOfStayCsv(principal.user.id, shelterId, range),
    );
  }

  @Get('checkins.csv')
  @RequireStaffRole('viewer')
  async checkins(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const range = resolveReportRange(query);
    sendCsv(res, 'checkins', await this.reports.checkinsCsv(principal.user.id, shelterId, range));
  }
}
