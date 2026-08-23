import { Controller, Delete, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { Principal } from '../../common/principal';
import { SessionGuard } from '../../common/session.guard';
import { ConsentsService } from './consents.service';

@UseGuards(SessionGuard)
@Controller('app/v1/me/consents')
export class ConsentsController {
  constructor(
    @Inject(ConsentsService) private readonly consents: ConsentsService,
  ) {}

  @Get()
  list(@Principal() principal: Principal) {
    return this.consents.listMine(principal.user.id);
  }

  @Delete(':id')
  async revoke(@Principal() principal: Principal, @Param('id') id: string) {
    await this.consents.revoke(principal.user.id, id);
    return { revoked: true };
  }
}
