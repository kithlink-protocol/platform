import { Body, Controller, Get, Inject, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  addApplicationNoteSchema,
  applicationDecisionSchema,
  createApplicationSchema,
  saveChecklistStateSchema,
  saveReviewChecklistSchema,
  saveTaskTemplatesSchema,
  staffApplicationListQuerySchema,
  upsertDecisionTemplatesSchema,
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

  @Get(':id/checklist')
  @RequireStaffRole('viewer')
  getChecklist(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.applications.staffGetApplicationChecklist(principal.user.id, shelterId, id);
  }

  @Put(':id/checklist')
  @RequireStaffRole('coordinator')
  saveChecklistState(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = saveChecklistStateSchema.parse(body);
    return this.applications.staffSaveApplicationChecklist(principal.user.id, shelterId, id, input);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@Controller('admin/v1/shelters/:shelterId')
export class AdminShelterReviewController {
  constructor(
    @Inject(ApplicationsService) private readonly applications: ApplicationsService,
  ) {}

  @Get('review-checklist')
  @RequireStaffRole('viewer')
  getChecklist(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.applications.staffGetChecklist(principal.user.id, shelterId);
  }

  @Put('review-checklist')
  @RequireStaffRole('admin')
  saveChecklist(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = saveReviewChecklistSchema.parse(body);
    return this.applications.staffSaveChecklist(principal.user.id, shelterId, input);
  }

  @Get('stats')
  @RequireStaffRole('viewer')
  stats(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.applications.staffGetStats(principal.user.id, shelterId);
  }

  @Get('decision-templates')
  @RequireStaffRole('viewer')
  getDecisionTemplates(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.applications.staffGetDecisionTemplates(principal.user.id, shelterId);
  }

  @Put('decision-templates')
  @RequireStaffRole('admin')
  saveDecisionTemplates(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = upsertDecisionTemplatesSchema.parse(body);
    return this.applications.staffSaveDecisionTemplates(principal.user.id, shelterId, input);
  }

  @Get('task-templates')
  @RequireStaffRole('viewer')
  getTaskTemplates(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.applications.staffGetTaskTemplates(principal.user.id, shelterId);
  }

  @Put('task-templates')
  @RequireStaffRole('admin')
  saveTaskTemplates(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = saveTaskTemplatesSchema.parse(body);
    return this.applications.staffSaveTaskTemplates(principal.user.id, shelterId, input);
  }
}
