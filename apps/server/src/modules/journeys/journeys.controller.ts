import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  journeyPublicViewQuerySchema,
  journeyRespondSchema,
  journeyReturnSchema,
  journeyCaseResolveSchema,
  journeySkipSchema,
  type JourneyPublicView,
} from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { JourneysService } from './journeys.service';

/** No session: adopters act via the one-click token link only. */
@Controller('public/v1')
export class PublicJourneysController {
  constructor(
    @Inject(JourneysService) private readonly journeys: JourneysService,
  ) {}

  @Get('journey')
  view(@Query() query: unknown): Promise<JourneyPublicView> {
    const q = journeyPublicViewQuerySchema.parse(query);
    return this.journeys.publicView(q.jt);
  }

  @Post('journey/respond')
  respond(@Body() body: unknown) {
    const input = journeyRespondSchema.parse(body);
    return this.journeys.respond(input);
  }

  @Post('journey/skip')
  skip(@Body() body: unknown) {
    const input = journeySkipSchema.parse(body);
    return this.journeys.skip(input.token);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@Controller('admin/v1/shelters/:shelterId/journeys')
export class AdminJourneysController {
  constructor(
    @Inject(JourneysService) private readonly journeys: JourneysService,
  ) {}

  @Get()
  @RequireStaffRole('viewer')
  list(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.journeys.staffList(principal.user.id, shelterId);
  }

  @Get(':id')
  @RequireStaffRole('viewer')
  detail(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.journeys.staffGet(principal.user.id, shelterId, id);
  }

  @Post('cases/:caseId/resolve')
  @RequireStaffRole('coordinator')
  resolveCase(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
  ) {
    const input = journeyCaseResolveSchema.parse(body);
    return this.journeys.staffResolveCase(principal.user.id, shelterId, caseId, input);
  }

  @Post(':id/return')
  @RequireStaffRole('coordinator')
  returnJourney(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = journeyReturnSchema.parse(body);
    return this.journeys.staffReturnJourney(principal.user.id, shelterId, id, input);
  }
}
