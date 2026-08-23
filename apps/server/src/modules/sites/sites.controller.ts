import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { addCustomDomainSchema, siteConfigSchema } from '@kithlink/contracts';
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

  @Post('setup')
  @RequireStaffRole('coordinator')
  setup(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.sites.setupOneClick(this.ctxOf(principal, shelterId), principal.user.id, shelterId);
  }

  @Get('domains')
  @RequireStaffRole('coordinator')
  listDomains(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.sites.listCustomDomains(this.ctxOf(principal, shelterId), shelterId);
  }

  @Post('domains')
  @RequireStaffRole('coordinator')
  addDomain(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = addCustomDomainSchema.parse(body);
    return this.sites.addCustomDomain(this.ctxOf(principal, shelterId), principal.user.id, shelterId, input);
  }

  @Post('domains/:id/verify')
  @RequireStaffRole('coordinator')
  verifyDomain(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.sites.verifyCustomDomain(this.ctxOf(principal, shelterId), principal.user.id, shelterId, id);
  }

  @Delete('domains/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireStaffRole('coordinator')
  deleteDomain(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.sites.deleteCustomDomain(this.ctxOf(principal, shelterId), principal.user.id, shelterId, id);
  }
}
