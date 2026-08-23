import { Body, Controller, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { updateShelterProfileSchema } from '@kithlink/contracts';
import type { TenantContext } from '@kithlink/db';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { SheltersService, type ShelterProfile } from './shelters.service';

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('admin')
@Controller('admin/v1/shelters')
export class AdminSheltersController {
  constructor(
    @Inject(SheltersService) private readonly sheltersService: SheltersService,
  ) {}

  private ctxOf(principal: Principal, shelterId: string): TenantContext {
    return { userId: principal.user.id, shelterId, roleClass: 'staff' };
  }

  @Patch(':shelterId')
  updateProfile(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ): Promise<ShelterProfile> {
    const input = updateShelterProfileSchema.parse(body);
    return this.sheltersService.updateProfile(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      input,
    );
  }
}
