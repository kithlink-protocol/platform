import { Controller, Delete, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { uuidSchema } from '@kithlink/contracts';
import { Principal } from '../../common/principal';
import { SessionGuard } from '../../common/session.guard';
import { FavoritesService } from './favorites.service';

@UseGuards(SessionGuard)
@Controller('app/v1/me/favorites')
export class FavoritesController {
  constructor(
    @Inject(FavoritesService) private readonly favorites: FavoritesService,
  ) {}

  @Get()
  list(@Principal() principal: Principal) {
    return this.favorites.list(principal.user.id);
  }

  @Put(':animalId')
  async add(@Principal() principal: Principal, @Param('animalId') animalId: string) {
    uuidSchema.parse(animalId);
    return this.favorites.add(principal.user.id, animalId);
  }

  @HttpCode(204)
  @Delete(':animalId')
  async remove(@Principal() principal: Principal, @Param('animalId') animalId: string): Promise<void> {
    uuidSchema.parse(animalId);
    await this.favorites.remove(principal.user.id, animalId);
  }
}
