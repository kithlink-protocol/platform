import { Body, Controller, Get, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  searchRentalSchema,
  saveRentalPropertySchema,
  universalApplicationSchema,
} from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { SessionGuard } from '../../common/session.guard';
import { UniversalService } from './universal.service';

@UseGuards(SessionGuard)
@Controller('app/v1/me')
export class MeUniversalController {
  constructor(
    @Inject(UniversalService) private readonly universal: UniversalService,
  ) {}

  @Get('universal-application')
  get(@Principal() principal: Principal) {
    return this.universal.getUniversalApplication(principal.user.id);
  }

  @Put('universal-application')
  save(@Principal() principal: Principal, @Body() body: unknown) {
    const patch = universalApplicationSchema.parse(body);
    return this.universal.saveUniversalApplication(principal.user.id, patch);
  }

  @Post('rental-properties')
  submitRental(@Principal() principal: Principal, @Body() body: unknown) {
    const input = saveRentalPropertySchema.parse(body);
    return this.universal.saveRentalProperty(principal.user.id, input);
  }
}

@Controller('public/v1/rental-properties')
export class PublicRentalsController {
  constructor(
    @Inject(UniversalService) private readonly universal: UniversalService,
  ) {}

  @Get('search')
  search(@Query() query: unknown) {
    const q = searchRentalSchema.parse(query);
    return this.universal.searchRentalProperties(q);
  }
}
