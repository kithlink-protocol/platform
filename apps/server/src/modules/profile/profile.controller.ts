import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { upsertApplicantProfileSchema } from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { SessionGuard } from '../../common/session.guard';
import { ProfileService } from './profile.service';

@UseGuards(SessionGuard)
@Controller('app/v1/me/profile')
export class ProfileController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
  ) {}

  @Put()
  async upsert(@Principal() principal: Principal, @Body() body: unknown) {
    const input = upsertApplicantProfileSchema.parse(body);
    return this.profiles.upsertMe(principal.user.id, input);
  }

  @Get()
  async get(@Principal() principal: Principal) {
    return this.profiles.getMe(principal.user.id);
  }
}
