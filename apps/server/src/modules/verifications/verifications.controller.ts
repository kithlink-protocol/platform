import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { createVerificationSchema } from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { VerificationsService } from './verifications.service';

@UseGuards(SessionGuard)
@Controller('app/v1/me/artifacts')
export class AppVerificationsController {
  constructor(
    @Inject(VerificationsService) private readonly verifications: VerificationsService,
  ) {}

  @Post(':id/revoke-verifications')
  revoke(@Principal() principal: Principal, @Param('id') id: string) {
    return this.verifications.revokeOwn(principal.user.id, id);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@Controller('admin/v1/shelters/:shelterId')
export class AdminVerificationsController {
  constructor(
    @Inject(VerificationsService) private readonly verifications: VerificationsService,
  ) {}

  @Post('artifacts/:artifactId/verifications')
  @RequireStaffRole('coordinator', 'admin', 'owner')
  create(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
  ) {
    const input = createVerificationSchema.parse(body);
    return this.verifications.create(principal.user.id, shelterId, artifactId, input);
  }

  @Get('applications/:applicationId')
  @RequireStaffRole('viewer')
  applicationDetail(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('applicationId') applicationId: string,
  ) {
    return this.verifications.staffGetApplication(principal.user.id, shelterId, applicationId);
  }
}
