import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { siteConfigSchema } from '@kithlink/contracts';
import type { TenantContext } from '@kithlink/db';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { SitesService } from './sites.service';

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('viewer')
@Controller('admin/v1/shelters/:shelterId/site')
export class AdminSitesController {
  constructor(@Inject(SitesService) private readonly sites: SitesService) {}

  private ctxOf(principal: Principal, shelterId: string): TenantContext {
    return { userId: principal.user.id, shelterId, roleClass: 'staff' };
  }

  @Get()
  get(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.sites.getConfig(this.ctxOf(principal, shelterId), shelterId);
  }

  @Put('config')
  updateConfig(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = siteConfigSchema.parse(body);
    return this.sites.updateConfig(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      input,
    );
  }

  @Post('publish')
  publish(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.sites.publish(this.ctxOf(principal, shelterId), principal.user.id, shelterId);
  }
}
