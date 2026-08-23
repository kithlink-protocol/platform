import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  artifactInitUploadResponseSchema,
  artifactInitUploadSchema,
  artifactManualExtractSchema,
  uploadCompleteSchema,
} from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import { ArtifactsService } from './artifacts.service';

@UseGuards(SessionGuard)
@Controller('app/v1/me/artifacts')
export class AppArtifactsController {
  constructor(
    @Inject(ArtifactsService) private readonly artifacts: ArtifactsService,
  ) {}

  @Post()
  async initUpload(@Principal() principal: Principal, @Body() body: unknown) {
    const input = artifactInitUploadSchema.parse(body);
    const result = await this.artifacts.initUpload(principal.user.id, input);
    return artifactInitUploadResponseSchema.parse({
      artifact: result.artifact,
      upload: { url: result.uploadUrl, fields: result.fields, expiresIn: result.expiresIn },
    });
  }

  @Post(':id/upload-complete')
  async uploadComplete(
    @Principal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = uploadCompleteSchema.parse(body);
    return this.artifacts.uploadComplete(principal.user.id, id, input);
  }

  @Get()
  list(
    @Principal() principal: Principal,
    @Query() query: Record<string, string>,
  ) {
    const includeVerifications = query.includeVerifications === 'true' || query.includeVerifications === '1';
    return this.artifacts.listMine(principal.user.id, includeVerifications);
  }

  @Get(':id/file')
  async getFile(
    @Principal() principal: Principal,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, mime } = await this.artifacts.getFileOwn(principal.user.id, id);
    res
      .type(mime)
      .setHeader('Content-Disposition', `attachment; filename="artifact-${id}"`)
      .send(buffer);
  }

  @Patch(':id/manual-extract')
  manualExtract(
    @Principal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = artifactManualExtractSchema.parse(body);
    return this.artifacts.manualExtract(principal.user.id, id, input.extracted);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('viewer')
@Controller('admin/v1/shelters/:shelterId/artifacts')
export class AdminArtifactsController {
  constructor(
    @Inject(ArtifactsService) private readonly artifacts: ArtifactsService,
  ) {}

  @Get()
  list(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Query() query: Record<string, string>,
  ) {
    if (!query.applicantId) throw new NotFoundException('applicantId query parameter is required');
    return this.artifacts.staffList(shelterId, principal.user.id, query.applicantId);
  }

  @Get(':id/file')
  async getFile(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, mime } = await this.artifacts.staffGetFile(shelterId, id, principal.user.id);
    res
      .type(mime)
      .setHeader('Content-Disposition', `attachment; filename="artifact-${id}"`)
      .send(buffer);
  }
}
