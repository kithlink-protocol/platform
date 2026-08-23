import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  addObservationSchema,
  animalCreateSchema,
  animalListQuerySchema,
  animalUpdateSchema,
  uuidSchema,
} from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import type { TenantContext } from '@kithlink/db';
import {
  AnimalsService,
  animalPhotoInputSchema,
  photoPresignInputSchema,
  photoUploadCompleteSchema,
} from './animals.service';

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('viewer')
@Controller('admin/v1/shelters/:shelterId/animals')
export class AdminAnimalsController {
  constructor(
    @Inject(AnimalsService) private readonly animalsService: AnimalsService,
  ) {}

  private ctxOf(principal: Principal, shelterId: string): TenantContext {
    return { userId: principal.user.id, shelterId, roleClass: 'staff' };
  }

  @Get()
  list(@Principal() principal: Principal, @Param('shelterId') shelterId: string, @Query() query: unknown) {
    const q = animalListQuerySchema.parse(query);
    return this.animalsService.list(this.ctxOf(principal, shelterId), shelterId, q);
  }

  @Get(':id')
  async detail(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    const animal = await this.animalsService.getById(this.ctxOf(principal, shelterId), shelterId, id);
    if (!animal) throw new NotFoundException('Animal not found');
    return animal;
  }

  @Post()
  create(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Body() body: unknown,
  ) {
    const input = animalCreateSchema.parse(body);
    return this.animalsService.create(this.ctxOf(principal, shelterId), principal.user.id, shelterId, input);
  }

  @Patch(':id')
  async update(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = animalUpdateSchema.parse(body);
    const animal = await this.animalsService.update(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      id,
      input,
    );
    if (!animal) throw new NotFoundException('Animal not found');
    return animal;
  }

  @Post(':id/photos')
  addPhoto(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = animalPhotoInputSchema.parse(body);
    return this.animalsService.addPhoto(this.ctxOf(principal, shelterId), shelterId, id, input);
  }

  @RequireStaffRole('coordinator')
  @Post(':id/photos/presign')
  presignPhoto(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = photoPresignInputSchema.parse(body);
    return this.animalsService.presignPhoto(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      id,
      input,
    );
  }

  @RequireStaffRole('coordinator')
  @Post(':id/photos/:photoId/upload-complete')
  completePhotoUpload(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Body() body: unknown,
  ) {
    const input = photoUploadCompleteSchema.parse(body);
    return this.animalsService.completePhotoUpload(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      id,
      photoId,
      input,
    );
  }

  @RequireStaffRole('coordinator')
  @HttpCode(204)
  @Delete(':id/photos/:photoId')
  async deletePhoto(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ): Promise<void> {
    await this.animalsService.deletePhoto(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      id,
      photoId,
    );
  }

  @Post(':id/observations')
  addObservation(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = addObservationSchema.parse(body);
    return this.animalsService.addObservation(
      this.ctxOf(principal, shelterId),
      principal.user.id,
      shelterId,
      id,
      input,
    );
  }

  @Get(':id/observations')
  listObservations(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
    @Param('id') id: string,
  ) {
    return this.animalsService.listObservations(this.ctxOf(principal, shelterId), shelterId, id, 50);
  }
}

@UseGuards(SessionGuard, StaffRoleGuard)
@RequireStaffRole('viewer')
@Controller('admin/v1/shelters/:shelterId/sterilization')
export class AdminSterilizationController {
  constructor(
    @Inject(AnimalsService) private readonly animalsService: AnimalsService,
  ) {}

  private ctxOf(principal: Principal, shelterId: string): TenantContext {
    return { userId: principal.user.id, shelterId, roleClass: 'staff' };
  }

  @Get('summary')
  summary(
    @Principal() principal: Principal,
    @Param('shelterId') shelterId: string,
  ) {
    return this.animalsService.sterilizationSummary(this.ctxOf(principal, shelterId), shelterId);
  }
}

@Controller('public/v1/animal-photos')
export class PublicAnimalPhotosController {
  constructor(
    @Inject(AnimalsService) private readonly animalsService: AnimalsService,
  ) {}

  @Get(':photoId')
  async stream(@Param('photoId') photoId: string, @Res() res: Response): Promise<void> {
    uuidSchema.parse(photoId);
    const { buffer, mime } = await this.animalsService.streamPhoto(photoId);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(mime).send(buffer);
  }
}
