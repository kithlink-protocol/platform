import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  addApplicationNoteSchema,
  applicationDecisionSchema,
  createApplicationSchema,
  staffApplicationListQuerySchema,
} from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { ApplicationsService } from './applications.service';

@UseGuards(SessionGuard)
@Controller('app/v1')
export class AppApplicationsController {
  constructor(
    @Inject(ApplicationsService) private readonly applications: ApplicationsService,
  ) {}

  @Post('applications')
  create(@Principal() principal: Principal, @Body() body: unknown) {
    const input = createApplicationSchema.parse(body);
    return this.applications.create(principal.user.id, input);
  }

  @Get('me/applications')
  listMine(@Principal() principal: Principal) {
    return this.applications.listMine(principal.user.id);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@Controller('admin/v1/shelters/:shelterId/applications')
export class AdminApplicationsController {
  constructor(
    @Inject(ApplicationsService) private readonly applications: ApplicationsService,
  ) {}

  @Get()
  @RequireStaffRole('viewer')
  list(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Query() query: unknown,
  ) {
    const q = staffApplicationListQuerySchema.parse(query);
    return this.applications.staffList(principal.user.id, shelterId, q);
  }

  @Patch(':id/status')
  @RequireStaffRole('coordinator')
  decide(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = applicationDecisionSchema.parse(body);
    return this.applications.decide(principal.user.id, shelterId, id, input);
  }

  @Get(':id/applicant-history')
  @RequireStaffRole('viewer')
  applicantHistory(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.applications.staffGetApplicantHistory(principal.user.id, shelterId, id);
  }

  @Get(':id/notes')
  @RequireStaffRole('viewer')
  listNotes(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.applications.staffListNotes(principal.user.id, shelterId, id);
  }

  @Post(':id/notes')
  @RequireStaffRole('coordinator')
  addNote(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = addApplicationNoteSchema.parse(body);
    return this.applications.staffAddNote(principal.user.id, shelterId, id, input);
  }
}
