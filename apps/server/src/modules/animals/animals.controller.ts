import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { addObservationSchema, animalCreateSchema, animalListQuerySchema, animalUpdateSchema } from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { RequireStaffRole, StaffRoleGuard } from '../../common/roles';
import { SessionGuard } from '../../common/session.guard';
import type { TenantContext } from '@kithlink/db';
import { AnimalsService, animalPhotoInputSchema } from './animals.service';

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
