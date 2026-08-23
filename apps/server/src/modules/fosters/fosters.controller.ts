import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createPlacementSchema,
  fosterCheckInSubmitSchema,
  fosterCheckInViewQuerySchema,
  fosterPlacementListQuerySchema,
  upsertFosterHomeSchema,
} from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { FostersService } from './fosters.service';

/** No session: foster contacts act via the deterministic link key only. */
@Controller('public/v1')
export class PublicFostersController {
  constructor(
    @Inject(FostersService) private readonly fosters: FostersService,
  ) {}

  @Get('foster-checkin')
  view(@Query() query: unknown) {
    const q = fosterCheckInViewQuerySchema.parse(query);
    return this.fosters.publicViewCheckIn(q.fp, q.k);
  }

  @Post('foster-checkin')
  submit(@Body() body: unknown) {
    const input = fosterCheckInSubmitSchema.parse(body);
    return this.fosters.publicSubmitCheckIn(input);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@Controller('admin/v1/shelters/:shelterId/fosters')
export class AdminFostersController {
  constructor(
    @Inject(FostersService) private readonly fosters: FostersService,
  ) {}

  @Get('homes')
  @RequireStaffRole('viewer')
  listHomes(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.fosters.staffListHomes(principal.user.id, shelterId);
  }

  @Post('homes')
  @RequireStaffRole('coordinator')
  createHome(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = upsertFosterHomeSchema.parse(body);
    return this.fosters.staffCreateHome(principal.user.id, shelterId, input);
  }

  @Patch('homes/:id')
  @RequireStaffRole('coordinator')
  updateHome(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = upsertFosterHomeSchema.parse(body);
    return this.fosters.staffUpdateHome(principal.user.id, shelterId, id, input);
  }

  @Get('placements')
  @RequireStaffRole('viewer')
  listPlacements(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Query() query: unknown,
  ) {
    const q = fosterPlacementListQuerySchema.parse(query);
    return this.fosters.staffListPlacements(principal.user.id, shelterId, q);
  }

  @Post('placements')
  @RequireStaffRole('coordinator')
  createPlacement(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = createPlacementSchema.parse(body);
    return this.fosters.staffCreatePlacement(principal.user.id, shelterId, input);
  }

  @Get('placements/:id/updates')
  @RequireStaffRole('viewer')
  listUpdates(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.fosters.staffListUpdates(principal.user.id, shelterId, id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('placements/:id/close')
  @RequireStaffRole('coordinator')
  closePlacement(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.fosters.staffClosePlacement(principal.user.id, shelterId, id);
  }
}
