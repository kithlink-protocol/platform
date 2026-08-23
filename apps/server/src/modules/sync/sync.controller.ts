import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { createSyncTargetSchema } from '@kithlink/contracts';
import type { TenantContext } from '@kithlink/db';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { SyncService } from './sync.service';

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('viewer')
@Controller('admin/v1/shelters/:shelterId/sync-targets')
export class AdminSyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  private ctxOf(principal: Principal, shelterId: string): TenantContext {
    return { userId: principal.user.id, shelterId, roleClass: 'staff' };
  }

  @Get()
  list(@Principal() principal: Principal, @Param('shelterId') shelterId: string) {
    return this.sync.listTargets(this.ctxOf(principal, shelterId), shelterId);
  }

  @Put()
  upsert(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = createSyncTargetSchema.parse(body);
    return this.sync.upsertTarget(this.ctxOf(principal, shelterId), principal.user.id, shelterId, input);
  }

  @Post(':provider/run')
  run(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('provider') provider: string,
  ) {
    return this.sync.runManual(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      provider,
    );
  }
}
